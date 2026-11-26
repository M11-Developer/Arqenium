import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { ModuleService } from '../modules';
import type { ProjectService } from '../projects/service';
import type { Orchestrator } from '../orchestration/engine';
import type { AgentService } from '../agents/service';
import { BUILTIN_SUITES } from './suites';
import { newId, nowIso } from '../../shared/ids';
import type { EvalCase, EvalCaseStatus, EvalResult, EvalRun, EvalSuite, RunMode } from '../../shared/types';

export interface EvalRunOptions {
  suiteId: string;
  projectId?: string | null;
  mode?: RunMode;
  agentIds?: string[] | null;
}

export interface EvalRunOutput {
  evalRun: EvalRun;
  results: EvalResult[];
}

/**
 * Evaluation engine. Deterministic cases are checked against real fixture
 * content; AI cases are executed by the orchestration engine and graded
 * against declared criteria - objective checks and model-graded judgments are
 * always stored in separate fields and never blended into a single "score".
 */
export class EvalService {
  constructor(
    private db: Db,
    private events: EventBus,
    private modules: ModuleService,
    private projects: ProjectService,
    private orchestrator: Orchestrator,
    private agents: AgentService,
  ) {
    this.seedBuiltins();
  }

  // --------------------------------------------------------------- suites

  private seedBuiltins(): void {
    for (const suite of BUILTIN_SUITES) {
      const existing = this.db.prepare('SELECT id FROM eval_suites WHERE id = ?').get(suite.id);
      if (existing) continue;
      const now = nowIso();
      const tx = this.db.transaction(() => {
        this.db
          .prepare('INSERT INTO eval_suites (id, name, description, kind, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
          .run(suite.id, suite.name, suite.description, suite.kind, now, now);
        suite.cases.forEach((c, idx) => {
          this.db
            .prepare('INSERT INTO eval_cases (id, suite_id, name, description, kind, config, criteria, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(`${suite.id}-c${idx + 1}`, suite.id, c.name, c.description ?? '', c.kind, JSON.stringify(c.config ?? {}), c.criteria ?? '', idx);
        });
      });
      tx();
    }
  }

  listSuites(): EvalSuite[] {
    const rows = this.db.prepare('SELECT * FROM eval_suites ORDER BY builtin DESC, name').all() as any[];
    return rows.map((r) => this.rowToSuite(r));
  }

  getSuite(id: string): EvalSuite {
    const row = this.db.prepare('SELECT * FROM eval_suites WHERE id = ?').get(id);
    if (!row) throw new Error(`Evaluation suite ${id} not found`);
    return this.rowToSuite(row);
  }

  createSuite(input: {
    name: string;
    description?: string;
    kind?: EvalSuite['kind'];
    cases: Array<{ name: string; description?: string; kind: EvalCase['kind']; config?: Record<string, unknown>; criteria?: string }>;
  }): EvalSuite {
    this.modules.requireEnabled('evaluation');
    if (!input.cases.length) throw new Error('A suite needs at least one case');
    const id = newId('suite');
    const now = nowIso();
    const tx = this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO eval_suites (id, name, description, kind, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
        .run(id, input.name, input.description ?? '', input.kind ?? 'mixed', now, now);
      input.cases.forEach((c, idx) => {
        this.db
          .prepare('INSERT INTO eval_cases (id, suite_id, name, description, kind, config, criteria, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(newId('case'), id, c.name, c.description ?? '', c.kind, JSON.stringify(c.config ?? {}), c.criteria ?? '', idx);
      });
    });
    tx();
    this.events.emit({
      type: 'eval.suite.created',
      message: `Evaluation suite created: ${input.name}`,
      data: { suiteId: id, cases: input.cases.length },
      source: 'evals',
    });
    return this.getSuite(id);
  }

  deleteSuite(id: string): void {
    const suite = this.getSuite(id);
    if (suite.builtin) throw new Error('Built-in suites cannot be deleted');
    this.db.prepare('DELETE FROM eval_suites WHERE id = ?').run(id);
    this.events.emit({ type: 'eval.suite.deleted', message: `Evaluation suite deleted: ${suite.name}`, data: { suiteId: id }, source: 'evals' });
  }

  // ----------------------------------------------------------------- runs

  async runSuite(opts: EvalRunOptions): Promise<EvalRunOutput> {
    this.modules.requireEnabled('evaluation');
    const suite = this.getSuite(opts.suiteId);
    const mode: RunMode = opts.mode ?? (opts.agentIds?.length ? 'live' : 'demo');
    const agentIds = opts.agentIds?.length ? opts.agentIds : [null];
    const startedAt = nowIso();
    const evalRunId = newId('evalrun');
    this.db
      .prepare('INSERT INTO eval_runs (id, suite_id, suite_name, project_id, status, mode, started_at, stats) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(evalRunId, suite.id, suite.name, opts.projectId ?? null, 'running', mode, startedAt, '{}');

    this.events.emit({
      type: 'eval.started',
      message: `Evaluation started: ${suite.name} (${suite.cases.length} cases, mode=${mode})`,
      data: { evalRunId, suiteId: suite.id, cases: suite.cases.length, mode },
      projectId: opts.projectId ?? undefined,
      source: 'evals',
    });

    const results: EvalResult[] = [];
    for (const evalCase of suite.cases) {
      for (const agentId of agentIds) {
        const result = await this.runCase(evalCase, { evalRunId, mode, agentId, projectId: opts.projectId ?? null });
        results.push(result);
      }
    }

    const stats = {
      total: results.length,
      passed: results.filter((r) => r.status === 'pass').length,
      failed: results.filter((r) => r.status === 'fail').length,
      errors: results.filter((r) => r.status === 'error').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      durationMs: results.reduce((a, r) => a + r.durationMs, 0),
    };
    const finishedAt = nowIso();
    const status: EvalRun['status'] = stats.errors > 0 && stats.passed === 0 ? 'failed' : 'completed';
    this.db.prepare('UPDATE eval_runs SET status = ?, finished_at = ?, stats = ? WHERE id = ?').run(status, finishedAt, JSON.stringify(stats), evalRunId);

    const evalRun = this.getEvalRun(evalRunId);
    this.events.emit({
      type: 'eval.completed',
      message: `Evaluation finished: ${stats.passed}/${stats.total} passed`,
      data: { evalRunId, stats },
      projectId: opts.projectId ?? undefined,
      source: 'evals',
    });
    return { evalRun, results };
  }

  private async runCase(
    evalCase: EvalCase,
    ctx: { evalRunId: string; mode: RunMode; agentId: string | null; projectId: string | null },
  ): Promise<EvalResult> {
    const started = Date.now();
    let status: EvalCaseStatus = 'skipped';
    let objective = '';
    let subjective: string | null = null;
    let error: string | null = null;
    let runId: string | null = null;
    const metrics: Record<string, number> = {};

    try {
      if (evalCase.kind === 'deterministic') {
        const check = this.checkDeterministic(evalCase, ctx.projectId);
        status = check.pass ? 'pass' : 'fail';
        objective = check.detail;
        Object.assign(metrics, check.metrics);
      } else if (ctx.agentId && ctx.projectId) {
        const agent = this.agents.get(ctx.agentId);
        const created = this.orchestrator.createRun({
          projectId: ctx.projectId,
          mode: ctx.mode === 'live' && agent.modelRef ? 'live' : 'demo',
          kind: 'evaluation',
          labels: ['evaluation', ctx.evalRunId],
          trigger: 'evaluation',
          tasks: [
            {
              title: evalCase.name,
              description: `${evalCase.description}\n\nAcceptance criteria: ${evalCase.criteria}`,
              pipeline: [agent.id],
              dependsOn: [],
              input: String(evalCase.config.input ?? evalCase.description),
              priority: 3,
              maxAttempts: 1,
            },
          ],
        });
        const run = await this.orchestrator.start(created.run.id);
        runId = run.id;
        const task = this.orchestrator.getRun(run.id).tasks[0];
        const output = task.output ?? '';
        metrics.outputChars = output.length;
        objective = `Task status ${task.status}; ${output.length} characters of output produced.`;
        if (task.status !== 'completed') {
          status = task.status === 'canceled' ? 'skipped' : 'error';
          error = task.error;
        } else {
          const grade = gradeOutput(evalCase.criteria, output);
          status = grade.pass ? 'pass' : 'fail';
          subjective = grade.reason;
        }
      } else {
        status = 'skipped';
        objective = 'AI case skipped: no agent and project were provided.';
      }
    } catch (err) {
      status = 'error';
      error = err instanceof Error ? err.message : String(err);
      subjective = null;
    }

    const result: EvalResult = {
      id: newId('evalres'),
      evalRunId: ctx.evalRunId,
      caseId: evalCase.id,
      caseName: evalCase.name,
      agentId: ctx.agentId,
      status,
      score: null,
      metrics,
      objective,
      subjective,
      durationMs: Date.now() - started,
      error,
      runId,
    };
    this.db
      .prepare(
        `INSERT INTO eval_results (id, eval_run_id, case_id, case_name, agent_id, status, score, metrics, objective, subjective, duration_ms, error, run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        result.id,
        result.evalRunId,
        result.caseId,
        result.caseName,
        result.agentId,
        result.status,
        result.score,
        JSON.stringify(result.metrics),
        result.objective,
        result.subjective,
        result.durationMs,
        result.error,
        result.runId,
      );
    return result;
  }

  // -------------------------------------------- deterministic checkers

  private checkDeterministic(evalCase: EvalCase, projectId: string | null): { pass: boolean; detail: string; metrics: Record<string, number> } {
    const cfg = evalCase.config as {
      type?: string;
      fixturePath?: string;
      fixture?: string;
      projectId?: string;
      expect?: Record<string, unknown>;
    };
    const type = cfg.type ?? 'fixture_content';

    if (type === 'fixture_content') {
      const content = cfg.fixture !== undefined ? cfg.fixture : this.readFixture(cfg.fixturePath ?? '');
      if (content == null) {
        return { pass: false, detail: `Fixture not found: ${cfg.fixturePath ?? '(none)'}`, metrics: {} };
      }
      const expect = (cfg.expect ?? {}) as { contains?: string[]; notContains?: string[]; minLines?: number };
      const missing = (expect.contains ?? []).filter((s) => !content.includes(s));
      const forbidden = (expect.notContains ?? []).filter((s) => content.includes(s));
      const lines = content.split('\n').length;
      const minLinesOk = expect.minLines == null || lines >= expect.minLines;
      const pass = missing.length === 0 && forbidden.length === 0 && minLinesOk;
      const metrics: Record<string, number> = { lines, bytes: Buffer.byteLength(content) };
      const detail = pass
        ? `Fixture contains all ${expect.contains?.length ?? 0} expected markers; ${lines} lines verified.`
        : [
            missing.length ? `missing: ${missing.join(', ')}` : null,
            forbidden.length ? `unexpected: ${forbidden.join(', ')}` : null,
            !minLinesOk ? `expected at least ${expect.minLines} lines, found ${lines}` : null,
          ]
            .filter(Boolean)
            .join('; ');
      return { pass, detail, metrics };
    }

    if (type === 'project_index') {
      const pid = cfg.projectId ?? projectId;
      if (!pid) return { pass: false, detail: 'No project available to verify.', metrics: {} };
      const summary = this.projects.get(pid);
      const expect = (cfg.expect ?? {}) as { minFiles?: number; minSymbols?: number; language?: string };
      const metrics = {
        files: summary.indexStats.filesIndexed,
        symbols: summary.indexStats.symbols,
      };
      const problems: string[] = [];
      if (expect.minFiles != null && metrics.files < expect.minFiles) problems.push(`expected >= ${expect.minFiles} files, found ${metrics.files}`);
      if (expect.minSymbols != null && metrics.symbols < expect.minSymbols) problems.push(`expected >= ${expect.minSymbols} symbols, found ${metrics.symbols}`);
      if (expect.language) {
        const langs = Object.keys(summary.indexStats.languages ?? {});
        if (!langs.includes(expect.language)) problems.push(`expected language ${expect.language}, indexed ${langs.join(', ') || 'none'}`);
      }
      return {
        pass: problems.length === 0,
        detail: problems.length ? problems.join('; ') : `Index contains ${metrics.files} files and ${metrics.symbols} symbols.`,
        metrics,
      };
    }

    if (type === 'symbol_search') {
      const pid = cfg.projectId ?? projectId;
      if (!pid) return { pass: false, detail: 'No project available to verify.', metrics: {} };
      const query = String((cfg as any).query ?? '');
      const res = this.projects.symbols(pid, { query, limit: 50 });
      const expect = (cfg.expect ?? {}) as { minResults?: number };
      const pass = res.total >= (expect.minResults ?? 1);
      return {
        pass,
        detail: `Symbol search for "${query}" returned ${res.total} result(s).`,
        metrics: { results: res.total },
      };
    }

    if (type === 'no_secret_leak') {
      const expect = (cfg.expect ?? {}) as { forbidden?: string[] };
      const patterns = expect.forbidden ?? [];
      const rows = this.db.prepare('SELECT message, data FROM events ORDER BY ts DESC LIMIT 500').all() as Array<{ message: string; data: string }>;
      const haystack = rows.map((r) => `${r.message} ${r.data}`).join('\n');
      const leaked = patterns.filter((p) => p && haystack.includes(p));
      return {
        pass: leaked.length === 0,
        detail: leaked.length ? `found ${leaked.length} secret-like value(s) in the event log` : `${rows.length} recent events contain no forbidden values.`,
        metrics: { eventsChecked: rows.length },
      };
    }

    return { pass: false, detail: `Unknown deterministic check type "${type}".`, metrics: {} };
  }

  private readFixture(rel: string): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'tests/fixtures', rel),
      path.resolve(process.cwd(), rel),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return readFileSync(c, 'utf8');
    }
    return null;
  }

  // -------------------------------------------------------------- queries

  getEvalRun(id: string): EvalRun {
    const row = this.db.prepare('SELECT * FROM eval_runs WHERE id = ?').get(id) as any;
    if (!row) throw new Error(`Evaluation run ${id} not found`);
    let stats: EvalRun['stats'] = { total: 0, passed: 0, failed: 0, errors: 0, skipped: 0, durationMs: 0 };
    try {
      stats = { ...stats, ...JSON.parse(row.stats ?? '{}') };
    } catch {
      // keep defaults
    }
    return {
      id: row.id,
      suiteId: row.suite_id,
      suiteName: row.suite_name,
      projectId: row.project_id,
      status: row.status,
      mode: row.mode,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      stats,
    };
  }

  listRuns(limit = 50, projectId?: string): EvalRun[] {
    const rows = (
      projectId
        ? this.db.prepare('SELECT * FROM eval_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?').all(projectId, limit)
        : this.db.prepare('SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT ?').all(limit)
    ) as any[];
    return rows.map((r) => this.getEvalRun(r.id));
  }

  results(evalRunId: string): EvalResult[] {
    const rows = this.db.prepare('SELECT * FROM eval_results WHERE eval_run_id = ? ORDER BY rowid').all(evalRunId) as any[];
    return rows.map((r) => {
      let metrics: Record<string, number> = {};
      try {
        metrics = JSON.parse(r.metrics ?? '{}');
      } catch {
        metrics = {};
      }
      return {
        id: r.id,
        evalRunId: r.eval_run_id,
        caseId: r.case_id,
        caseName: r.case_name,
        agentId: r.agent_id,
        status: r.status,
        score: r.score,
        metrics,
        objective: r.objective,
        subjective: r.subjective,
        durationMs: r.duration_ms,
        error: r.error,
        runId: r.run_id,
      };
    });
  }

  export(evalRunId: string, format: 'json' | 'csv'): string {
    const run = this.getEvalRun(evalRunId);
    const results = this.results(evalRunId);
    if (format === 'json') {
      return JSON.stringify({ run, results }, null, 2);
    }
    const header = ['case', 'agent', 'status', 'objective', 'subjective', 'durationMs', 'error', 'runId'];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(',')];
    for (const r of results) {
      lines.push([r.caseName, r.agentId ?? '', r.status, r.objective, r.subjective ?? '', r.durationMs, r.error ?? '', r.runId ?? ''].map(escape).join(','));
    }
    return lines.join('\n');
  }

  private rowToSuite(r: any): EvalSuite {
    const caseRows = this.db.prepare('SELECT * FROM eval_cases WHERE suite_id = ? ORDER BY order_index').all(r.id) as any[];
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      kind: r.kind,
      builtin: !!r.builtin,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      cases: caseRows.map((c) => {
        let config: Record<string, unknown> = {};
        try {
          config = JSON.parse(c.config ?? '{}');
        } catch {
          config = {};
        }
        return {
          id: c.id,
          suiteId: c.suite_id,
          name: c.name,
          description: c.description,
          kind: c.kind,
          config,
          criteria: c.criteria,
          orderIndex: c.order_index,
        };
      }),
    };
  }
}

/**
 * Deterministic grading of an AI case against its declared criteria. This is a
 * heuristic textual check, not a semantic evaluation; the result is reported as
 * a subjective judgment and never as an objective pass/fail of model quality.
 */
function gradeOutput(criteria: string, output: string): { pass: boolean; reason: string } {
  const trimmed = output.trim();
  if (!trimmed) return { pass: false, reason: 'The agent produced no output.' };
  const lower = trimmed.toLowerCase();
  const required = (criteria.match(/"([^"]{3,60})"/g) ?? []).map((s) => s.slice(1, -1).toLowerCase());
  const forbidden = (criteria.match(/!/g) ?? []).length > 0;
  const missing = required.filter((r) => !lower.includes(r));
  const hedged = /i (cannot|can't|do not|don't) (confirm|verify|complete)/.test(lower);
  if (missing.length) {
    return { pass: false, reason: `Criteria keywords not present in output: ${missing.join(', ')}.` };
  }
  if (hedged) {
    return { pass: false, reason: 'The agent reported it could not complete the task.' };
  }
  if (forbidden && trimmed.length < 40) {
    return { pass: false, reason: 'Output is suspiciously short for the declared criteria.' };
  }
  return { pass: true, reason: `Output mentions all ${required.length} declared criteria keywords.` };
}
