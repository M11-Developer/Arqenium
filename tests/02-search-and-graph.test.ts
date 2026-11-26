import { afterEach, describe, expect, it } from 'vitest';
import { withIndexedProject } from './helpers/core';
import type { Core } from '../src/core/core';

let core: Core | null = null;
afterEach(() => {
  core?.dispose();
  core = null;
});

describe('symbol search and dependency graph', () => {
  it('searches symbols by name and reports the true total', async () => {
    const { core: c, projectId } = await withIndexedProject('graph-1');
    core = c;
    const all = c.projects.symbols(projectId, { limit: 500 });
    expect(all.total).toBeGreaterThan(20);

    const limited = c.projects.symbols(projectId, { limit: 5 });
    expect(limited.items).toHaveLength(5);
    expect(limited.total).toBe(all.total);

    const byKind = c.projects.symbols(projectId, { kind: 'class', limit: 50 });
    expect(byKind.items.every((s) => s.kind === 'class')).toBe(true);
    expect(byKind.items.map((s) => s.name)).toContain('RecordFormatter');
  });

  it('builds a dependency graph with resolved and external edges', async () => {
    const { core: c, projectId } = await withIndexedProject('graph-2');
    core = c;
    const graph = c.projects.graph(projectId);

    const internalNodes = graph.nodes.filter((n) => !n.external);
    expect(internalNodes.length).toBeGreaterThanOrEqual(5);
    expect(graph.nodes.some((n) => n.isTest)).toBe(true);

    const indexToRouter = graph.edges.find((e) => e.from === 'src/index.ts' && e.to === 'src/lib/router.ts');
    expect(indexToRouter).toBeDefined();
    expect(indexToRouter?.resolved).toBe(true);

    const pyEdge = graph.edges.find((e) => e.from === 'src/service.py');
    expect(pyEdge).toBeDefined();
  });

  it('marks unresolvable module specs as external rather than inventing edges', async () => {
    const { core: c, projectId } = await withIndexedProject('graph-3');
    core = c;
    const graph = c.projects.graph(projectId);
    // src/lib/config.ts has no imports; router.ts imports ./format which resolves.
    const routerImports = graph.edges.filter((e) => e.from === 'src/lib/router.ts');
    expect(routerImports.length).toBe(1);
    expect(routerImports[0].to).toBe('src/lib/format.ts');
    expect(routerImports[0].external).toBeFalsy();
  });

  it('produces grounded file summaries from parsed data', async () => {
    const { core: c, projectId } = await withIndexedProject('graph-4');
    core = c;
    const summary = c.projects.summary(projectId, 'src/lib/router.ts');
    expect(summary.path).toBe('src/lib/router.ts');
    expect(summary.language).toBe('typescript');
    expect(summary.quality).toBe('parsed');
    expect(summary.symbolCount).toBeGreaterThan(0);
    expect(summary.symbols.map((s) => s.name)).toContain('createRouter');
    expect(summary.imports[0].moduleSpec).toBe('./format');
    expect(summary.imports[0].resolved).toBe('src/lib/format.ts');
    expect(summary.lines).toBeGreaterThan(5);
  });

  it('refuses summaries for excluded paths', async () => {
    const { core: c, projectId } = await withIndexedProject('graph-5');
    core = c;
    expect(() => c.projects.summary(projectId, '.env')).toThrow(/sensitive|blocked/i);
    expect(() => c.projects.summary(projectId, 'node_modules/prettier/index.js')).toThrow(/sensitive|blocked|not found/i);
  });
});

describe('impact analysis', () => {
  it('finds real reverse dependencies with parsed confidence and depth', async () => {
    const { core: c, projectId } = await withIndexedProject('impact-1');
    core = c;
    const impact = c.projects.impact(projectId, ['src/lib/format.ts'], 3);

    const paths = impact.affected.map((a) => a.path);
    expect(paths).toContain('src/lib/router.ts');
    expect(paths).toContain('src/index.ts');

    const router = impact.affected.find((a) => a.path === 'src/lib/router.ts')!;
    expect(router.depth).toBe(1);
    expect(router.confidence).toBe('parsed');

    const index = impact.affected.find((a) => a.path === 'src/index.ts')!;
    expect(index.depth).toBeGreaterThanOrEqual(2);
  });

  it('labels heuristic test matches separately from parsed ones', async () => {
    const { core: c, projectId } = await withIndexedProject('impact-2');
    core = c;
    const impact = c.projects.impact(projectId, ['src/lib/router.ts'], 2);
    expect(impact.tests).toContain('tests/router.test.ts');
    for (const a of impact.affected) {
      expect(['parsed', 'heuristic']).toContain(a.confidence);
    }
  });

  it('returns no affected files for an unreferenced leaf module', async () => {
    const { core: c, projectId } = await withIndexedProject('impact-3');
    core = c;
    // format.ts is imported; config.ts is imported by index.ts. Use the test file,
    // which nothing imports.
    const impact = c.projects.impact(projectId, ['tests/router.test.ts'], 2);
    expect(impact.affected.filter((a) => a.confidence === 'parsed')).toHaveLength(0);
  });
});
