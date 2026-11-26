import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { ApprovalService } from '../approvals';
import type { TraceService } from '../traces/service';
import type { ModuleService } from '../modules';
import type { ProjectService } from '../projects/service';
import type { AgentService } from '../agents/service';
import type { ProviderRegistry } from '../providers/registry';
import type { ContextService } from '../context/service';
import type { SettingsService } from '../settings';
import type { ToolContext, ToolRouter } from './tools';
import type { Agent, ChatMessage, Run, RunBudget, RunStats, Task, TaskStatus } from '../../shared/types';
import { newId, nowIso } from '../../shared/ids';
import { buildSystemPrompt, buildUserMessage } from './prompt';

const DEFAULT_BUDGET: RunBudget = {
  maxDurationMs: 10 * 60_000,
  maxToolCalls: 60,
  maxTokens: 400_000,
  maxTasks: 100,
};

const DEFAULT_STATS: RunStats = {
  toolCalls: 0,
  tokensIn: 0,
  tokensOut: 0,
  tasksCompleted: 0,
  tasksFailed: 0,
  providerRequests: 0,
  estimatedCost: null,
};

export interface CreateRunTaskInput {
  title: string;
  description: string;
  pipeline: string[];
  dependsOn: number[];
  input: string;
  priority: number;
  maxAttempts: number;
}

export interface CreateRunInput {
  projectId: string;
  mode: 'live' | 'demo';
  labels: string[];
  budget?: Partial<RunBudget>;
  tasks: CreateRunTaskInput[];
  trigger?: Run['trigger'];
  kind?: Run['kind'];
}

class CancelledError extends Error {}
class StageTimeoutError extends Error {}
class BudgetExceededError extends Error {}

interface RunState {
  runId: string;
  cancelRequested: boolean;
  aborts: Set<AbortController>;
  counters: { toolCalls: number; tokensIn: number; tokensOut: number; providerRequests: number; startedAt: number };
  promise: Promise<Run>;
}

/**
 * Multi-agent orchestration runtime: dependency-aware scheduling, agent
 * pipelines, retries, timeouts, cancellation, budgets and approval-gated tools.
 * Task states and outputs are only recorded after real execution results.
 */
export class Orchestrator {
  private active = new Map<string, RunState>();

  constructor(
    private db: Db,
    private events: EventBus,
    private approvals: ApprovalService,
    private traces: TraceService,
    private modules: ModuleService,
    private projects: ProjectService,
    private agents: AgentService,
    private providers: ProviderRegistry,
    private context: ContextService,
    private settings: SettingsService,
    private tools: ToolRouter,
  ) {}

  // ------------------------------------------------------------- run CRUD

  createRun(input: CreateRunInput): { run: Run; tasks: Task[] } {
    this.modules.requireEnabled('agent-control');
    if (!input.tasks.length) throw new Error('A run needs at least one task');
    if (input.tasks.length > 100) throw new Error('Too many tasks (max 100)');
    const project = this.projects.get(input.projectId);

    let mode = input.mode;
    const labels = [...input.labels];
    const anyModel = input.tasks.some((t) => t.pipeline.some((id) => this.agents.find(id)?.modelRef));
    if (mode === 'live' && !anyModel) {
      mode = 'demo';
      labels.push('demo-fallback');
      this.events.emit({
        type: 'run.created',
        projectId: input.projectId,
        severity: 'warn',
        message: 'No agent model configured - run switched to demo mode (sample data)',
        data: { reason: 'demo-fallback' },
        source: 'orchestration',
      });
    }

    const budget: RunBudget = { ...DEFAULT_BUDGET, ...input.budget };
    const runId = newId('run');
    const now = nowIso();
    const runRow = {
      id: runId,
      projectId: input.projectId,
      kind: input.kind ?? 'orchestration',
      mode,
      trigger: input.trigger ?? 'user',
      status: 'pending' as const,
      labels,
      budget,
      stats: { ...DEFAULT_STATS },
      error: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    };

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO runs (id, project_id, kind, mode, trigger, status, labels, budget, stats, error, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL, ?)`,
        )
        .run(runId, runRow.projectId, runRow.kind, runRow.mode, runRow.trigger, JSON.stringify(labels), JSON.stringify(budget), JSON.stringify(DEFAULT_STATS), now);

      input.tasks.forEach((t, idx) => {
        if (t.pipeline.length === 0) throw new Error(`Task ${idx} has an empty agent pipeline`);
        if (t.dependsOn.some((d) => d >= idx)) throw new Error(`Task ${idx} depends on a later task (cycles are not allowed)`);
        for (const agentId of t.pipeline) {
          const agent = this.agents.find(agentId);
          if (!agent) throw new Error(`Unknown agent in task ${idx}: ${agentId}`);
          if (agent.projectId && agent.projectId !== input.projectId) {
            throw new Error(`Agent ${agent.name} belongs to another project`);
          }
        }
      });

      const ids = input.tasks.map(() => newId('task'));
      input.tasks.forEach((t, idx) => {
        const dependsOn = t.dependsOn.map((d) => ids[d]);
        this.db
          .prepare(
            `INSERT INTO tasks (id, run_id, project_id, title, description, status, pipeline, depends_on, priority, input, max_attempts, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            ids[idx],
            runId,
            input.projectId,
            t.title,
            t.description,
            JSON.stringify(t.pipeline),
            JSON.stringify(dependsOn),
            t.priority,
            t.input,
            t.maxAttempts,
            now,
          );
      });
    });
    tx();

    void project;
    this.events.emit({
      type: 'run.created',
      projectId: input.projectId,
      runId,
      message: `Run created with ${input.tasks.length} task(s) [mode=${mode}]`,
      data: { mode, labels, tasks: input.tasks.length, kind: runRow.kind },
      source: 'orchestration',
    });
    return { run: this.getRun(runId).run, tasks: this.getRun(runId).tasks };
  }

  getRun(runId: string): { run: Run; tasks: Task[] } {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    if (!row) throw new Error(`Run ${runId} not found`);
    const taskRows = this.db.prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY created_at, rowid').all(runId) as any[];
    return { run: rowToRun(row), tasks: taskRows.map(rowToTask) };
  }

  getTask(taskId: string): Task {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!row) throw new Error(`Task ${taskId} not found`);
    return rowToTask(row);
  }

  listRuns(filter: { projectId?: string; limit?: number; kind?: string } = {}): Run[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.projectId) {
      clauses.push('project_id = ?');
      params.push(filter.projectId);
    }
    if (filter.kind) {
      clauses.push('kind = ?');
      params.push(filter.kind);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM runs ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, filter.limit ?? 100) as any[];
    return rows.map(rowToRun);
  }

  // ------------------------------------------------------------- lifecycle

  /** Start (or attach to) the scheduler loop for a run. Resolves when finished. */
  start(runId: string): Promise<Run> {
    const existing = this.active.get(runId);
    if (existing) return existing.promise;
    const { run } = this.getRun(runId);
    if (run.status !== 'pending') return Promise.resolve(run);

    const state: RunState = {
      runId,
      cancelRequested: false,
      aborts: new Set(),
      counters: { toolCalls: 0, tokensIn: 0, tokensOut: 0, providerRequests: 0, startedAt: Date.now() },
      promise: Promise.resolve(run),
    };
    state.promise = this.runLoop(state).finally(() => {
      this.active.delete(runId);
    });
    this.active.set(runId, state);
    return state.promise;
  }

  cancel(runId: string): Run {
    const state = this.active.get(runId);
    const { run } = this.getRun(runId);
    if (!state) {
      if (run.status === 'pending' || run.status === 'running') {
        this.finishRun(runId, 'canceled', 'Canceled before start');
      }
      return this.getRun(runId).run;
    }
    state.cancelRequested = true;
    for (const c of state.aborts) c.abort(new CancelledError('run canceled'));
    // An agent may be parked on an approval; withdraw it so the task unwinds
    // instead of waiting out the approval timeout.
    this.approvals.cancelForRun(runId, 'run canceled');
    return this.getRun(runId).run;
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }

  private async runLoop(state: RunState): Promise<Run> {
    const runId = state.runId;
    const { run } = this.getRun(runId);
    this.db.prepare("UPDATE runs SET status = 'running', started_at = ? WHERE id = ?").run(nowIso(), runId);
    this.events.emit({
      type: 'run.started',
      projectId: run.projectId,
      runId,
      message: `Run started [mode=${run.mode}]`,
      data: { mode: run.mode, budget: run.budget },
      source: 'orchestration',
    });

    const concurrency = Math.max(1, Math.min(8, Number(this.settings.get('orchestration.concurrency', 2)) || 2));
    const running = new Set<Promise<void>>();

    try {
      for (;;) {
        if (state.cancelRequested) {
          await Promise.allSettled([...running]);
          this.finishRun(runId, 'canceled', 'Canceled by user', state);
          return this.getRun(runId).run;
        }

        // Budget: wall clock.
        if (Date.now() - state.counters.startedAt > run.budget.maxDurationMs) {
          await Promise.allSettled([...running]);
          this.events.emit({
            type: 'run.budget.exceeded',
            projectId: run.projectId,
            runId,
            severity: 'warn',
            message: 'Run exceeded maxDurationMs budget',
            data: { budget: run.budget, counters: state.counters },
            source: 'orchestration',
          });
          this.finishRun(runId, 'failed', 'Budget exceeded: maxDurationMs', state);
          return this.getRun(runId).run;
        }

        const tasks = this.getRun(runId).tasks;
        const byId = new Map(tasks.map((t) => [t.id, t]));
        const terminal: TaskStatus[] = ['completed', 'failed', 'canceled', 'blocked', 'skipped', 'timeout'];

        // Propagate dependency failures.
        for (const t of tasks) {
          if (t.status !== 'pending') continue;
          const deps = t.dependsOn.map((id) => byId.get(id)!).filter(Boolean);
          const badDep = deps.find((d) => d.status === 'failed' || d.status === 'blocked' || d.status === 'canceled' || d.status === 'timeout' || d.status === 'skipped');
          if (badDep) {
            this.updateTask(t.id, { status: 'blocked', error: `Dependency ${badDep.title} ended as ${badDep.status}`, finishedAt: nowIso() });
            this.events.emit({
              type: 'task.blocked',
              projectId: run.projectId,
              runId,
              taskId: t.id,
              message: `Task blocked by failed dependency: ${badDep.title}`,
              source: 'orchestration',
            });
          }
        }

        const fresh = this.getRun(runId).tasks;
        const freshById = new Map(fresh.map((t) => [t.id, t]));
        const ready = fresh
          .filter((t) => t.status === 'pending')
          .filter((t) => t.dependsOn.every((id) => freshById.get(id)?.status === 'completed'))
          .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));

        for (const task of ready) {
          if (running.size >= concurrency) break;
          if (state.counters.toolCalls > run.budget.maxToolCalls) {
            await Promise.allSettled([...running]);
            this.events.emit({
              type: 'run.budget.exceeded',
              projectId: run.projectId,
              runId,
              severity: 'warn',
              message: 'Run exceeded maxToolCalls budget',
              data: { budget: run.budget },
              source: 'orchestration',
            });
            this.finishRun(runId, 'failed', 'Budget exceeded: maxToolCalls', state);
            return this.getRun(runId).run;
          }
          this.updateTask(task.id, { status: 'running', startedAt: nowIso() });
          this.events.emit({
            type: 'task.started',
            projectId: run.projectId,
            runId,
            taskId: task.id,
            message: `Task started: ${task.title}`,
            data: { pipeline: task.pipeline },
            source: 'orchestration',
          });
          const p = this.executeTask(state, task)
            .catch((err) => {
              this.events.emit({
                type: 'task.failed',
                projectId: run.projectId,
                runId,
                taskId: task.id,
                severity: 'error',
                message: `Task crashed: ${err instanceof Error ? err.message : String(err)}`,
                source: 'orchestration',
              });
              this.updateTask(task.id, { status: 'failed', error: String(err), finishedAt: nowIso() });
            })
            .finally(() => running.delete(p));
          running.add(p);
        }

        if (running.size > 0) {
          await Promise.race([...running]);
          continue;
        }

        const all = this.getRun(runId).tasks;
        if (all.every((t) => terminal.includes(t.status))) {
          const failed = all.some((t) => t.status === 'failed' || t.status === 'timeout' || t.status === 'blocked');
          this.finishRun(runId, failed ? 'failed' : 'completed', failed ? 'One or more tasks failed' : null, state);
          return this.getRun(runId).run;
        }

        // Nothing running and nothing ready but not all terminal -> deadlock guard.
        if (!state.cancelRequested) {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.finishRun(runId, 'failed', message, state);
      return this.getRun(runId).run;
    }
  }

  private async executeTask(state: RunState, taskSnapshot: Task): Promise<void> {
    const runId = state.runId;
    const { run } = this.getRun(runId);
    const task = this.getTask(taskSnapshot.id);
    let attempts = task.attempts;

    for (;;) {
      attempts += 1;
      this.updateTask(task.id, { attempts });
      try {
        const output = await this.runPipeline(state, task, run);
        if (state.cancelRequested) throw new CancelledError('canceled');
        this.updateTask(task.id, {
          status: 'completed',
          output,
          error: null,
          finishedAt: nowIso(),
        });
        this.events.emit({
          type: 'task.completed',
          projectId: task.projectId,
          runId,
          taskId: task.id,
          message: `Task completed: ${task.title}`,
          data: { attempts, outputChars: output.length },
          source: 'orchestration',
        });
        return;
      } catch (err) {
        if (state.cancelRequested || err instanceof CancelledError) {
          this.updateTask(task.id, { status: 'canceled', error: 'canceled', finishedAt: nowIso() });
          this.events.emit({
            type: 'task.canceled',
            projectId: task.projectId,
            runId,
            taskId: task.id,
            message: `Task canceled: ${task.title}`,
            source: 'orchestration',
          });
          return;
        }
        const isTimeout = err instanceof StageTimeoutError;
        const isBudget = err instanceof BudgetExceededError;
        const message = err instanceof Error ? err.message : String(err);
        const retryable = !isBudget && attempts < task.maxAttempts;
        if (retryable) {
          this.events.emit({
            type: 'task.retried',
            projectId: task.projectId,
            runId,
            taskId: task.id,
            severity: 'warn',
            message: `Task retry ${attempts}/${task.maxAttempts}: ${message}`,
            data: { attempt: attempts },
            source: 'orchestration',
          });
          await new Promise((r) => setTimeout(r, Math.min(2000, 250 * attempts)));
          continue;
        }
        const status: TaskStatus = isTimeout ? 'timeout' : 'failed';
        this.updateTask(task.id, { status, error: message, finishedAt: nowIso() });
        this.events.emit({
          type: isTimeout ? 'task.timeout' : 'task.failed',
          projectId: task.projectId,
          runId,
          taskId: task.id,
          severity: 'error',
          message: `Task ${status}: ${task.title} - ${message}`,
          data: { attempts },
          source: 'orchestration',
        });
        return;
      }
    }
  }

  private async runPipeline(state: RunState, task: Task, run: Run): Promise<string> {
    const { run: freshRun } = this.getRun(state.runId);
    let prior: string | undefined;
    for (const agentId of task.pipeline) {
      const agent = this.agents.get(agentId);
      const output = await this.runStage(state, freshRun, task, agent, prior);
      prior = output;
    }
    void run;
    if (prior == null) throw new Error('Pipeline produced no output');
    return prior;
  }

  private async runStage(
    state: RunState,
    run: Run,
    task: Task,
    agent: Agent,
    priorStageOutput: string | undefined,
  ): Promise<string> {
    this.modules.requireEnabled('agent-control');

    // Resolve provider for this stage.
    let providerId: string;
    if (run.mode === 'demo') {
      providerId = this.providers.demoProvider().id;
    } else {
      const resolved = this.providers.resolveModelRef(agent.modelRef);
      if (!resolved) {
        throw new Error(
          agent.modelRef
            ? `Agent "${agent.name}" references unknown provider "${agent.modelRef}"`
            : `Agent "${agent.name}" has no model configured. Set a model in Agents or run in demo mode.`,
        );
      }
      providerId = resolved.providerId;
      if (resolved.model) {
        // Apply the per-agent model override onto a copy of the provider config.
        const cfg = this.providers.get(providerId);
        if (cfg.defaultModel !== resolved.model) {
          this.providers.update(providerId, { defaultModel: resolved.model });
        }
      }
    }

    const project = this.projects.get(task.projectId);
    const contextEntries = this.modules.isEnabled('shared-context') ? this.context.promptEntries(task.projectId) : [];
    const system = buildSystemPrompt({
      agent,
      project,
      taskTitle: task.title,
      taskDescription: task.description,
      taskInput: task.input,
      contextEntries,
      priorStageOutput,
    });
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: buildUserMessage({ agent, project, taskTitle: task.title, taskDescription: task.description, taskInput: task.input, contextEntries, priorStageOutput }) },
    ];

    const toolCtx: ToolContext = {
      projectId: task.projectId,
      agent,
      runId: state.runId,
      taskId: task.id,
      approvals: this.approvals,
      events: this.events,
      traces: this.traces,
      modules: this.modules,
      projects: this.projects,
      approvalTimeoutMs: Number(this.settings.get('orchestration.approvalTimeoutMs', 120_000)),
      approvalResolver: this.approvalResolver,
    };

    const schemas = this.tools.schemasFor(agent);
    let finalText: string | null = null;

    for (let iter = 0; iter < agent.maxIterations; iter++) {
      this.checkLimits(state);
      const controller = new AbortController();
      state.aborts.add(controller);
      const timer = setTimeout(() => controller.abort(new StageTimeoutError(`agent stage timed out after ${agent.timeoutMs}ms`)), agent.timeoutMs);
      try {
        state.counters.providerRequests += 1;
        const res = await this.providers.chat(
          providerId,
          {
            messages,
            tools: schemas.length ? schemas : undefined,
            maxTokens: 4096,
            signal: controller.signal,
          },
          { correlationId: task.id },
        );
        if (res.usage) {
          state.counters.tokensIn += res.usage.tokensIn ?? 0;
          state.counters.tokensOut += res.usage.tokensOut ?? 0;
        }
        const msg = res.message;
        if (msg.toolCalls?.length) {
          messages.push({ role: 'assistant', content: msg.content, toolCalls: msg.toolCalls });
          for (const tc of msg.toolCalls) {
            this.checkLimits(state);
            let args: unknown = {};
            try {
              args = JSON.parse(tc.arguments || '{}');
            } catch {
              args = {};
            }
            this.events.emit({
              type: 'tool.call',
              projectId: task.projectId,
              runId: state.runId,
              taskId: task.id,
              agentId: agent.id,
              correlationId: task.id,
              message: `${agent.name} -> ${tc.name}`,
              data: { tool: tc.name, args: sanitizeArgs(args) },
              source: 'orchestration',
            });
            const result = await this.tools.call(agent, tc.name, args, toolCtx);
            state.counters.toolCalls += 1;
            this.events.emit({
              type: result.status === 'ok' ? 'tool.result' : result.status === 'denied' ? 'tool.denied' : 'tool.error',
              severity: result.status === 'ok' ? 'info' : result.status === 'denied' ? 'warn' : 'error',
              projectId: task.projectId,
              runId: state.runId,
              taskId: task.id,
              agentId: agent.id,
              correlationId: task.id,
              message: `${tc.name}: ${result.status}`,
              data: { tool: tc.name, status: result.status },
              source: 'orchestration',
            });
            messages.push({ role: 'tool', content: result.content, toolCallId: tc.id, name: tc.name });
          }
          continue;
        }
        finalText = msg.content;
        break;
      } catch (err) {
        if (err instanceof StageTimeoutError) throw err;
        if (state.cancelRequested || (err instanceof Error && err.name === 'CancelledError')) throw new CancelledError('canceled');
        if (controller.signal.aborted && controller.signal.reason instanceof StageTimeoutError) {
          throw new StageTimeoutError(String(controller.signal.reason.message));
        }
        if (controller.signal.aborted) {
          const reason = controller.signal.reason;
          if (reason instanceof CancelledError) throw reason;
          if (reason instanceof StageTimeoutError) throw reason;
          throw new StageTimeoutError('stage aborted');
        }
        throw err;
      } finally {
        clearTimeout(timer);
        state.aborts.delete(controller);
      }
    }

    if (finalText == null) {
      throw new StageTimeoutError(`Agent "${agent.name}" reached its iteration limit without a final answer`);
    }
    return finalText;
  }

  private checkLimits(state: RunState): void {
    if (state.cancelRequested) throw new CancelledError('canceled');
    const { run } = this.getRun(state.runId);
    if (state.counters.toolCalls > run.budget.maxToolCalls) throw new BudgetExceededError('maxToolCalls exceeded');
    if (state.counters.tokensIn + state.counters.tokensOut > run.budget.maxTokens) throw new BudgetExceededError('maxTokens exceeded');
    if (Date.now() - state.counters.startedAt > run.budget.maxDurationMs) throw new BudgetExceededError('maxDurationMs exceeded');
  }

  /** Optional hook used by tests to auto-resolve approvals. */
  approvalResolver: ((approvalId: string) => Promise<boolean>) | undefined;

  /** Column map keeps the public Task shape camelCase while SQL stays snake_case. */
  private static readonly TASK_COLUMNS: Record<string, string> = {
    status: 'status',
    output: 'output',
    error: 'error',
    attempts: 'attempts',
    startedAt: 'started_at',
    finishedAt: 'finished_at',
  };

  private updateTask(
    taskId: string,
    patch: Partial<{ status: TaskStatus; output: string | null; error: string | null; attempts: number; startedAt: string | null; finishedAt: string | null }>,
  ): void {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const column = Orchestrator.TASK_COLUMNS[k];
      if (!column) throw new Error(`Unknown task field: ${k}`);
      sets.push(`${column} = ?`);
      params.push(v);
    }
    if (!sets.length) return;
    this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params, taskId);
  }

  private finishRun(runId: string, status: Run['status'], error: string | null, state?: RunState): void {
    const { run, tasks } = this.getRun(runId);
    if (['completed', 'failed', 'canceled'].includes(run.status)) return;
    const stats: RunStats = {
      ...run.stats,
      ...(state
        ? {
            toolCalls: state.counters.toolCalls,
            tokensIn: state.counters.tokensIn,
            tokensOut: state.counters.tokensOut,
            providerRequests: state.counters.providerRequests,
          }
        : {}),
      tasksCompleted: tasks.filter((t) => t.status === 'completed').length,
      tasksFailed: tasks.filter((t) => t.status === 'failed' || t.status === 'timeout' || t.status === 'blocked').length,
    };
    // Mark any still-pending/running tasks as canceled so the UI never shows stale states.
    for (const t of tasks) {
      if (t.status === 'pending' || t.status === 'running' || t.status === 'ready') {
        this.updateTask(t.id, { status: 'canceled', error: t.error ?? 'run finished', finishedAt: nowIso() });
      }
    }
    this.db
      .prepare('UPDATE runs SET status = ?, finished_at = ?, error = ?, stats = ? WHERE id = ?')
      .run(status, nowIso(), error, JSON.stringify(stats), runId);
    this.events.emit({
      type: status === 'completed' ? 'run.completed' : status === 'canceled' ? 'run.canceled' : 'run.failed',
      severity: status === 'completed' ? 'info' : 'warn',
      projectId: run.projectId,
      runId,
      message: `Run ${status}${error ? `: ${error}` : ''}`,
      data: { status, error },
      source: 'orchestration',
    });
  }

  /** Attach live counters back onto the run row (called periodically). */
  syncStats(runId: string): void {
    const state = this.active.get(runId);
    if (!state) return;
    const { run, tasks } = this.getRun(runId);
    const stats: RunStats = {
      ...run.stats,
      toolCalls: state.counters.toolCalls,
      tokensIn: state.counters.tokensIn,
      tokensOut: state.counters.tokensOut,
      providerRequests: state.counters.providerRequests,
      tasksCompleted: tasks.filter((t) => t.status === 'completed').length,
      tasksFailed: tasks.filter((t) => t.status === 'failed' || t.status === 'timeout' || t.status === 'blocked').length,
    };
    this.db.prepare('UPDATE runs SET stats = ? WHERE id = ?').run(JSON.stringify(stats), runId);
  }

  dispose(): void {
    for (const state of this.active.values()) {
      state.cancelRequested = true;
      for (const c of state.aborts) c.abort(new CancelledError('shutdown'));
    }
  }
}

function sanitizeArgs(args: unknown): unknown {
  if (args && typeof args === 'object' && 'content' in (args as any)) {
    const clone = { ...(args as any) };
    if (typeof clone.content === 'string' && clone.content.length > 1000) {
      clone.content = `${clone.content.slice(0, 1000)}... [truncated]`;
    }
    return clone;
  }
  return args;
}

function rowToRun(r: any): Run {
  const parse = (v: string | null, fb: any) => {
    try {
      return v ? JSON.parse(v) : fb;
    } catch {
      return fb;
    }
  };
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    mode: r.mode,
    trigger: r.trigger,
    status: r.status,
    labels: parse(r.labels, []),
    budget: { ...DEFAULT_BUDGET, ...parse(r.budget, {}) },
    stats: { ...DEFAULT_STATS, ...parse(r.stats, {}) },
    error: r.error,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}

function rowToTask(r: any): Task {
  const parse = (v: string | null, fb: any) => {
    try {
      return v ? JSON.parse(v) : fb;
    } catch {
      return fb;
    }
  };
  return {
    id: r.id,
    runId: r.run_id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    status: r.status,
    pipeline: parse(r.pipeline, []),
    dependsOn: parse(r.depends_on, []),
    priority: r.priority,
    input: r.input,
    output: r.output,
    error: r.error,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}
