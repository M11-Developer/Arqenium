import { afterEach, describe, expect, it } from 'vitest';
import { withIndexedProject } from './helpers/core';
import type { Core } from '../src/core/core';

let core: Core | null = null;
afterEach(() => {
  core?.dispose();
  core = null;
});

describe('TraceX observability', () => {
  it('records a real, ordered timeline for a run', async () => {
    const { core: c, projectId } = await withIndexedProject('trace-1');
    core = c;
    const agent = c.agents.create({ projectId, name: 'Tracer', role: 'planner' });
    const { run } = c.orchestrator.createRun({
      projectId,
      mode: 'demo',
      labels: ['trace'],
      tasks: [{ title: 'Trace me', description: '', pipeline: [agent.id], dependsOn: [], input: '', priority: 50, maxAttempts: 1 }],
    });
    await c.orchestrator.start(run.id);

    const events = c.traces.runEvents(run.id);
    const types = events.map((e) => e.type);
    expect(types).toContain('run.created');
    expect(types).toContain('run.started');
    expect(types).toContain('task.started');
    expect(types).toContain('tool.call');
    expect(types).toContain('task.completed');
    expect(types).toContain('run.completed');

    // Ordered by timestamp.
    const times = events.map((e) => new Date(e.ts).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    // Every event for the run carries the run id, and stages carry task ids.
    expect(events.every((e) => e.runId === run.id)).toBe(true);
    expect(events.some((e) => e.taskId)).toBe(true);

    const summary = c.traces.summary(run.id);
    expect(summary.events).toBeGreaterThan(5);
    expect(summary.errors).toBe(0);
    expect(summary.toolCalls).toBeGreaterThan(0);
    expect(summary.avgTaskMs).not.toBeNull();
  });

  it('records tool calls with timing, status and approval links', async () => {
    const { core: c, projectId } = await withIndexedProject('trace-2');
    core = c;
    const agent = c.agents.create({ projectId, name: 'Reader', role: 'planner', tools: ['search_symbols'] });
    const { run } = c.orchestrator.createRun({
      projectId,
      mode: 'demo',
      labels: [],
      tasks: [{ title: 'Search', description: '', pipeline: [agent.id], dependsOn: [], input: '', priority: 50, maxAttempts: 1 }],
    });
    await c.orchestrator.start(run.id);

    const calls = c.traces.toolCalls({ runId: run.id });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.status).toBe('ok');
      expect(call.tool).toBe('search_symbols');
      expect(call.finishedAt).toBeTruthy();
      expect(call.durationMs).not.toBeNull();
      expect(call.source).toBe('agent');
    }
  });

  it('supports filtering by severity, type, run and search text', async () => {
    const { core: c, projectId } = await withIndexedProject('trace-3');
    core = c;
    c.events.emit({ type: 'custom.alpha', message: 'unique-marker-alpha', projectId, source: 'test' });
    c.events.emit({ type: 'custom.beta', message: 'beta', projectId, severity: 'error', source: 'test' });

    expect(c.traces.query({ type: 'custom.alpha' }).total).toBe(1);
    expect(c.traces.query({ severity: 'error' }).items.every((e) => e.severity === 'error')).toBe(true);
    expect(c.traces.query({ search: 'unique-marker-alpha' }).total).toBe(1);
    const types = c.traces.eventTypes().map((t) => t.type);
    expect(types).toContain('custom.alpha');
  });

  it('never persists secrets in event payloads', async () => {
    const { core: c } = await withIndexedProject('trace-4');
    core = c;
    c.events.emit({
      type: 'test.secret',
      message: 'Testing redaction',
      data: {
        apiKey: 'sk-live-abcdef0123456789',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
        nested: { password: 'hunter2-not-a-real-password', harmless: 'visible-value' },
      },
      source: 'test',
    });
    const row = c.db.prepare("SELECT data FROM events WHERE type = 'test.secret'").get() as { data: string };
    expect(row.data).not.toContain('sk-live-abcdef0123456789');
    expect(row.data).not.toContain('hunter2-not-a-real-password');
    expect(row.data).not.toContain('eyJhbGciOiJIUzI1NiJ9.payload.sig');
    expect(row.data).toContain('visible-value');
  });

  it('prunes events beyond the retention window', async () => {
    const { core: c } = await withIndexedProject('trace-5');
    core = c;
    c.db
      .prepare(
        `INSERT INTO events (id, ts, type, severity, project_id, run_id, task_id, agent_id, correlation_id, source, message, data, duration_ms)
         VALUES ('evt_old', ?, 'old.event', 'info', NULL, NULL, NULL, NULL, NULL, 'test', 'old', NULL, NULL)`,
      )
      .run(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString());
    c.traces.setRetention(30);
    const removed = c.traces.prune();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(c.traces.query({ type: 'old.event' }).total).toBe(0);
  });
});

describe('Evaluation Lab', () => {
  it('provides built-in suites that work without any provider', async () => {
    const { core: c, projectId } = await withIndexedProject('eval-1');
    core = c;
    const suites = c.evals.listSuites();
    const ids = suites.map((s) => s.id);
    expect(ids).toContain('suite-fixture-integrity');
    expect(ids).toContain('suite-project-index');
    expect(ids).toContain('suite-agent-engineering');
    expect(suites.every((s) => s.cases.length > 0)).toBe(true);

    const run = await c.evals.runSuite({ suiteId: 'suite-fixture-integrity', projectId });
    expect(run.evalRun.stats.total).toBe(3);
    expect(run.evalRun.stats.passed).toBe(3);
    expect(run.evalRun.stats.errors).toBe(0);
    for (const r of run.results) {
      expect(r.objective.length).toBeGreaterThan(10);
      expect(r.status).toBe('pass');
    }
  });

  it('produces reproducible deterministic results across runs', async () => {
    const { core: c, projectId } = await withIndexedProject('eval-2');
    core = c;
    const a = await c.evals.runSuite({ suiteId: 'suite-project-index', projectId });
    const b = await c.evals.runSuite({ suiteId: 'suite-project-index', projectId });
    expect(a.results.map((r) => `${r.caseName}:${r.status}`)).toEqual(b.results.map((r) => `${r.caseName}:${r.status}`));
    expect(a.results.every((r) => r.status === 'pass')).toBe(true);
  });

  it('fails a deterministic case when the fixture no longer contains the marker', async () => {
    const { core: c, projectId } = await withIndexedProject('eval-3');
    core = c;
    const suite = c.evals.createSuite({
      name: 'Negative check',
      kind: 'deterministic',
      cases: [
        {
          name: 'Impossible marker',
          kind: 'deterministic',
          config: { type: 'fixture_content', fixturePath: 'fixture-app/src/index.ts', expect: { contains: ['this-string-does-not-exist'] } },
        },
      ],
    });
    const run = await c.evals.runSuite({ suiteId: suite.id, projectId });
    expect(run.results[0].status).toBe('fail');
    expect(run.results[0].objective).toMatch(/missing/i);
  });

  it('runs AI cases through the orchestrator and separates objective from judgment', async () => {
    const { core: c, projectId } = await withIndexedProject('eval-4');
    core = c;
    const agent = c.agents.create({ projectId, name: 'Evaluated', role: 'planner' });
    const run = await c.evals.runSuite({ suiteId: 'suite-agent-engineering', projectId, mode: 'demo', agentIds: [agent.id] });

    expect(run.results).toHaveLength(2);
    for (const r of run.results) {
      expect(r.runId).toBeTruthy();
      expect(r.objective).toMatch(/Task status/);
      // The run really executed in the orchestration engine.
      const detail = c.orchestrator.getRun(r.runId!);
      expect(detail.run.kind).toBe('evaluation');
      expect(detail.tasks[0].status).toBe('completed');
    }
    expect(run.evalRun.mode).toBe('demo');
  });

  it('skips AI cases when no agent is supplied rather than faking a result', async () => {
    const { core: c, projectId } = await withIndexedProject('eval-5');
    core = c;
    const run = await c.evals.runSuite({ suiteId: 'suite-agent-engineering', projectId });
    expect(run.results.every((r) => r.status === 'skipped')).toBe(true);
    expect(run.results[0].objective).toMatch(/skipped/i);
  });

  it('exports results as JSON and CSV', async () => {
    const { core: c, projectId } = await withIndexedProject('eval-6');
    core = c;
    const run = await c.evals.runSuite({ suiteId: 'suite-fixture-integrity', projectId });
    const json = JSON.parse(c.evals.export(run.evalRun.id, 'json'));
    expect(json.run.id).toBe(run.evalRun.id);
    expect(json.results).toHaveLength(3);
    const csv = c.evals.export(run.evalRun.id, 'csv');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('case,agent,status,objective,subjective,durationMs,error,runId');
    expect(lines).toHaveLength(4);
  });

  it('prevents deletion of built-in suites but allows custom ones', async () => {
    const { core: c } = await withIndexedProject('eval-7');
    core = c;
    expect(() => c.evals.deleteSuite('suite-fixture-integrity')).toThrow(/Built-in/);
    const custom = c.evals.createSuite({
      name: 'Custom',
      cases: [{ name: 'c1', kind: 'deterministic', config: { type: 'no_secret_leak', expect: { forbidden: [] } } }],
    });
    c.evals.deleteSuite(custom.id);
    expect(c.evals.listSuites().some((s) => s.id === custom.id)).toBe(false);
  });
});
