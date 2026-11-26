import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { withIndexedProject } from './helpers/core';
import { assessCommand, TerminalService } from '../src/core/terminal/service';
import type { Core } from '../src/core/core';
import { CORE_MODULES } from '../src/shared/types';

let core: Core | null = null;
afterEach(async () => {
  await core?.internalMcp.stop().catch(() => undefined);
  core?.dispose();
  core = null;
});

describe('optional module enable/disable behaviour', () => {
  it('ships core modules enabled and optional modules disabled', async () => {
    const { core: c } = await withIndexedProject('mod-1');
    core = c;
    const states = c.modules.list();
    for (const id of CORE_MODULES) {
      expect(states.find((s) => s.id === id)?.enabled).toBe(true);
    }
    expect(states.find((s) => s.id === 'echoshell')?.enabled).toBe(false);
    expect(states.find((s) => s.id === 'rebuild-studio')?.enabled).toBe(false);
  });

  it('refuses to disable a core module', async () => {
    const { core: c } = await withIndexedProject('mod-2');
    core = c;
    expect(() => c.modules.set('agent-control', false)).toThrow(/cannot be disabled/);
    expect(() => c.modules.set('tracex', false)).toThrow(/cannot be disabled/);
  });

  it('blocks operations when a module is disabled and restores them when enabled', async () => {
    const { core: c, projectId } = await withIndexedProject('mod-3');
    core = c;

    expect(() => c.modules.set('agent-control', false)).toThrow(/cannot be disabled/);
    // Core module stays enabled after the rejected attempt.
    expect(c.modules.isEnabled('agent-control')).toBe(true);

    // Optional module gating is real.
    expect(() => c.terminal.listSessions(projectId)).toThrow(/disabled/);
    c.modules.set('echoshell', true);
    expect(c.terminal.listSessions(projectId)).toEqual([]);
    c.modules.set('echoshell', false);
    expect(() => c.terminal.listSessions(projectId)).toThrow(/disabled/);

    expect(() => c.rebuild.listCaptures(projectId)).toThrow(/disabled/);
    c.modules.set('rebuild-studio', true);
    expect(c.rebuild.listCaptures(projectId)).toEqual([]);
  });

  it('removes command tools from agents when EchoShell is disabled', async () => {
    const { core: c, projectId } = await withIndexedProject('mod-4');
    core = c;
    const agent = c.agents.create({
      projectId,
      name: 'Shell user',
      role: 'tester',
      tools: ['run_command', 'search_symbols'],
      permissions: { canReadFiles: true, canWriteFiles: false, canRunCommands: true, autoApprove: [] },
    });
    expect(c.tools.visibleTools(agent).map((t) => t.name)).not.toContain('run_command');
    c.modules.set('echoshell', true);
    expect(c.tools.visibleTools(agent).map((t) => t.name)).toContain('run_command');
  });

  it('persists module state across a core restart on the same database', async () => {
    const { createCore } = await import('../src/core/core');
    const dataDir = path.join(process.cwd(), '.arqenium-data', 'mod-persist');
    const dbFile = path.join(dataDir, 'arqenium.db');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.rmSync(dbFile, { force: true });
    const first = createCore({ dataDir, dbFile });
    first.modules.set('echoshell', true);
    first.dispose();

    const second = createCore({ dataDir, dbFile });
    expect(second.modules.isEnabled('echoshell')).toBe(true);
    second.dispose();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});

describe('EchoShell: preview, approval, execution safety', () => {
  it('assesses command risk without executing anything', () => {
    expect(assessCommand(['ls', '-la'], '').risk).toBe('low');
    expect(assessCommand(['rm', '-rf', 'src'], '').risk).toBe('high');
    expect(assessCommand(['git', 'push', 'origin', 'main'], '').risk).toBe('high');
    expect(assessCommand(['npm', 'install'], '').risk).toBe('high');
    const blocked = assessCommand(['rm', '-rf', '/'], '');
    expect(blocked.blocked).toBe(true);
    expect(blocked.reasons.join(' ')).toMatch(/recursive delete/);
    expect(assessCommand(['bash', '-c', 'rm x'], '').risk).toBe('high');
    expect(assessCommand(['cat', '../outside'], '').risk).toBe('high');
  });

  it('parses command lines without invoking a shell and rejects shell operators', () => {
    expect(TerminalService.parseCommandLine('npm run test -- --watch')).toEqual(['npm', 'run', 'test', '--', '--watch']);
    expect(TerminalService.parseCommandLine('echo "hello world"')).toEqual(['echo', 'hello world']);
    expect(() => TerminalService.parseCommandLine('ls | wc -l')).toThrow(/Shell operators/);
    expect(() => TerminalService.parseCommandLine('echo "unterminated')).toThrow(/Unterminated quote/);
  });

  it('previews, gates and then executes an approved command inside the project', async () => {
    const { core: c, projectId } = await withIndexedProject('term-1');
    core = c;
    c.modules.set('echoshell', true);
    const session = c.terminal.createSession({ projectId, name: 'test' });

    const preview = c.terminal.preview({ projectId, sessionId: session.id, command: 'ls src' });
    expect(preview.risk).toBe('low');
    expect(preview.blocked).toBe(false);
    expect(preview.cwd.endsWith('fixture-app')).toBe(true);
    expect(preview.approvalId).toBeTruthy();

    // Without approval nothing runs.
    await expect(c.terminal.execute(preview.approvalId)).rejects.toThrow(/pending/);

    c.approvals.decide(preview.approvalId, { approved: true, decidedBy: 'test' });
    const result = await c.terminal.execute(preview.approvalId);
    expect(result.status).toBe('ok');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('index.ts');
    expect(result.approvalId).toBe(preview.approvalId);

    const history = c.terminal.history(projectId);
    expect(history).toHaveLength(1);
    expect(history[0].argv).toEqual(['ls', 'src']);
  });

  it('does not run a denied command', async () => {
    const { core: c, projectId } = await withIndexedProject('term-2');
    core = c;
    c.modules.set('echoshell', true);
    const preview = c.terminal.preview({ projectId, command: 'node --version' });
    c.approvals.decide(preview.approvalId, { approved: false, decidedBy: 'test' });
    await expect(c.terminal.execute(preview.approvalId)).rejects.toThrow(/denied/);
    expect(c.terminal.history(projectId)).toHaveLength(0);
  });

  it('refuses blocked commands even with an approval', async () => {
    const { core: c, projectId } = await withIndexedProject('term-3');
    core = c;
    c.modules.set('echoshell', true);
    const preview = c.terminal.preview({ projectId, command: 'rm -rf /' });
    expect(preview.blocked).toBe(true);
    c.approvals.decide(preview.approvalId, { approved: true, decidedBy: 'test' });
    await expect(c.terminal.execute(preview.approvalId)).rejects.toThrow(/blocked/);
  });

  it('keeps the working directory inside the project', async () => {
    const { core: c, projectId } = await withIndexedProject('term-4');
    core = c;
    c.modules.set('echoshell', true);
    expect(() => c.terminal.createSession({ projectId, cwd: '../../..' })).toThrow(/escapes the project root/);
    expect(() => c.terminal.createSession({ projectId, cwd: 'src' })).not.toThrow();
  });

  it('explains commands locally without a model', async () => {
    const { core: c, projectId } = await withIndexedProject('term-5');
    core = c;
    const explanation = c.terminal.explain('git status');
    expect(explanation.risk).toBe('low');
    expect(explanation.explanation).toMatch(/version control/);
    expect(explanation.explanation).toMatch(/read-only/);
    const risky = c.terminal.explain('rm -rf build');
    expect(risky.risk).toBe('high');
    void projectId;
  });
});

describe('Rebuild Studio', () => {
  function syntheticReference(): Buffer {
    const W = 480;
    const H = 320;
    const png = new PNG({ width: W, height: H });
    const bg = [12, 14, 18];
    const band = [22, 26, 33];
    const accent = [53, 200, 216];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let c = bg;
        if (y < 56) c = band;
        if (y >= 240 && y < 280 && x > 40 && x < 180) c = accent;
        png.data[i] = c[0];
        png.data[i + 1] = c[1];
        png.data[i + 2] = c[2];
        png.data[i + 3] = 255;
      }
    }
    return PNG.sync.write(png);
  }

  it('measures real facts from a supplied screenshot', async () => {
    const { core: c, projectId } = await withIndexedProject('rb-1');
    core = c;
    c.modules.set('rebuild-studio', true);

    const capture = c.rebuild.captureScreenshot({ projectId, name: 'reference.png', buffer: syntheticReference(), mime: 'image/png' });
    expect((capture.meta as { width: number }).width).toBe(480);

    const analysis = c.rebuild.analyze(capture.id);
    const facts = analysis.extracted as { dominantBackground: string; palette: Array<{ hex: string; share: number }>; bands: unknown[]; contrastRatio: number };
    expect(facts.dominantBackground).toMatch(/^#0[c-f]/i);
    expect(facts.palette.length).toBeGreaterThan(1);
    expect(facts.palette[0].share).toBeGreaterThan(0.5);
    expect(facts.bands.length).toBeGreaterThan(0);
    expect(facts.contrastRatio).toBeGreaterThan(1);

    const inferred = analysis.inferred as { confidence: string; designTokens: Record<string, string>; layoutModel: string };
    expect(['low', 'medium']).toContain(inferred.confidence);
    expect(Object.keys(inferred.designTokens).length).toBeGreaterThan(4);
    expect(analysis.warnings.length).toBeGreaterThan(0);
  });

  it('rejects unsupported or mismatched image data', async () => {
    const { core: c, projectId } = await withIndexedProject('rb-2');
    core = c;
    c.modules.set('rebuild-studio', true);
    expect(() => c.rebuild.captureScreenshot({ projectId, name: 'bad.png', buffer: Buffer.from('not an image'), mime: 'image/png' })).toThrow(/Unsupported image format/);
    expect(() =>
      c.rebuild.captureScreenshot({ projectId, name: 'mismatch.png', buffer: syntheticReference(), mime: 'image/jpeg' }),
    ).toThrow(/does not match/);
  });

  it('produces a preview and gates the export behind approval', async () => {
    const { core: c, projectId } = await withIndexedProject('rb-3');
    core = c;
    c.modules.set('rebuild-studio', true);
    const capture = c.rebuild.captureScreenshot({ projectId, name: 'reference.png', buffer: syntheticReference(), mime: 'image/png' });
    const analysis = c.rebuild.analyze(capture.id);

    const preview = c.rebuild.preview(analysis.id);
    expect(preview.html).toContain('<!doctype html>');
    expect(preview.html).toContain('estimated reconstruction');
    expect(preview.estimatedFiles.map((f) => f.path)).toEqual(
      expect.arrayContaining([expect.stringContaining('tokens.css'), expect.stringContaining('ANALYSIS.md')]),
    );
    // The analysis markdown must state it is not the original source.
    const md = preview.estimatedFiles.find((f) => f.path.endsWith('.md'))!;
    expect(md.content).toContain('not the original source code');

    const exportPreview = c.rebuild.exportPreview({ analysisId: analysis.id, projectId, targetDir: 'rebuilt' });
    // exportCommit is synchronous and must refuse an undecided approval.
    expect(() => c.rebuild.exportCommit(exportPreview.approvalId)).toThrow(/pending/);

    c.approvals.decide(exportPreview.approvalId, { approved: true, decidedBy: 'test' });
    const written = c.rebuild.exportCommit(exportPreview.approvalId);
    expect(written.written).toHaveLength(3);
    const root = c.projects.get(projectId).rootPath;
    for (const rel of written.written) {
      expect(fs.existsSync(path.join(root, rel))).toBe(true);
    }
    fs.rmSync(path.join(root, 'rebuilt'), { recursive: true, force: true });
  });

  it('refuses to capture private or loopback URLs', async () => {
    const { core: c } = await withIndexedProject('rb-4');
    core = c;
    c.modules.set('rebuild-studio', true);
    await expect(c.rebuild.captureUrl({ projectId: null, url: 'http://127.0.0.1:4319/' })).rejects.toThrow(/private, loopback/);
    await expect(c.rebuild.captureUrl({ projectId: null, url: 'http://localhost/' })).rejects.toThrow(/private, loopback/);
    await expect(c.rebuild.captureUrl({ projectId: null, url: 'http://192.168.1.1/' })).rejects.toThrow(/private, loopback/);
  });
});
