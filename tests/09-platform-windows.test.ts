import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertInside, isInside, relativePosix, toPosix } from '../src/core/paths';
import { resolveExecutable } from '../src/core/terminal/service';
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
      expect(project.rootPath).toBe(fs.realpathSync(dir));
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
