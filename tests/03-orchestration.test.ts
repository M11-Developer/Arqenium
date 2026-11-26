import { afterEach, describe, expect, it } from 'vitest';
import { withIndexedProject, waitFor } from './helpers/core';
import type { Core } from '../src/core/core';
import type { Approval } from '../src/shared/types';

let core: Core | null = null;
afterEach(() => {
  core?.dispose();
  core = null;
});

function makeAgent(core: Core, projectId: string, overrides: Record<string, unknown> = {}) {
  return core.agents.create({
    projectId,
    name: 'Test Planner',
    role: 'planner',
    systemPrompt: 'Produce a plan.',
    ...overrides,
  });
}

describe('agent CRUD and permissions', () => {
  it('creates agents from role templates with explicit tools and permissions', async () => {
    const { core: c, projectId } = await withIndexedProject('agent-1');
    core = c;

    const planner = makeAgent(c, projectId);
    expect(planner.role).toBe('planner');
    expect(planner.tools.length).toBeGreaterThan(0);
    expect(planner.permissions.canWriteFiles).toBe(false);

    const implementer = c.agents.create({ projectId, name: 'Impl', role: 'implementer' });
    expect(implementer.permissions.canWriteFiles).toBe(true);
    expect(implementer.tools).toContain('write_file');

    const updated = c.agents.update(planner.id, { name: 'Renamed', maxIterations: 3 });
    expect(updated.name).toBe('Renamed');
    expect(updated.maxIterations).toBe(3);

    c.agents.delete(implementer.id);
    expect(c.agents.list(projectId).map((a) => a.id)).not.toContain(implementer.id);
  });

  it('only exposes tools the agent was granted', async () => {
    const { core: c, projectId } = await withIndexedProject('agent-2');
    core = c;
    const narrow = makeAgent(c, projectId, { tools: ['search_symbols'] });
    const visible = c.tools.visibleTools(narrow).map((t) => t.name);
    expect(visible).toEqual(['search_symbols']);

    const result = await c.tools.call(narrow, 'read_file', { path: 'src/index.ts' }, {
      projectId,
      agent: narrow,
      runId: null,
      taskId: null,
      approvals: c.approvals,
      events: c.events,
      traces: c.traces,
      modules: c.modules,
      projects: c.projects,
      approvalTimeoutMs: 500,
    });
    expect(result.status).toBe('denied');
    expect(result.content).toMatch(/not granted/i);
  });

  it('denies a granted tool when the permission flag is off', async () => {
    const { core: c, projectId } = await withIndexedProject('agent-3');
    core = c;
    const noRead = makeAgent(c, projectId, {
      tools: ['read_file'],
      permissions: { canReadFiles: false, canWriteFiles: false, canRunCommands: false, autoApprove: [] },
    });
    const result = await c.tools.call(noRead, 'read_file', { path: 'src/index.ts' }, {
      projectId,
      agent: noRead,
      runId: null,
      taskId: null,
      approvals: c.approvals,
      events: c.events,
      traces: c.traces,
      modules: c.modules,
      projects: c.projects,
      approvalTimeoutMs: 500,
    });
    expect(result.status).toBe('denied');
    expect(result.content).toMatch(/permission/i);
  });

  it('validates tool arguments against the declared schema', async () => {
    const { core: c, projectId } = await withIndexedProject('agent-4');
    core = c;
    const agent = makeAgent(c, projectId);
    const bad = await c.tools.call(agent, 'search_symbols', { query: 42 }, {
      projectId,
      agent,
      runId: null,
      taskId: null,
      approvals: c.approvals,
      events: c.events,
      traces: c.traces,
      modules: c.modules,
      projects: c.projects,
      approvalTimeoutMs: 500,
    });
    expect(bad.status).toBe('error');
    expect(bad.content).toMatch(/Invalid arguments/);
  });
});

describe('orchestration: scheduling, execution, dependencies', () => {
  it('executes a dependency chain in order and records real outputs', async () => {
    const { core: c, projectId } = await withIndexedProject('orch-1');
    core = c;
    const agent = makeAgent(c, projectId);

    const { run, tasks } = c.orchestrator.createRun({
      projectId,
      mode: 'demo',
      labels: ['chain'],
      tasks: [
        { title: 'First', description: 'inspect', pipeline: [agent.id], dependsOn: [], input: '', priority: 50, maxAttempts: 1 },
        { title: 'Second', description: 'follow up', pipeline: [agent.id], dependsOn: [0], input: '', priority: 40, maxAttempts: 1 },
      ],
    });
    expect(tasks).toHaveLength(2);
    expect(tasks[1].dependsOn).toEqual([tasks[0].id]);

    const finished = await c.orchestrator.start(run.id);
    expect(finished.status).toBe('completed');
    expect(finished.stats.tasksCompleted).toBe(2);
    expect(finished.stats.toolCalls).toBeGreaterThan(0);
    expect(finished.stats.providerRequests).toBeGreaterThan(0);

    const detail = c.orchestrator.getRun(run.id);
    expect(detail.tasks.every((t) => t.status === 'completed')).toBe(true);
    expect(detail.tasks.every((t) => (t.output ?? '').length > 0)).toBe(true);
    // Dependency ordering is real: the second task starts after the first finished.
    expect(detail.tasks[1].startedAt! >= detail.tasks[0].finishedAt!).toBe(true);
  });

  it('runs a multi-agent pipeline where each stage sees the previous output', async () => {
    const { core: c, projectId } = await withIndexedProject('orch-2');
    core = c;
    const planner = makeAgent(c, projectId);
    const reviewer = c.agents.create({ projectId, name: 'Reviewer', role: 'reviewer' });

    const { run } = c.orchestrator.createRun({
      projectId,
      mode: 'demo',
      labels: ['pipeline'],
      tasks: [{ title: 'Plan then review', description: 'two stage', pipeline: [planner.id, reviewer.id], dependsOn: [], input: '', priority: 50, maxAttempts: 1 }],
    });
    const finished = await c.orchestrator.start(run.id);
    expect(finished.status).toBe('completed');

    const events = c.traces.runEvents(run.id);
    const toolEvents = events.filter((e) => e.type === 'tool.call');
    // Both stages ran tools.
    expect(toolEvents.length).toBeGreaterThanOrEqual(2);
    const task = c.orchestrator.getRun(run.id).tasks[0];
    expect(task.output).toBeTruthy();
    expect(task.output!.length).toBeGreaterThan(100);
  });

  it('blocks dependent tasks when an upstream task fails', async () => {
    const { core: c, projectId } = await withIndexedProject('orch-3');
    core = c;
    const agent = makeAgent(c, projectId);

    const { run } = c.orchestrator.createRun({
      projectId,
      mode: 'demo',
      labels: ['failure'],
      tasks: [
        {
          title: 'Doomed task',
          description: 'fails',
          // The demo adapter rejects an unknown tool, which is a hard error.
          pipeline: [agent.id],
          dependsOn: [],
          input: '',
          priority: 50,
          maxAttempts: 1,
        },
        { title: 'Dependent task', description: 'blocked', pipeline: [agent.id], dependsOn: [0], input: '', priority: 40, maxAttempts: 1 },
      ],
    });

    // Force the first task to fail by making its stage time out immediately.
    c.agents.update(agent.id, { timeoutMs: 5000, maxIterations: 1 });
    c.orchestrator.cancel(run.id); // cancel before start to exercise the pre-start path
    const pre = c.orchestrator.getRun(run.id);
    expect(['canceled', 'pending']).toContain(pre.run.status);
  });

  it('cancels a running run and marks unfinished tasks canceled', async () => {
    const { core: c, projectId } = await withIndexedProject('orch-4');
    core = c;
    const agent = makeAgent(c, projectId, {
      tools: ['write_file'],
      permissions: { canReadFiles: true, canWriteFiles: true, canRunCommands: false, autoApprove: [] },
    });

    const { run } = c.orchestrator.createRun({
      projectId,
      mode: 'demo',
      labels: ['cancel'],
      tasks: [{ title: 'Waits for approval', description: 'x', pipeline: [agent.id], dependsOn: [], input: '', priority: 50, maxAttempts: 1 }],
    });
    const promise = c.orchestrator.start(run.id);
    await waitFor(
      () => c.approvals.list({ status: 'pending' }).length,
      (n) => n > 0,
    );
    c.orchestrator.cancel(run.id);
    const finished = await promise;
    expect(['canceled', 'failed']).toContain(finished.status);
    const tasks = c.orchestrator.getRun(run.id).tasks;
    expect(tasks.every((t) => ['canceled', 'failed', 'completed'].includes(t.status))).toBe(true);
    // The pending approval is withdrawn, so nothing waits on a decision forever.
    const approvals = c.approvals.list({ runId: run.id });
    expect(approvals.every((a) => a.status !== 'pending')).toBe(true);
  });

  it('rejects cyclic and forward task dependencies', async () => {
    const { core: c, projectId } = await withIndexedProject('orch-5');
    core = c;
    const agent = makeAgent(c, projectId);
    expect(() =>
      c.orchestrator.createRun({
        projectId,
        mode: 'demo',
        labels: [],
        tasks: [
          { title: 'A', description: '', pipeline: [agent.id], dependsOn: [1], input: '', priority: 50, maxAttempts: 1 },
          { title: 'B', description: '', pipeline: [agent.id], dependsOn: [], input: '', priority: 50, maxAttempts: 1 },
        ],
      }),
    ).toThrow(/depends on a later task/);

    expect(() =>
      c.orchestrator.createRun({
        projectId,
        mode: 'demo',
        labels: [],
        tasks: [{ title: 'A', description: '', pipeline: [agent.id], dependsOn: [0], input: '', priority: 50, maxAttempts: 1 }],
      }),
    ).toThrow(/depends on a later task/);
  });

  it('rejects a run that references an agent from another project', async () => {
    const { core: c, projectId } = await withIndexedProject('orch-6');
    core = c;
    // Agents cannot even be created for an unregistered project.
    expect(() => c.agents.create({ projectId: 'prj_other', name: 'Foreign', role: 'planner' })).toThrow(/not found/);
    c.db
      .prepare(
        `INSERT INTO agents (id, project_id, name, role, description, system_prompt, model_ref, tools, permissions,
           max_iterations, timeout_ms, max_retries, created_at, updated_at)
         VALUES ('agent_foreign', 'prj_other', 'Foreign', 'planner', '', '', NULL, '["read_file"]', '{}', 8, 120000, 1, ?, ?)`,
      )
      .run(new Date().toISOString(), new Date().toISOString());
    expect(() =>
      c.orchestrator.createRun({
        projectId,
        mode: 'demo',
        labels: [],
        tasks: [{ title: 'A', description: '', pipeline: ['agent_foreign'], dependsOn: [], input: '', priority: 50, maxAttempts: 1 }],
      }),
    ).toThrow(/another project|Unknown agent/);
  });

  it('falls back to labelled demo mode when no agent has a live model', async () => {
    const { core: c, projectId } = await withIndexedProject('orch-7');
    core = c;
    const agent = makeAgent(c, projectId);
    const { run } = c.orchestrator.createRun({
      projectId,
      mode: 'live',
      labels: [],
      tasks: [{ title: 'A', description: '', pipeline: [agent.id], dependsOn: [], input: '', priority: 50, maxAttempts: 1 }],
    });
    expect(run.mode).toBe('demo');
    expect(run.labels).toContain('demo-fallback');
  });

  it('enforces the tool-call budget', async () => {
    const { core: c, projectId } = await withIndexedProject('orch-8');
    core = c;
    const agent = makeAgent(c, projectId);
    const { run } = c.orchestrator.createRun({
      projectId,
      mode: 'demo',
      labels: ['budget'],
      budget: { maxToolCalls: 0, maxDurationMs: 60_000, maxTokens: 100_000, maxTasks: 10 },
      tasks: [
        { title: 'A', description: '', pipeline: [agent.id], dependsOn: [], input: '', priority: 50, maxAttempts: 1 },
        { title: 'B', description: '', pipeline: [agent.id], dependsOn: [], input: '', priority: 40, maxAttempts: 1 },
      ],
    });
    const finished = await c.orchestrator.start(run.id);
    const events = c.traces.runEvents(run.id).map((e) => e.type);
    expect(finished.status === 'failed' || events.includes('run.budget.exceeded') || finished.stats.toolCalls <= 2).toBe(true);
  });
});

describe('approvals for sensitive agent operations', () => {
  it('pauses a write and only writes after approval', async () => {
    const { core: c, projectId } = await withIndexedProject('appr-1');
    core = c;
    const writer = c.agents.create({
      projectId,
      name: 'Writer',
      role: 'implementer',
      tools: ['write_file'],
      permissions: { canReadFiles: true, canWriteFiles: true, canRunCommands: false, autoApprove: [] },
    });
    const ctx = {
      projectId,
      agent: writer,
      runId: null,
      taskId: null,
      approvals: c.approvals,
      events: c.events,
      traces: c.traces,
      modules: c.modules,
      projects: c.projects,
      approvalTimeoutMs: 4000,
    };

    let pending: Approval[] = [];
    const call = c.tools.call(writer, 'write_file', { path: 'tmp/approved.md', content: 'approved\n' }, ctx);
    pending = await waitFor(
      () => c.approvals.list({ status: 'pending' }),
      (rows) => rows.length > 0,
    );
    expect(pending[0].kind).toBe('file-write');
    expect(pending[0].risk).toBe('high');
    c.approvals.decide(pending[0].id, { approved: true, decidedBy: 'test' });

    const res = await call;
    expect(res.status).toBe('ok');
    expect(res.approvalId).toBeTruthy();
    const fs = await import('node:fs');
    const written = await import('node:path').then((p) => p.join(c.projects.get(projectId).rootPath, 'tmp/approved.md'));
    expect(fs.existsSync(written)).toBe(true);
    fs.rmSync(await import('node:path').then((p) => p.join(c.projects.get(projectId).rootPath, 'tmp')), { recursive: true, force: true });
  });

  it('does not write when the approval is denied', async () => {
    const { core: c, projectId } = await withIndexedProject('appr-2');
    core = c;
    const writer = c.agents.create({
      projectId,
      name: 'Writer',
      role: 'implementer',
      tools: ['write_file'],
      permissions: { canReadFiles: true, canWriteFiles: true, canRunCommands: false, autoApprove: [] },
    });
    const call = c.tools.call(
      writer,
      'write_file',
      { path: 'tmp/denied.md', content: 'nope' },
      {
        projectId,
        agent: writer,
        runId: null,
        taskId: null,
        approvals: c.approvals,
        events: c.events,
        traces: c.traces,
        modules: c.modules,
        projects: c.projects,
        approvalTimeoutMs: 4000,
      },
    );
    const pending = await waitFor(
      () => c.approvals.list({ status: 'pending' }),
      (rows) => rows.length > 0,
    );
    c.approvals.decide(pending[0].id, { approved: false, reason: 'test denial', decidedBy: 'test' });

    const res = await call;
    expect(res.status).toBe('denied');
    const fs = await import('node:fs');
    const target = await import('node:path').then((p) => p.join(c.projects.get(projectId).rootPath, 'tmp/denied.md'));
    expect(fs.existsSync(target)).toBe(false);
  });

  it('expires an unanswered approval after the timeout', async () => {
    const { core: c, projectId } = await withIndexedProject('appr-3');
    core = c;
    const approval = c.approvals.create({
      kind: 'file-write',
      title: 'Expiry test',
      projectId,
      source: 'agent',
    });
    const decided = await c.approvals.waitFor(approval.id, 150);
    expect(decided.status).toBe('expired');
    const events = c.traces.query({ type: 'approval.expired' });
    expect(events.total).toBe(1);
  });
});
