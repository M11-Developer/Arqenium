import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertInside, isInside, relativePosix, toPosix } from '../src/core/paths';
import { resolveExecutable, spawnSpec, execArgv, assessCommand } from '../src/core/terminal/service';
import { createCore } from '../src/core/core';

/**
 * Cross-platform guarantees. These assertions are what make the same build
 * correct on Windows (case-insensitive paths, `.cmd` shims, APPDATA data dir)
 * as well as on POSIX. The case-sensitivity expectations are conditional so
 * the suite is meaningful on every runner.
 */
const winLike = process.platform === 'win32' || process.platform === 'darwin';

describe('path containment is separator- and case-aware', () => {
  const root = path.resolve('/srv/project');

  it('accepts the root itself and its descendants', () => {
    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, path.join(root, 'src', 'index.ts'))).toBe(true);
  });

  it('rejects a sibling directory that merely shares a prefix', () => {
    expect(isInside(root, path.resolve('/srv/project-evil/secret.ts'))).toBe(false);
    expect(isInside(root, path.resolve('/srv/other/file.ts'))).toBe(false);
  });

  it('rejects traversal', () => {
    expect(isInside(root, path.resolve(root, '..', 'etc', 'passwd'))).toBe(false);
    expect(() => assertInside(root, path.resolve(root, '..', 'outside'))).toThrow(/escapes/);
  });

  it('folds case only on case-insensitive filesystems', () => {
    const upper = path.join(root.toUpperCase(), 'SRC', 'Index.TS');
    if (winLike) {
      // C:\Users\... and c:\users\... are the same directory on Windows.
      expect(isInside(root, upper)).toBe(true);
    } else {
      expect(isInside(root, upper)).toBe(false);
    }
  });

  it('normalises backslashes from the renderer into POSIX form', () => {
    expect(toPosix('src\\lib\\router.ts')).toBe('src/lib/router.ts');
    expect(relativePosix(root, path.join(root, 'src', 'a.ts'))).toBe('src/a.ts');
  });
});

describe('containment resolves real paths before comparing', () => {
  it('accepts the short (8.3) spelling of the same directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arq-short-'));
    try {
      fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
      const realDir = fs.realpathSync.native(dir);
      const shortDir = fs.realpathSync.native(dir);
      // On a machine without 8.3 names these are identical, which is fine: the
      // assertion is that both spellings resolve to the same containment result.
      expect(isInside(dir, path.join(shortDir, 'nested'))).toBe(true);
      expect(isInside(realDir, path.join(dir, 'nested'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('still refuses a sibling that shares a prefix after resolution', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'arq-sib-'));
    try {
      const inside = path.join(parent, 'proj');
      const sibling = path.join(parent, 'proj-evil');
      fs.mkdirSync(inside, { recursive: true });
      fs.mkdirSync(sibling, { recursive: true });
      fs.writeFileSync(path.join(sibling, 'secret.txt'), 'no');
      expect(isInside(inside, path.join(sibling, 'secret.txt'))).toBe(false);
      expect(() => assertInside(inside, path.join(sibling, 'secret.txt'))).toThrow(/escapes/);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});

describe('Windows executable resolution', () => {
  it('returns bare names unchanged off Windows', () => {
    if (process.platform !== 'win32') expect(resolveExecutable('npm')).toBe('npm');
  });

  it('never throws for an unknown binary', () => {
    expect(typeof resolveExecutable('definitely-not-installed-xyz')).toBe('string');
  });

  it('leaves explicit paths alone', () => {
    const explicit = path.join('some', 'dir', 'tool');
    expect(resolveExecutable(explicit)).toBe(explicit);
  });

  it('decides how to launch an executable without a shell where possible', () => {
    const spec = spawnSpec(process.execPath);
    if (process.platform === 'win32') {
      // node.exe is a real executable: no cmd.exe, no quoting.
      expect(spec.viaShell).toBe(false);
      expect(spec.command.toLowerCase()).toMatch(/\.exe$/);
    } else {
      expect(spec.viaShell).toBe(false);
      expect(spec.command).toBe(process.execPath);
    }
  });
});

describe('EchoShell executes without a shell', () => {
  it('runs an argument vector and captures stdout', async () => {
    const result = await execArgv(
      [process.execPath, '-e', 'process.stdout.write("hello from argv")'],
      process.cwd(),
      { timeoutMs: 15_000, maxOutputBytes: 64 * 1024 },
    );
    expect(result.status).toBe('ok');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello from argv');
  });

  it('reports a non-zero exit code instead of throwing', async () => {
    const result = await execArgv(
      [process.execPath, '-e', 'process.stderr.write("boom"); process.exit(3)'],
      process.cwd(),
      { timeoutMs: 15_000, maxOutputBytes: 64 * 1024 },
    );
    expect(result.status).toBe('error');
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('boom');
  });

  it('times out and reports it', async () => {
    const result = await execArgv(
      [process.execPath, '-e', 'setTimeout(() => {}, 30000)'],
      process.cwd(),
      { timeoutMs: 800, maxOutputBytes: 64 * 1024 },
    );
    expect(result.status).toBe('timeout');
  });
});

describe('project service works with a real directory on this platform', () => {
  it('indexes a temporary project and rejects escaped paths', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arq-win-'));
    const core = createCore({ inMemory: true, dataDir: dir });
    try {
      fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const a = 1;\nexport function boot() { return a; }\n');
      fs.writeFileSync(path.join(dir, 'src', 'lib', 'util.ts'), "import { boot } from '../index';\nexport const run = () => boot();\n");
      fs.writeFileSync(path.join(dir, 'service.py'), 'def parse_records(x):\n    return x\n');

      const project = await core.projects.add(dir, 'temp-project');
      // Windows CI hands out short (8.3) paths such as RUNNER~1; the service
      // stores the realpath, so compare like with like.
      expect(project.rootPath).toBe(fs.realpathSync.native(dir).replace(/\\/g, path.sep));
      expect(project.name).toBe('temp-project');

      // Paths use the platform separator on disk but POSIX form in the index.
      const file = core.projects.readFile(project.id, 'src/index.ts');
      expect(file.content).toContain('export function boot');
      // `tree()` returns the top level; descendants are reached by expanding a
      // directory, which is exactly what the Projects pane does.
      const tree = core.projects.tree(project.id);
      const paths = tree.map((n) => n.path);
      expect(paths).toContain('src');
      expect(paths).toContain('service.py');
      const src = core.projects.tree(project.id, 'src');
      expect(src.map((n) => n.path)).toContain('src/index.ts');
      expect(src.map((n) => n.path)).toContain('src/lib');

      expect(() => core.projects.readFile(project.id, '../outside.txt')).toThrow(/escapes/i);
      expect(() => core.projects.readFile(project.id, path.resolve(dir, '..', 'nope.txt'))).toThrow();
    } finally {
      await core.dispose();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('data directory follows the host platform convention', () => {
  it('uses APPDATA on Windows, Application Support on macOS, XDG elsewhere', async () => {
    const { resolveDataDir } = await import('../src/core/core');
    const previous = process.env.ARQ_DATA_DIR;
    delete process.env.ARQ_DATA_DIR;
    try {
      const dir = resolveDataDir();
      expect(path.isAbsolute(dir)).toBe(true);
      if (process.platform === 'win32') {
        expect(dir.toLowerCase()).toContain('arqenium');
        expect(dir.toLowerCase()).toMatch(/appdata\\roaming|appdata/);
      } else if (process.platform === 'darwin') {
        expect(dir).toContain(path.join('Library', 'Application Support', 'Arqenium'));
      } else {
        expect(dir.toLowerCase()).toContain('arqenium');
      }
    } finally {
      if (previous === undefined) delete process.env.ARQ_DATA_DIR;
      else process.env.ARQ_DATA_DIR = previous;
    }
  });
});

describe('Windows-shaped commands are assessed like their POSIX equivalents', () => {
  it('treats drive-root deletes and disk tools as refused', () => {
    for (const command of [
      'rd /s /q C:\\',
      'del /f /s /q D:\\',
      'format C:',
      'diskpart',
      'reg delete HKLM\\Software\\Foo /f',
      'vssadmin delete shadows /all',
    ]) {
      const assessment = assessCommand(command.split(/\s+/), '');
      expect(assessment.blocked, `${command} should be blocked`).toBe(true);
    }
  });

  it('flags Windows package managers and shell writes as risky', () => {
    for (const command of ['choco install git', 'winget upgrade --all', 'copy a.txt b.txt', 'icacls . /grant Everyone:F']) {
      const assessment = assessCommand(command.split(/\s+/), '');
      expect(assessment.blocked, `${command} should not be silently allowed`).toBe(false);
      expect(assessment.risk, `${command} should carry risk`).not.toBe('low');
    }
  });
});
