import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Core } from '../core/core';
import type { ModuleId } from '../shared/types';

/**
 * Demo-mode seeding for the hosted (read-only) preview.
 *
 * A serverless host has no writable home directory, no native SQLite build and
 * no repository to index, so `ARQ_DEMO_MODE=1` starts the core on an in-memory
 * database, materialises a small sample project in a temp directory and
 * indexes it for real. Everything the UI shows afterwards is produced by the
 * actual services — parsing, symbol tables, dependency edges, TraceX events,
 * the demo provider — rather than hard-coded fixtures. Nothing is simulated.
 */
const SAMPLE_FILES: Record<string, string> = {
  'package.json': JSON.stringify(
    { name: 'sample-app', version: '1.0.0', type: 'module', scripts: { start: 'node src/index.ts', test: 'vitest run' } },
    null,
    2,
  ),
  'README.md': '# sample-app\n\nA deterministic demo project used by the ARQENIUM hosted preview.\n',
  'src/index.ts': [
    "import { createRouter } from './lib/router';",
    "import { formatBytes } from './lib/format';",
    '',
    'export interface AppConfig {',
    '  port: number;',
    '  routes: string[];',
    '}',
    '',
    'export function boot(config: AppConfig) {',
    '  const router = createRouter(config.routes);',
    '  return {',
    '    port: config.port,',
    '    match: (p: string) => router.match(p),',
    '    describe: () => `listening on ${config.port}`,',
    '    size: formatBytes(1024),',
    '  };',
    '}',
    '',
  ].join('\n'),
  'src/lib/router.ts': [
    "import { formatPath } from './format';",
    '',
    'export interface Route { path: string; handler: string }',
    '',
    'export interface Router {',
    '  match(path: string): Route | null;',
    '}',
    '',
    'export function createRouter(routes: string[]): Router {',
    '  const table = new Map(routes.map((r) => [formatPath(r), { path: r, handler: r }]));',
    '  return { match: (p) => table.get(formatPath(p)) ?? null };',
    '}',
    '',
  ].join('\n'),
  'src/lib/format.ts': [
    'export function formatPath(p: string): string {',
    "  return p.replace(/\\/+/g, '/').replace(/\\/$/, '') || '/';",
    '}',
    '',
    'export function formatBytes(n: number): string {',
    "  if (n < 1024) return `${n} B`;",
    "  return `${(n / 1024).toFixed(1)} KB`;",
    '}',
    '',
  ].join('\n'),
  'src/service.py': [
    'from dataclasses import dataclass',
    '',
    '@dataclass',
    'class Record:',
    '    key: str',
    '    value: int',
    '',
    'def parse_records(lines):',
    '    out = []',
    '    for line in lines:',
    "        key, _, raw = line.partition('=')",
    '        out.append(Record(key.strip(), int(raw or 0)))',
    '    return out',
    '',
    'class RecordStore:',
    '    def __init__(self):',
    '        self.items = {}',
    '',
    '    def add(self, record):',
    '        self.items[record.key] = record',
    '',
  ].join('\n'),
  'tests/router.test.ts': [
    "import { createRouter } from '../src/lib/router';",
    '',
    "describe('router', () => {",
    "  it('matches a normalised path', () => {",
    "    const r = createRouter(['/a']);",
    "    expect(r.match('a/')).toEqual({ path: '/a', handler: '/a' });",
    '  });',
    '});',
    '',
  ].join('\n'),
};

/** Modules the hosted preview keeps on; the rest stay at their defaults. */
const DEMO_MODULES: ModuleId[] = ['echoshell', 'rebuild-studio'];

export interface DemoSeedResult {
  projectId: string | null;
  runId: string | null;
  rootPath: string;
  skipped: string[];
  /** Set to false to seed only the project (used by tests). */
  run?: boolean;
}

function writeSampleFiles(root: string): string[] {
  const skipped: string[] = [];
  for (const [rel, content] of Object.entries(SAMPLE_FILES)) {
    const target = path.join(root, rel);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    } catch {
      skipped.push(rel);
    }
  }
  return skipped;
}

/**
 * Seed the sample project. Returns quietly when the host cannot write files —
 * the UI then shows its normal empty state instead of failing to boot.
 */
export async function seedDemoProject(core: Core): Promise<DemoSeedResult> {
  const result: DemoSeedResult = { projectId: null, runId: null, rootPath: '', skipped: [] };

  // ECHO SHELL and Rebuild Studio are opt-in by default; turn them on so the
  // preview exposes every screen, including the ones behind the module gate.
  for (const id of DEMO_MODULES) {
    try {
      core.modules.set(id, true);
    } catch {
      /* core modules ignore this */
    }
  }

  let root: string;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'arqenium-preview-'));
  } catch {
    return result;
  }
  result.rootPath = root;
  result.skipped = writeSampleFiles(root);
  if (result.skipped.length === Object.keys(SAMPLE_FILES).length) return result;

  try {
    const project = await core.projects.add(root, 'sample-app');
    result.projectId = project.id;
    // The index runs in the background on add(); wait briefly so the first page
    // load already shows files, symbols and edges.
    try {
      await core.projects.reindex(project.id);
    } catch {
      /* the background index may already have completed */
    }

    // A small default team so Runs, Agents and the approval gate are populated.
    // These are ordinary agent records created through the real service.
    try {
      const planner = core.agents.create({ projectId: project.id, name: 'Planner', role: 'planner' });
      const reviewer = core.agents.create({ projectId: project.id, name: 'Reviewer', role: 'reviewer' });
      if (result.run !== false) {
        const { run } = core.orchestrator.createRun({
          projectId: project.id,
          mode: 'demo',
          labels: ['demo', 'sample-app'],
          tasks: [
            {
              title: 'Summarise the sample project',
              description: 'Describe the entrypoint and the modules it pulls in.',
              pipeline: [planner.id, reviewer.id],
              dependsOn: [],
              input: 'Describe src/index.ts and the modules it imports.',
              priority: 1,
              maxAttempts: 1,
            },
          ],
        });
        result.runId = run.id;
        // The demo provider needs no key; executing produces real TraceX
        // events, real task records and a real tool-call history.
        try {
          await core.orchestrator.start(run.id);
        } catch {
          /* the run record still exists even if execution failed */
        }
      }
    } catch {
      /* the preview degrades to an empty agents/runs list, not a broken boot */
    }
    return result;
  } catch {
    return result;
  }
}
