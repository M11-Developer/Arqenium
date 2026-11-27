import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeCore, withIndexedProject } from './helpers/core';
import type { Core } from '../src/core/core';

let core: Core | null = null;

afterEach(() => {
  core?.dispose();
  core = null;
});

describe('project selection, scanning and incremental indexing', () => {
  it('rejects a path that is not a directory', async () => {
    core = makeCore('index-0');
    await expect(core.projects.add('/definitely/not/a/real/path')).rejects.toThrow(/Not a directory/);
  });

  it('refuses to register the same project twice', async () => {
    core = makeCore('index-dup');
    const project = await core.projects.add((await import('./helpers/core')).FIXTURE_APP);
    await expect(core.projects.add(project.rootPath)).rejects.toThrow(/already registered/);
  });

  it('indexes files, symbols, imports and languages from real content', async () => {
    core = makeCore('index-1');
    const project = await core.projects.add((await import('./helpers/core')).FIXTURE_APP);
    const stats = await core.projects.reindex(project.id);

    expect(stats.filesIndexed).toBeGreaterThanOrEqual(8);
    expect(stats.filesFailed).toBe(0);
    expect(stats.symbols).toBeGreaterThan(20);
    expect(stats.edges).toBeGreaterThan(3);
    expect(stats.languages.typescript).toBeGreaterThanOrEqual(5);
    expect(stats.languages.python).toBe(1);

    const state = core.projects.get(project.id);
    expect(state.indexState).toBe('ready');
    expect(state.lastIndexedAt).toBeTruthy();
  });

  it('skips dependency directories, sensitive files and binaries', async () => {
    core = makeCore('index-2');
    const project = await core.projects.add((await import('./helpers/core')).FIXTURE_APP);
    await core.projects.reindex(project.id);
    const files = core.db.prepare('SELECT path FROM indexed_files WHERE project_id = ?').all(project.id) as Array<{ path: string }>;
    const paths = files.map((f) => f.path);
    // The fixture deliberately contains node_modules/prettier and a dummy .env.
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(paths.includes('.env')).toBe(false);
    expect(paths.includes('.env.example')).toBe(true);
  });

  it('extracts real parsed symbols with line numbers and containers', async () => {
    const { core: c, projectId } = await withIndexedProject('index-3');
    core = c;
    // TypeScript goes through the compiler API, which needs no external tool.
    // Python parsing shells out to an interpreter, which a clean Windows runner
    // may not have; that path has its own test below, conditional on the probe.
    const res = c.projects.symbols(projectId, { query: 'createRouter', limit: 10 });
    expect(res.total).toBeGreaterThanOrEqual(1);
    const sym = res.items[0];
    expect(sym.path).toBe('src/lib/router.ts');
    expect(sym.kind).toBe('function');
    expect(sym.line).toBeGreaterThan(0);
    expect(sym.quality).toBe('parsed');

    const iface = c.projects.symbols(projectId, { query: 'Router', limit: 10 });
    expect(iface.items.some((s) => s.kind === 'interface')).toBe(true);
    const method = c.projects.symbols(projectId, { query: 'formatRecord', limit: 10 });
    expect(method.items.some((s) => s.kind === 'function' && s.path === 'src/lib/format.ts')).toBe(true);
  });

  it('parses Python when an interpreter is available, and says so honestly when it is not', async () => {
    const { core: c, projectId } = await withIndexedProject('index-3-py');
    core = c;
    const res = c.projects.symbols(projectId, { query: 'parse_records', limit: 10 });
    const file = c.projects.fileRecord(projectId, 'src/service.py');
    expect(file, 'the Python file must be indexed regardless of parse quality').toBeTruthy();
    if (!file) return;

    if (file.parseQuality === 'parsed') {
      const sym = res.items.find((s) => s.path === 'src/service.py');
      expect(sym, 'parsed Python must expose parse_records').toBeTruthy();
      expect(sym?.quality).toBe('parsed');
      expect(sym?.line).toBeGreaterThan(0);
    } else {
      // No interpreter on this machine: the file is still indexed, and the
      // quality is reported as `none` rather than pretending a parse happened.
      expect(file.parseQuality).toBe('none');
      expect(res.items.filter((s) => s.path === 'src/service.py')).toHaveLength(0);
      expect(c.projects.get(projectId).indexState).toBe('ready');
    }
  });

  it('re-parses only changed files on incremental reindex', async () => {
    core = makeCore('index-4');
    const project = await core.projects.add((await import('./helpers/core')).FIXTURE_APP);
    await core.projects.reindex(project.id);
    const before = core.db.prepare('SELECT id, hash FROM indexed_files WHERE project_id = ? ORDER BY path').all(project.id) as Array<{
      id: string;
      hash: string;
    }>;

    // Touch one file with new content.
    const target = path.join(project.rootPath, 'src/lib/format.ts');
    const original = fs.readFileSync(target, 'utf8');
    try {
      fs.writeFileSync(target, `${original}\nexport const extraMarker = 'incremental-check';\n`);
      const stats = await core.projects.reindex(project.id);
      expect(stats.filesIndexed).toBeGreaterThanOrEqual(8);

      const after = core.db.prepare('SELECT id, hash, path FROM indexed_files WHERE project_id = ? ORDER BY path').all(project.id) as Array<{
        id: string;
        hash: string;
        path: string;
      }>;
      const changed = after.filter((a) => before.find((b) => b.id === a.id)?.hash !== a.hash);
      expect(changed).toHaveLength(1);
      expect(changed[0].path).toBe('src/lib/format.ts');

      const sym = core.projects.symbols(project.id, { query: 'extraMarker', limit: 5 });
      expect(sym.total).toBe(1);
    } finally {
      fs.writeFileSync(target, original);
      await core.projects.reindex(project.id);
    }
  });

  it('drops files that were deleted from disk', async () => {
    core = makeCore('index-5');
    const project = await core.projects.add((await import('./helpers/core')).FIXTURE_APP);
    await core.projects.reindex(project.id);
    const tempFile = path.join(project.rootPath, 'src/temp-extra.ts');
    fs.writeFileSync(tempFile, 'export const tempSymbol = 1;\n');
    await core.projects.reindex(project.id);
    expect(core.projects.symbols(project.id, { query: 'tempSymbol', limit: 5 }).total).toBe(1);

    fs.unlinkSync(tempFile);
    await core.projects.reindex(project.id);
    expect(core.projects.symbols(project.id, { query: 'tempSymbol', limit: 5 }).total).toBe(0);
  });

  it('confines file reads to the project root', async () => {
    const { core: c, projectId } = await withIndexedProject('index-6');
    core = c;
    expect(() => c.projects.resolveWithin(projectId, '../../../etc/passwd')).toThrow(/escapes the project root|absolute/i);
    expect(() => c.projects.readFile(projectId, '/etc/passwd')).toThrow();
    expect(() => c.projects.readFile(projectId, '.env')).toThrow(/sensitive|blocked/i);
    const ok = c.projects.readFile(projectId, 'src/index.ts');
    expect(ok.content).toContain('startServer');
  });
});
