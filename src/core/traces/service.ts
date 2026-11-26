import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { EventRecord, Severity, ToolCallRecord } from '../../shared/types';
import { newId, nowIso } from '../../shared/ids';

export interface EventFilter {
  projectId?: string;
  runId?: string;
  type?: string;
  severity?: Severity;
  search?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

/**
 * TraceX: persists structured events, exposes run timelines, tool-call
 * inspection, filtering/search and failure summaries. All payloads arriving
 * from the bus are already redacted.
 */
export class TraceService {
  private retentionDays = 30;

  constructor(
    private db: Db,
    private events: EventBus,
  ) {
    this.events.setPersistence((e) => this.persist(e));
    try {
      const row = this.db.prepare("SELECT value FROM settings WHERE key = 'tracex.retentionDays'").get() as
        | { value: string }
        | undefined;
      if (row) this.retentionDays = Math.max(1, Number(JSON.parse(row.value)) || 30);
    } catch {
      /* default */
    }
  }

  private persist(e: EventRecord): void {
    this.db
      .prepare(
        `INSERT INTO events (id, ts, type, severity, project_id, run_id, task_id, agent_id, correlation_id, source, message, data, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.id,
        e.ts,
        e.type,
        e.severity,
        e.projectId,
        e.runId,
        e.taskId,
        e.agentId,
        e.correlationId,
        e.source,
        e.message,
        e.data == null ? null : JSON.stringify(e.data),
        e.durationMs,
      );
  }

  query(filter: EventFilter = {}): { items: EventRecord[]; total: number } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.projectId) {
      clauses.push('project_id = ?');
      params.push(filter.projectId);
    }
    if (filter.runId) {
      clauses.push('run_id = ?');
      params.push(filter.runId);
    }
    if (filter.type) {
      clauses.push('type = ?');
      params.push(filter.type);
    }
    if (filter.severity) {
      clauses.push('severity = ?');
      params.push(filter.severity);
    }
    if (filter.since) {
      clauses.push('ts >= ?');
      params.push(filter.since);
    }
    if (filter.search) {
      clauses.push('(message LIKE ? ESCAPE \'\\\' OR data LIKE ? ESCAPE \'\\\')');
      const q = `%${filter.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      params.push(q, q);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT COUNT(*) AS c FROM events ${where}`).get(...params) as { c: number }).c;
    const rows = this.db
      .prepare(`SELECT * FROM events ${where} ORDER BY ts DESC, rowid DESC LIMIT ? OFFSET ?`)
      .all(...params, filter.limit ?? 200, filter.offset ?? 0) as any[];
    return { items: rows.map(rowToEvent), total };
  }

  runEvents(runId: string, limit = 1000): EventRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE run_id = ? ORDER BY ts ASC, rowid ASC LIMIT ?')
      .all(runId, limit) as any[];
    return rows.map(rowToEvent);
  }

  eventTypes(): Array<{ type: string; count: number }> {
    return this.db
      .prepare('SELECT type, COUNT(*) AS count FROM events GROUP BY type ORDER BY count DESC')
      .all() as Array<{ type: string; count: number }>;
  }

  toolCalls(filter: { runId?: string; limit?: number } = {}): ToolCallRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.runId) {
      clauses.push('run_id = ?');
      params.push(filter.runId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM tool_calls ${where} ORDER BY started_at DESC LIMIT ?`)
      .all(...params, filter.limit ?? 200) as any[];
    return rows.map(rowToToolCall);
  }

  recordToolCallStart(input: {
    runId?: string | null;
    taskId?: string | null;
    server: string;
    tool: string;
    source: ToolCallRecord['source'];
    input: unknown;
    approvalId?: string | null;
  }): string {
    const id = newId('tcall');
    this.db
      .prepare(
        `INSERT INTO tool_calls (id, run_id, task_id, server, tool, source, input, status, approval_id, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'started', ?, ?)`,
      )
      .run(
        id,
        input.runId ?? null,
        input.taskId ?? null,
        input.server,
        input.tool,
        input.source,
        JSON.stringify(input.input ?? null),
        input.approvalId ?? null,
        nowIso(),
      );
    return id;
  }

  recordToolCallEnd(
    id: string,
    status: ToolCallRecord['status'],
    output: unknown,
    error?: string | null,
    durationMs?: number | null,
  ): void {
    this.db
      .prepare('UPDATE tool_calls SET status = ?, output = ?, error = ?, finished_at = ?, duration_ms = ? WHERE id = ?')
      .run(
        status,
        output == null ? null : JSON.stringify(output),
        error ?? null,
        nowIso(),
        durationMs ?? null,
        id,
      );
  }

  /** Aggregate diagnostics for one run or across all runs. */
  summary(runId?: string): {
    events: number;
    errors: number;
    warnings: number;
    failures: Array<{ type: string; message: string; ts: string; taskId: string | null }>;
    avgTaskMs: number | null;
    toolCalls: number;
    durationMs: number | null;
  } {
    const where = runId ? 'WHERE run_id = ?' : '';
    const params = runId ? [runId] : [];
    const counts = this.db
      .prepare(
        `SELECT
           COUNT(*) AS events,
           SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) AS errors,
           SUM(CASE WHEN severity = 'warn' THEN 1 ELSE 0 END) AS warnings
         FROM events ${where}`,
      )
      .get(...params) as { events: number; errors: number | null; warnings: number | null };

    const failureRows = this.db
      .prepare(
        `SELECT type, message, ts, task_id FROM events ${where ? `${where} AND` : 'WHERE'} severity = 'error'
         ORDER BY ts DESC LIMIT 50`,
      )
      .all(...params) as Array<{ type: string; message: string; ts: string; task_id: string | null }>;

    const taskRow = this.db
      .prepare(
        `SELECT AVG((julianday(finished_at) - julianday(started_at)) * 86400000) AS avg_ms, COUNT(*) AS n
         FROM tasks WHERE run_id = ? AND finished_at IS NOT NULL AND started_at IS NOT NULL`,
      )
      .get(runId ?? '') as { avg_ms: number | null; n: number };

    const toolRow = this.db
      .prepare(`SELECT COUNT(*) AS c FROM tool_calls ${runId ? 'WHERE run_id = ?' : ''}`)
      .get(...(runId ? [runId] : [])) as { c: number };

    let durationMs: number | null = null;
    if (runId) {
      const run = this.db.prepare('SELECT started_at, finished_at FROM runs WHERE id = ?').get(runId) as
        | { started_at: string | null; finished_at: string | null }
        | undefined;
      if (run?.started_at && run.finished_at) {
        durationMs = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
      }
    }

    return {
      events: counts.events ?? 0,
      errors: counts.errors ?? 0,
      warnings: counts.warnings ?? 0,
      failures: failureRows.map((f) => ({ type: f.type, message: f.message, ts: f.ts, taskId: f.task_id })),
      avgTaskMs: taskRow?.avg_ms ?? null,
      toolCalls: toolRow.c,
      durationMs,
    };
  }

  /** Delete events older than the retention window. */
  prune(): number {
    const cutoff = new Date(Date.now() - this.retentionDays * 86_400_000).toISOString();
    const res = this.db.prepare('DELETE FROM events WHERE ts < ?').run(cutoff);
    return res.changes;
  }

  setRetention(days: number): void {
    this.retentionDays = Math.max(1, days);
  }
}

function rowToEvent(r: any): EventRecord {
  let data: unknown = null;
  if (r.data != null) {
    try {
      data = JSON.parse(r.data);
    } catch {
      data = r.data;
    }
  }
  return {
    id: r.id,
    ts: r.ts,
    type: r.type,
    severity: r.severity,
    projectId: r.project_id,
    runId: r.run_id,
    taskId: r.task_id,
    agentId: r.agent_id,
    correlationId: r.correlation_id,
    source: r.source,
    message: r.message,
    data,
    durationMs: r.duration_ms,
  };
}

function rowToToolCall(r: any): ToolCallRecord {
  const parse = (v: string | null) => {
    if (v == null) return null;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  return {
    id: r.id,
    runId: r.run_id,
    taskId: r.task_id,
    server: r.server,
    tool: r.tool,
    source: r.source,
    input: parse(r.input),
    output: parse(r.output),
    status: r.status,
    error: r.error,
    approvalId: r.approval_id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
  };
}
