import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { ModuleService } from '../modules';
import { isInside } from '../paths';
import { IgnoreMatcher, isBinaryExt, DEFAULT_IGNORE_PATTERNS } from './ignore';
import type { LanguageRegistry } from './lang/registry';
import type { FileParseResult } from './lang/types';
import { newId, nowIso } from '../../shared/ids';
import type {
  DependencyGraph,
  GitChange,
  ImpactResult,
  IndexedFile,
  IndexStats,
  ParseQuality,
  Project,
  ProjectExclusions,
  SymbolRecord,
} from '../../shared/types';

const execFileP = promisify(execFile);

const DEFAULT_EXCLUSIONS: ProjectExclusions = {
  ignorePatterns: [...DEFAULT_IGNORE_PATTERNS],
  allowPatterns: ['**/.env.example', '**/.env.sample', '**/.env.template'],
  maxFileBytes: 1_500_000,
};

const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc', 'md', 'mdx', 'txt', 'py', 'pyi',
  'java', 'kt', 'kts', 'go', 'rs', 'rb', 'php', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'swift',
  'sql', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'css', 'scss', 'sass', 'less', 'html',
  'htm', 'vue', 'svelte', 'astro', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'graphql', 'gql', 'proto', 'tf', 'dockerfile', 'makefile', 'cmake', 'gradle', 'lua', 'r',
  'jl', 'ex', 'exs', 'erl', 'hrl', 'clj', 'cljs', 'hs', 'ml', 'zig', 'dart', 'gitignore',
  'editorconfig', 'prettierrc', 'eslintrc', 'npmrc', 'properties', 'csv', 'tsv', 'rst', 'tex',
]);

function extOf(p: string): string {
  const base = path.basename(p);
  if (!base.includes('.')) return base.toLowerCase();
  return base.slice(base.lastIndexOf('.') + 1).toLowerCase();
}

function looksTextual(relPath: string): boolean {
  const ext = extOf(relPath);
  return TEXT_EXTENSIONS.has(ext);
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  size?: number;
  children?: TreeNode[];
}

export interface GroundedSummary {
  path: string;
  language: string;
  lines: number;
  bytes: number;
  symbolCount: number;
  importCount: number;
  symbols: Array<{ name: string; kind: string; line: number }>;
  imports: Array<{ moduleSpec: string; resolved: string | null; line: number }>;
  externalImports: string[];
  dependents: string[];
  hasTests: boolean;
  todoCount: number;
  quality: ParseQuality;
  notes: string[];
}

interface DiscoveredFile {
  rel: string;
  bytes: number;
  mtimeMs: number;
}

/**
 * Project intelligence: scanning, incremental indexing, symbol search,
 * dependency graphs, change inspection and impact analysis. All file access is
 * confined to the selected project root.
 */
export class ProjectService {
  private watchers = new Map<string, FSWatcher>();
  private indexing = new Set<string>();
  private dirty = new Set<string>();
  private timers = new Map<string, NodeJS.Timeout>();
  private disposed = false;

  constructor(
    private db: Db,
    private events: EventBus,
    private modules: ModuleService,
    private languages: LanguageRegistry,
    private opts: { watch?: boolean } = {},
  ) {}

  // ---------------------------------------------------------------- lifecycle

  private rowToProject(r: any): Project {
    let exclusions: ProjectExclusions = { ...DEFAULT_EXCLUSIONS };
    try {
      if (r.exclusions && r.exclusions !== '{}') exclusions = { ...parseExclusions(r.exclusions) };
    } catch {
      /* keep default */
    }
    let stats: IndexStats = emptyStats();
    try {
      stats = { ...emptyStats(), ...JSON.parse(r.index_stats ?? '{}') };
    } catch {
      stats = emptyStats();
    }
    return {
      id: r.id,
      name: r.name,
      rootPath: r.root_path,
      status: r.status,
      createdAt: r.created_at,
      lastIndexedAt: r.last_indexed_at,
      indexState: r.index_state,
      indexStats: stats,
      exclusions,
    };
  }

  list(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at').all();
    return rows.map((r) => this.rowToProject(r));
  }

  get(id: string): Project {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) throw new Error(`Project ${id} not found`);
    return this.rowToProject(row);
  }

  getByRoot(rootPath: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE root_path = ?').get(path.resolve(rootPath));
    return row ? this.rowToProject(row) : null;
  }

  async add(rootPath: string, name?: string): Promise<Project> {
    this.modules.requireEnabled('project-intelligence');
    const resolved = path.resolve(rootPath);
    const stat = await fsp.stat(resolved).catch(() => null);
    if (!stat?.isDirectory()) throw new Error(`Not a directory: ${resolved}`);
    const real = await fsp.realpath(resolved);
    if (this.getByRoot(real)) throw new Error(`Project already registered: ${real}`);
    const id = newId('prj');
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO projects (id, name, root_path, status, created_at, index_state, index_stats, exclusions)
         VALUES (?, ?, ?, 'ready', ?, 'idle', ?, ?)`,
      )
      .run(id, name ?? path.basename(real), real, now, JSON.stringify(emptyStats()), JSON.stringify(DEFAULT_EXCLUSIONS));
    this.events.emit({ type: 'project.created', projectId: id, message: `Project ${name ?? path.basename(real)} added`, data: { rootPath: real } });
    if (this.opts.watch !== false) this.startWatcher(id);
    // Kick off indexing in the background; callers can await via reindex().
    void this.reindex(id).catch((err) => {
      this.events.emit({ type: 'project.index.error', projectId: id, severity: 'error', message: String(err) });
    });
    return this.get(id);
  }

  remove(id: string): void {
    const p = this.get(id);
    this.stopWatcher(id);
    for (const t of this.timers.values()) clearTimeout(t);
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    this.events.emit({ type: 'project.removed', projectId: id, message: `Project ${p.name} removed`, data: { rootPath: p.rootPath } });
  }

  update(id: string, patch: { name?: string; exclusions?: ProjectExclusions }): Project {
    const p = this.get(id);
    const name = patch.name ?? p.name;
    const exclusions = patch.exclusions ?? p.exclusions;
    this.db
      .prepare('UPDATE projects SET name = ?, exclusions = ? WHERE id = ?')
      .run(name, JSON.stringify(exclusions), id);
    if (patch.exclusions) void this.reindex(id).catch(() => undefined);
    return this.get(id);
  }

  dispose(): void {
    this.disposed = true;
    for (const id of [...this.watchers.keys()]) this.stopWatcher(id);
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // ------------------------------------------------------------- path safety

  /** Resolve a project-relative path, rejecting traversal and symlink escapes. */
  resolveWithin(projectId: string, relPath: string): string {
    const p = this.get(projectId);
    const rootReal = fs.realpathSync(p.rootPath);
    const rel = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
    if (path.isAbsolute(rel)) throw new Error('Absolute paths are not allowed');
    const abs = path.resolve(rootReal, rel);
    // Case-aware, separator-aware containment: Windows and macOS resolve
    // `SRC/Lib/Router.ts` and `src/lib/router.ts` to the same file.
    if (!isInside(rootReal, abs)) {
      throw new Error('Path escapes the project root');
    }
    if (fs.existsSync(abs)) {
      const real = fs.realpathSync(abs);
      if (!isInside(rootReal, real)) {
        throw new Error('Symlink escapes the project root');
      }
    }
    return abs;
  }

  private assertReadable(projectId: string, relPath: string): string {
    const p = this.get(projectId);
    const matcher = new IgnoreMatcher(p.exclusions.ignorePatterns, p.exclusions.allowPatterns);
    const rel = relPath.replace(/\\/g, '/');
    if (matcher.isBlocked(rel)) {
      throw new Error(`Access to "${rel}" blocked by security policy (sensitive or excluded path)`);
    }
    return this.resolveWithin(projectId, rel);
  }

  // ----------------------------------------------------------------- indexing

  async reindex(projectId: string): Promise<IndexStats> {
    this.modules.requireEnabled('project-intelligence');
    const project = this.get(projectId);
    if (this.indexing.has(projectId)) {
      this.dirty.add(projectId);
      // Wait for the in-flight pass to finish, then run once more if needed.
      while (this.indexing.has(projectId)) await new Promise((r) => setTimeout(r, 50));
      if (!this.dirty.has(projectId)) return this.get(projectId).indexStats;
      return this.reindex(projectId);
    }
    this.indexing.add(projectId);
    const started = Date.now();
    try {
      this.setState(projectId, 'scanning');
      const matcher = new IgnoreMatcher(project.exclusions.ignorePatterns, project.exclusions.allowPatterns);
      const discovered = await this.walk(projectId, project.rootPath, matcher, project.exclusions.maxFileBytes);
      this.setState(projectId, 'indexing', { filesDiscovered: discovered.length });

      const stats: IndexStats = {
        filesDiscovered: discovered.length,
        filesIndexed: 0,
        filesSkipped: 0,
        filesFailed: 0,
        symbols: 0,
        edges: 0,
        languages: {},
      };

      const existingRows = this.db
        .prepare('SELECT id, path, hash, bytes, language, status, parse_quality, error, symbol_count FROM indexed_files WHERE project_id = ?')
        .all(projectId) as Array<{ id: string; path: string; hash: string }>;
      const existingByPath = new Map(existingRows.map((r) => [r.path, r]));
      const seenPaths = new Set<string>();

      const toParse: Array<{ rel: string; source: string; hash: string; bytes: number; mtimeMs: number; fileId: string }> = [];
      const kept: string[] = [];

      for (const file of discovered) {
        seenPaths.add(file.rel);
        const abs = path.join(project.rootPath, file.rel);
        let source: string | null = null;
        let hash = '';
        try {
          const buf = await fsp.readFile(abs);
          if (buf.includes(0)) {
            stats.filesSkipped += 1;
            continue;
          }
          if (buf.length > project.exclusions.maxFileBytes) {
            stats.filesSkipped += 1;
            continue;
          }
          source = buf.toString('utf8');
          hash = crypto.createHash('sha1').update(buf).digest('hex');
        } catch {
          stats.filesFailed += 1;
          continue;
        }

        const prev = existingByPath.get(file.rel);
        if (prev && prev.hash === hash) {
          kept.push(file.rel);
          stats.filesIndexed += 1;
          const row = this.db.prepare('SELECT language FROM indexed_files WHERE id = ?').get(prev.id) as { language: string };
          stats.languages[row.language] = (stats.languages[row.language] ?? 0) + 1;
          continue;
        }

        const fileId = prev?.id ?? newId('file');
        toParse.push({ rel: file.rel, source, hash, bytes: file.bytes, mtimeMs: file.mtimeMs, fileId });
      }

      // Parse in batches so large repositories stay responsive.
      const BATCH = 40;
      let processed = 0;
      for (let i = 0; i < toParse.length; i += BATCH) {
        const batch = toParse.slice(i, i + BATCH);
        const results = await this.parseBatch(projectId, batch);
        const tx = this.db.transaction(() => {
          for (let j = 0; j < batch.length; j++) {
            const item = batch[j];
            const res = results[j];
            this.upsertFile(projectId, item, res, stats);
          }
        });
        tx();
        processed += batch.length;
        if (processed % 200 < BATCH || i + BATCH >= toParse.length) {
          this.setState(projectId, 'indexing', {
            filesDiscovered: discovered.length,
            filesIndexed: stats.filesIndexed + processed,
          });
          this.events.emit({
            type: 'project.index.progress',
            projectId,
            message: `Indexed ${stats.filesIndexed + processed}/${discovered.length} files`,
            data: { processed: stats.filesIndexed + processed, total: discovered.length },
          });
        }
      }

      // Remove files that disappeared or became excluded.
      const removed = existingRows.filter((r) => !seenPaths.has(r.path));
      if (removed.length) {
        const tx = this.db.transaction(() => {
          for (const r of removed) {
            this.db.prepare('DELETE FROM indexed_files WHERE id = ?').run(r.id);
            this.db.prepare('DELETE FROM file_edges WHERE project_id = ? AND from_path = ?').run(projectId, r.path);
          }
        });
        tx();
      }

      // Resolve import edges now that the file set is complete.
      const edgeStats = await this.resolveAllEdges(projectId);
      stats.edges = edgeStats.edges;
      stats.symbols = (this.db.prepare('SELECT COUNT(*) AS c FROM symbols WHERE project_id = ?').get(projectId) as { c: number }).c;
      stats.durationMs = Date.now() - started;

      this.db
        .prepare("UPDATE projects SET index_state = 'ready', index_stats = ?, last_indexed_at = ? WHERE id = ?")
        .run(JSON.stringify(stats), nowIso(), projectId);
      this.events.emit({
        type: 'project.index.completed',
        projectId,
        message: `Indexed ${stats.filesIndexed} files, ${stats.symbols} symbols`,
        durationMs: stats.durationMs,
        data: stats,
      });
      return stats;
    } catch (err) {
      this.setState(projectId, 'error');
      this.events.emit({
        type: 'project.index.error',
        projectId,
        severity: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      this.indexing.delete(projectId);
      if (this.dirty.delete(projectId)) {
        setTimeout(() => void this.reindex(projectId).catch(() => undefined), 100);
      }
    }
  }

  private setState(projectId: string, state: Project['indexState'], statsPatch: Partial<IndexStats> = {}): void {
    const row = this.db.prepare('SELECT index_stats FROM projects WHERE id = ?').get(projectId) as { index_stats: string };
    let stats: IndexStats = emptyStats();
    try {
      stats = { ...emptyStats(), ...JSON.parse(row.index_stats ?? '{}'), ...statsPatch };
    } catch {
      stats = { ...emptyStats(), ...statsPatch };
    }
    this.db
      .prepare('UPDATE projects SET index_state = ?, index_stats = ? WHERE id = ?')
      .run(state, JSON.stringify(stats), projectId);
  }

  private async walk(projectId: string, root: string, matcher: IgnoreMatcher, maxBytes: number): Promise<DiscoveredFile[]> {
    const out: DiscoveredFile[] = [];
    const stack: string[] = [''];
    while (stack.length) {
      const relDir = stack.pop()!;
      const absDir = relDir ? path.join(root, relDir) : root;
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(absDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (matcher.isIgnored(`${rel}/`) || matcher.isIgnored(rel)) continue;
          stack.push(rel);
          continue;
        }
        if (!entry.isFile() && !entry.isSymbolicLink()) continue;
        if (matcher.isBlocked(rel)) continue;
        if (isBinaryExt(rel)) continue;
        try {
          const st = await fsp.stat(path.join(root, rel));
          if (st.size > maxBytes) continue;
          out.push({ rel, bytes: st.size, mtimeMs: Math.round(st.mtimeMs) });
        } catch {
          /* raced with deletion */
        }
      }
    }
    return out;
  }

  private async parseBatch(
    _projectId: string,
    batch: Array<{ rel: string; source: string }>,
  ): Promise<FileParseResult[]> {
    const results: FileParseResult[] = batch.map(() => ({ symbols: [], imports: [], quality: 'none' }));
    const byAdapter = new Map<string, number[]>();
    batch.forEach((b, i) => {
      const adapter = this.languages.forPath(b.rel);
      if (!adapter) return;
      if (!byAdapter.has(adapter.id)) byAdapter.set(adapter.id, []);
      byAdapter.get(adapter.id)!.push(i);
    });
    for (const [adapterId, indices] of byAdapter) {
      const adapter = this.languages.all().find((a) => a.id === adapterId)!;
      const files = indices.map((i) => ({ path: batch[i].rel, source: batch[i].source }));
      const parsed = await adapter.parseBatch(files);
      indices.forEach((idx, j) => {
        results[idx] = parsed[j] ?? { symbols: [], imports: [], quality: 'none', error: 'no result' };
      });
    }
    return results;
  }

  private upsertFile(
    projectId: string,
    item: { rel: string; source: string; hash: string; bytes: number; mtimeMs: number; fileId: string },
    res: FileParseResult,
    stats: IndexStats,
  ): void {
    const adapter = this.languages.forPath(item.rel);
    const language = adapter?.id ?? extOf(item.rel);
    const now = nowIso();
    const status = res.quality === 'none' && res.error ? 'error' : 'indexed';
    if (status === 'error') stats.filesFailed += 1;
    else stats.filesIndexed += 1;
    stats.languages[language] = (stats.languages[language] ?? 0) + 1;

    const exists = this.db.prepare('SELECT 1 FROM indexed_files WHERE id = ?').get(item.fileId);
    if (exists) {
      this.db
        .prepare(
          `UPDATE indexed_files SET path = ?, language = ?, bytes = ?, mtime_ms = ?, hash = ?, status = ?,
             parse_quality = ?, error = ?, symbol_count = ?, updated_at = ? WHERE id = ?`,
        )
        .run(item.rel, language, item.bytes, item.mtimeMs, item.hash, status, res.quality, res.error ?? null, res.symbols.length, now, item.fileId);
      this.db.prepare('DELETE FROM symbols WHERE file_id = ?').run(item.fileId);
      this.db.prepare('DELETE FROM file_edges WHERE project_id = ? AND from_path = ?').run(projectId, item.rel);
    } else {
      this.db
        .prepare(
          `INSERT INTO indexed_files (id, project_id, path, language, bytes, mtime_ms, hash, status, parse_quality, error, symbol_count, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(item.fileId, projectId, item.rel, language, item.bytes, item.mtimeMs, item.hash, status, res.quality, res.error ?? null, res.symbols.length, now);
    }

    for (const sym of res.symbols) {
      this.db
        .prepare(
          `INSERT INTO symbols (id, project_id, file_id, path, name, kind, line, end_line, signature, container, exported, quality)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(newId('sym'), projectId, item.fileId, item.rel, sym.name, sym.kind, sym.line, sym.endLine, sym.signature, sym.container, sym.exported ? 1 : 0, res.quality);
    }

    for (const imp of res.imports) {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO file_edges (id, project_id, from_path, to_path, external, module_spec, kind, resolved, line)
           VALUES (?, ?, ?, NULL, 0, ?, ?, 0, ?)`,
        )
        .run(newId('edge'), projectId, item.rel, imp.moduleSpec, imp.kind, imp.line);
    }
  }

  private async resolveAllEdges(projectId: string): Promise<{ edges: number }> {
    const files = (this.db.prepare('SELECT path FROM indexed_files WHERE project_id = ?').all(projectId) as Array<{ path: string }>).map(
      (r) => r.path,
    );
    const fileSet = new Set(files);
    const edges = this.db
      .prepare('SELECT id, from_path, module_spec, kind FROM file_edges WHERE project_id = ? AND resolved = 0 AND external = 0')
      .all(projectId) as Array<{ id: string; from_path: string; module_spec: string; kind: string }>;

    const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

    const resolveJs = (from: string, spec: string): { to: string | null; external: boolean } => {
      if (!spec.startsWith('.') && !spec.startsWith('/')) return { to: null, external: true };
      const fromDir = path.posix.dirname(from);
      const base = spec.startsWith('/')
        ? path.posix.normalize(spec.slice(1))
        : path.posix.normalize(path.posix.join(fromDir, spec));
      const candidates: string[] = [base];
      for (const e of JS_EXTS) candidates.push(base + e);
      for (const e of JS_EXTS) candidates.push(path.posix.join(base, `index${e}`));
      for (const c of candidates) if (fileSet.has(c)) return { to: c, external: false };
      return { to: null, external: false };
    };

    const resolvePy = (from: string, spec: string): { to: string | null; external: boolean } => {
      const cleaned = spec.replace(/^\./, '');
      const level = (spec.match(/^\.+/)?.[0].length ?? 0);
      if (level === 0 && !cleaned) return { to: null, external: true };
      if (level === 0) {
        // absolute module import: os, numpy, pkg.mod
        const modPath = cleaned.replace(/\./g, '/');
        const candidates = [`${modPath}.py`, `${modPath}/__init__.py`];
        for (const c of candidates) if (fileSet.has(c)) return { to: c, external: false };
        return { to: null, external: true };
      }
      let dir = path.posix.dirname(from);
      for (let i = 1; i < level; i++) dir = path.posix.dirname(dir);
      const modPath = cleaned.replace(/\./g, '/');
      const base = modPath ? path.posix.join(dir, modPath) : dir;
      const candidates = [`${base}.py`, `${base}/__init__.py`];
      for (const c of candidates) if (fileSet.has(c)) return { to: c, external: false };
      return { to: null, external: false };
    };

    const tx = this.db.transaction(() => {
      for (const e of edges) {
        const isPy = e.from_path.endsWith('.py');
        const { to, external } = isPy ? resolvePy(e.from_path, e.module_spec) : resolveJs(e.from_path, e.module_spec);
        this.db
          .prepare('UPDATE file_edges SET to_path = ?, external = ?, resolved = ? WHERE id = ?')
          .run(to, external ? 1 : 0, 1, e.id);
      }
    });
    tx();

    const total = (this.db.prepare('SELECT COUNT(*) AS c FROM file_edges WHERE project_id = ?').get(projectId) as { c: number }).c;
    return { edges: total };
  }

  // ----------------------------------------------------------------- watchers

  startWatcher(projectId: string): void {
    if (this.opts.watch === false || this.watchers.has(projectId) || this.disposed) return;
    let project: Project;
    try {
      project = this.get(projectId);
    } catch {
      return;
    }
    const matcher = new IgnoreMatcher(project.exclusions.ignorePatterns, project.exclusions.allowPatterns);
    const watcher = chokidar.watch(project.rootPath, {
      ignoreInitial: true,
      depth: 12,
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
      ignored: (p: string) => {
        const rel = path.relative(project.rootPath, p).replace(/\\/g, '/');
        if (!rel || rel.startsWith('..')) return false;
        return matcher.isBlocked(rel) || matcher.isIgnored(`${rel}/`);
      },
    });
    const schedule = () => {
      if (this.disposed) return;
      const existing = this.timers.get(projectId);
      if (existing) clearTimeout(existing);
      this.timers.set(
        projectId,
        setTimeout(() => {
          this.timers.delete(projectId);
          void this.reindex(projectId).catch(() => undefined);
        }, 800),
      );
    };
    watcher.on('add', schedule).on('change', schedule).on('unlink', schedule);
    this.watchers.set(projectId, watcher);
  }

  stopWatcher(projectId: string): void {
    const w = this.watchers.get(projectId);
    if (w) {
      void w.close();
      this.watchers.delete(projectId);
    }
    const t = this.timers.get(projectId);
    if (t) {
      clearTimeout(t);
      this.timers.delete(projectId);
    }
  }

  // ---------------------------------------------------------------- queries

  tree(projectId: string, base = ''): TreeNode[] {
    const project = this.get(projectId);
    const matcher = new IgnoreMatcher(project.exclusions.ignorePatterns, project.exclusions.allowPatterns);
    const rootAbs = this.resolveWithin(projectId, base || '.');
    const build = (absDir: string, relDir: string, depth: number): TreeNode[] => {
      if (depth > 10) return [];
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        return [];
      }
      const nodes: TreeNode[] = [];
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (matcher.isBlocked(rel)) continue;
        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            path: rel,
            type: 'dir',
            children: build(path.join(absDir, entry.name), rel, depth + 1),
          });
        } else if (entry.isFile()) {
          let size = 0;
          try {
            size = fs.statSync(path.join(absDir, entry.name)).size;
          } catch {
            /* ignore */
          }
          nodes.push({ name: entry.name, path: rel, type: 'file', size });
        }
      }
      return nodes;
    };
    return build(rootAbs, base ? base.replace(/\\/g, '/').replace(/\/$/, '') : '', 0);
  }

  readFile(projectId: string, relPath: string): { content: string; language: string; truncated: boolean; bytes: number } {
    const abs = this.assertReadable(projectId, relPath);
    if (!looksTextual(relPath)) {
      // Extension is not in the known-text set: only allow it if it truly has no
      // NUL bytes, so archives and images are rejected with a clear message.
      const probe = fs.readFileSync(abs).subarray(0, 4096);
      if (probe.includes(0)) throw new Error(`Binary file cannot be displayed: ${relPath}`);
    }
    const st = fs.statSync(abs);
    const cap = 512 * 1024;
    const fd = fs.openSync(abs, 'r');
    try {
      const size = Math.min(st.size, cap);
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, 0);
      if (buf.includes(0)) throw new Error('Binary file cannot be displayed');
      return {
        content: buf.toString('utf8'),
        language: this.languages.forPath(relPath)?.id ?? extOf(relPath),
        truncated: st.size > cap,
        bytes: st.size,
      };
    } finally {
      fs.closeSync(fd);
    }
  }

  summary(projectId: string, relPath: string): GroundedSummary {
    const project = this.get(projectId);
    const matcher = new IgnoreMatcher(project.exclusions.ignorePatterns, project.exclusions.allowPatterns);
    if (matcher.isBlocked(relPath.replace(/\\/g, '/'))) {
      throw new Error(`Access to "${relPath}" blocked by security policy`);
    }
    const file = this.db
      .prepare('SELECT * FROM indexed_files WHERE project_id = ? AND path = ?')
      .get(projectId, relPath.replace(/\\/g, '/')) as any;
    if (!file) throw new Error(`File not indexed: ${relPath}`);
    const content = this.readFile(projectId, relPath).content;
    const lines = content.split('\n').length;
    const symbols = (
      this.db
        .prepare('SELECT name, kind, line FROM symbols WHERE file_id = ? ORDER BY line LIMIT 40')
        .all(file.id) as Array<{ name: string; kind: string; line: number }>
    ).map((s) => ({ name: s.name, kind: s.kind, line: s.line }));
    const edges = this.db
      .prepare('SELECT module_spec, external, to_path, line FROM file_edges WHERE project_id = ? AND from_path = ? ORDER BY line')
      .all(projectId, file.path) as Array<{ module_spec: string; external: number; to_path: string | null; line: number }>;
    const dependents = (
      this.db
        .prepare('SELECT DISTINCT from_path FROM file_edges WHERE project_id = ? AND to_path = ? ORDER BY from_path')
        .all(projectId, file.path) as Array<{ from_path: string }>
    ).map((r) => r.from_path);
    const todoCount = (content.match(/\b(TODO|FIXME|HACK|XXX)\b/g) ?? []).length;
    const quality = (file.parse_quality ?? file.parseQuality ?? 'parsed') as ParseQuality;
    const notes = [
      'Deterministic summary extracted from indexed source content (no model inference).',
    ];
    if (quality !== 'parsed') notes.push(`Parsing quality is "${quality}": symbol data may be incomplete.`);
    if (file.error) notes.push(`Indexer recorded an error: ${file.error}`);
    if (symbols.length === 0) notes.push('No symbols were extracted from this file.');
    return {
      path: file.path,
      language: file.language,
      lines,
      bytes: file.bytes,
      symbolCount: symbols.length,
      importCount: edges.length,
      symbols,
      imports: edges.map((e) => ({ moduleSpec: e.module_spec, resolved: e.external ? null : e.to_path, line: e.line })),
      externalImports: [...new Set(edges.filter((e) => e.external).map((e) => e.module_spec))],
      dependents,
      hasTests: /(^|\/)(tests?|__tests__|spec)(\/|\.|$)|\.(test|spec)\.[a-z]+$/i.test(file.path),
      todoCount,
      quality,
      notes,
    };
  }

  symbols(
    projectId: string,
    opts: { query?: string; kind?: string; path?: string; limit?: number; offset?: number } = {},
  ): { items: SymbolRecord[]; total: number } {
    const limit = Math.min(opts.limit ?? 100, 1000);
    const offset = opts.offset ?? 0;
    const clauses = ['project_id = ?'];
    const params: unknown[] = [projectId];
    if (opts.kind) {
      clauses.push('kind = ?');
      params.push(opts.kind);
    }
    if (opts.path) {
      clauses.push("path LIKE ? ESCAPE '\\'");
      params.push(`${escapeLike(opts.path)}%`);
    }
    if (opts.query) {
      clauses.push("name LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(opts.query)}%`);
    }
    const where = clauses.join(' AND ');
    const total = (this.db.prepare(`SELECT COUNT(*) AS c FROM symbols WHERE ${where}`).get(...params) as { c: number }).c;
    const rows = this.db
      .prepare(
        `SELECT id, project_id, path, name, kind, line, end_line, signature, container, exported, quality
         FROM symbols WHERE ${where} ORDER BY
           CASE WHEN name = ? THEN 0 WHEN name LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, name LIMIT ? OFFSET ?`,
      )
      .all(...params, opts.query ?? '', opts.query ? `${escapeLike(opts.query)}%` : '', limit, offset) as any[];
    return { items: rows.map(rowToSymbol), total };
  }

  search(projectId: string, query: string, limit = 50): { files: Array<{ path: string; language: string; bytes: number }>; symbols: SymbolRecord[] } {
    const q = `%${escapeLike(query)}%`;
    const files = this.db
      .prepare(
        `SELECT path, language, bytes FROM indexed_files WHERE project_id = ? AND path LIKE ? ESCAPE '\\' ORDER BY
           CASE WHEN path LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, path LIMIT ?`,
      )
      .all(projectId, q, `%/${escapeLike(query)}%`, limit) as Array<{ path: string; language: string; bytes: number }>;
    const symbols = this.symbols(projectId, { query, limit }).items;
    return { files, symbols };
  }

  graph(projectId: string): DependencyGraph {
    const files = this.db
      .prepare('SELECT path, language, symbol_count FROM indexed_files WHERE project_id = ?')
      .all(projectId) as Array<{ path: string; language: string; symbol_count: number }>;
    const edges = this.db
      .prepare('SELECT from_path, to_path, external, module_spec, resolved FROM file_edges WHERE project_id = ?')
      .all(projectId) as Array<{ from_path: string; to_path: string | null; external: number; module_spec: string; resolved: number }>;
    const changed = new Set(this.rawGitChanges(projectId).map((c) => c.path));

    const nodeIds = new Set(files.map((f) => f.path));
    const externalNodes = new Map<string, string>(); // package -> nodeId
    const nodes: DependencyGraph['nodes'] = files.map((f) => ({
      id: f.path,
      path: f.path,
      language: f.language,
      symbolCount: f.symbol_count,
      isTest: isTestPath(f.path),
      changed: changed.has(f.path),
    }));

    const graphEdges: DependencyGraph['edges'] = [];
    for (const e of edges) {
      if (e.external) {
        const pkg = e.module_spec.split('/').slice(0, e.module_spec.startsWith('@') ? 2 : 1).join('/');
        let extId = externalNodes.get(pkg);
        if (!extId) {
          extId = `ext:${pkg}`;
          externalNodes.set(pkg, extId);
          nodes.push({
            id: extId,
            path: pkg,
            language: 'external',
            symbolCount: 0,
            isTest: false,
            changed: false,
            external: true,
          });
        }
        graphEdges.push({ from: e.from_path, to: extId, external: true, resolved: false });
      } else if (e.to_path && nodeIds.has(e.to_path)) {
        graphEdges.push({ from: e.from_path, to: e.to_path, external: false, resolved: e.resolved === 1 });
      }
    }
    return { nodes, edges: graphEdges };
  }

  impact(projectId: string, inputPaths: string[], depth = 3): ImpactResult {
    const normalized = inputPaths.map((p) => p.replace(/\\/g, '/'));
    const edges = this.db
      .prepare('SELECT from_path, to_path FROM file_edges WHERE project_id = ? AND resolved = 1 AND to_path IS NOT NULL')
      .all(projectId) as Array<{ from_path: string; to_path: string }>;
    const reverse = new Map<string, string[]>();
    for (const e of edges) {
      if (!reverse.has(e.to_path)) reverse.set(e.to_path, []);
      reverse.get(e.to_path)!.push(e.from_path);
    }
    const files = new Set(
      (this.db.prepare('SELECT path FROM indexed_files WHERE project_id = ?').all(projectId) as Array<{ path: string }>).map((r) => r.path),
    );

    const result = new Map<string, ImpactResult['affected'][number]>();
    const queue: Array<{ path: string; depth: number; via: string[] }> = normalized.map((p) => ({ path: p, depth: 0, via: [] }));
    const visited = new Set(normalized);
    let truncated = false;

    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.depth >= depth) continue;
      for (const dep of reverse.get(cur.path) ?? []) {
        if (visited.has(dep)) continue;
        visited.add(dep);
        if (result.size >= 500) {
          truncated = true;
          break;
        }
        const via = [...cur.via, cur.path];
        result.set(dep, {
          path: dep,
          depth: cur.depth + 1,
          reason: `imports ${cur.path}`,
          via,
          confidence: 'parsed',
          isTest: isTestPath(dep),
        });
        queue.push({ path: dep, depth: cur.depth + 1, via });
      }
      if (truncated) break;
    }

    // Heuristic: test files named after changed modules.
    for (const src of normalized) {
      const base = path.posix.basename(src).replace(/\.[^.]+$/, '');
      if (!base || base.length < 3) continue;
      for (const f of files) {
        if (!isTestPath(f)) continue;
        if (result.has(f) || normalized.includes(f)) continue;
        if (f.includes(base)) {
          result.set(f, {
            path: f,
            depth: 1,
            reason: `test name matches ${path.posix.basename(src)}`,
            via: [src],
            confidence: 'heuristic',
            isTest: true,
          });
        }
      }
    }

    const affected = [...result.values()].sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
    return {
      source: normalized,
      affected,
      tests: affected.filter((a) => a.isTest).map((a) => a.path),
      truncated,
    };
  }

  async changes(projectId: string): Promise<{ available: boolean; branch: string | null; changes: GitChange[]; message?: string }> {
    const project = this.get(projectId);
    if (!fs.existsSync(path.join(project.rootPath, '.git'))) {
      return { available: false, branch: null, changes: [], message: 'No Git repository detected in this project' };
    }
    try {
      const [branchRes, statusRes] = await Promise.all([
        // `windowsHide` matters on Windows: without it every git probe flashes a
        // console window, which makes the Watcher feel broken.
        execFileP('git', ['-C', project.rootPath, 'rev-parse', '--abbrev-ref', 'HEAD'], {
          timeout: 5000,
          windowsHide: true,
        }).catch(() => null),
        execFileP('git', ['-C', project.rootPath, 'status', '--porcelain=v1', '-uall'], {
          timeout: 8000,
          windowsHide: true,
        }).catch(() => null),
      ]);
      const changes: GitChange[] = [];
      if (statusRes) {
        for (const line of statusRes.stdout.split('\n')) {
          if (!line.trim()) continue;
          const code = line.slice(0, 2);
          const filePath = line.slice(3).trim();
          changes.push({ path: filePath, status: code.trim(), staged: code[0] !== ' ' && code[0] !== '?' });
        }
      }
      return { available: true, branch: branchRes?.stdout.trim() ?? null, changes };
    } catch (err) {
      return { available: false, branch: null, changes: [], message: err instanceof Error ? err.message : String(err) };
    }
  }

  private rawGitChanges(projectId: string): GitChange[] {
    const project = this.get(projectId);
    try {
      const res = execFileSync(
        'git',
        ['-C', project.rootPath, 'status', '--porcelain=v1', '-uall'],
        { timeout: 8000, encoding: 'utf8', windowsHide: true },
      ) as string;
      const changes: GitChange[] = [];
      // Git on Windows emits CRLF; strip the trailing \r so paths stored in the
      // database stay identical to the paths the indexer produces.
      for (const line of res.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const code = line.slice(0, 2);
        changes.push({ path: line.slice(3).trim(), status: code.trim(), staged: code[0] !== ' ' && code[0] !== '?' });
      }
      return changes;
    } catch {
      return [];
    }
  }

  stats(projectId: string): {
    state: Project['indexState'];
    stats: IndexStats;
    languages: ReturnType<LanguageRegistry['report']>;
    files: number;
    symbols: number;
  } {
    const p = this.get(projectId);
    const files = (this.db.prepare('SELECT COUNT(*) AS c FROM indexed_files WHERE project_id = ?').get(projectId) as { c: number }).c;
    const symbols = (this.db.prepare('SELECT COUNT(*) AS c FROM symbols WHERE project_id = ?').get(projectId) as { c: number }).c;
    return { state: p.indexState, stats: p.indexStats, languages: this.languages.report(), files, symbols };
  }

  fileRecord(projectId: string, relPath: string): IndexedFile | null {
    const row = this.db
      .prepare('SELECT * FROM indexed_files WHERE project_id = ? AND path = ?')
      .get(projectId, relPath.replace(/\\/g, '/')) as any;
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      path: row.path,
      language: row.language,
      bytes: row.bytes,
      mtimeMs: row.mtime_ms,
      hash: row.hash,
      status: row.status,
      parseQuality: row.parse_quality,
      error: row.error,
      symbolCount: row.symbol_count,
    };
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function rowToSymbol(r: any): SymbolRecord {
  return {
    id: r.id,
    projectId: r.project_id,
    path: r.path,
    name: r.name,
    kind: r.kind,
    line: r.line,
    endLine: r.end_line,
    signature: r.signature,
    container: r.container,
    exported: r.exported === 1,
    quality: r.quality,
  };
}

export function isTestPath(p: string): boolean {
  return /(^|\/)(tests?|__tests__|spec)(\/|$)/i.test(p) || /\.(test|spec)\.[a-z]+$/i.test(p) || /(^|\/)test_[^/]+\.py$/i.test(p) || /_test\.py$/i.test(p);
}

function emptyStats(): IndexStats {
  return {
    filesDiscovered: 0,
    filesIndexed: 0,
    filesSkipped: 0,
    filesFailed: 0,
    symbols: 0,
    edges: 0,
    languages: {},
  };
}

function parseExclusions(json: string): ProjectExclusions {
  const parsed = JSON.parse(json) as Partial<ProjectExclusions>;
  return {
    ignorePatterns: parsed.ignorePatterns ?? [...DEFAULT_IGNORE_PATTERNS],
    allowPatterns: parsed.allowPatterns ?? [],
    maxFileBytes: parsed.maxFileBytes ?? 1_500_000,
  };
}
