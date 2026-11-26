import type { Db } from './db/database';
import type { EventBus } from './events/bus';
import type { Approval, ApprovalDecisionInput, ApprovalKind } from '../shared/types';
import { newId, nowIso } from '../shared/ids';

export interface CreateApprovalInput {
  runId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  kind: ApprovalKind;
  title: string;
  detail?: string;
  payload?: Record<string, unknown>;
  risk?: Approval['risk'];
  source: Approval['source'];
  /** Auto-decide when the policy allows (e.g. explicitly auto-approved tools). */
  autoApprove?: boolean;
  autoApproveReason?: string;
}

interface Waiter {
  resolve: (a: Approval) => void;
  timer: NodeJS.Timeout;
}

/**
 * Human approval gate for sensitive operations. Every decision is persisted
 * with actor and reason, and emitted to TraceX. Nothing sensitive executes
 * without a recorded approval.
 */
export class ApprovalService {
  private waiters = new Map<string, Waiter>();

  constructor(
    private db: Db,
    private events: EventBus,
  ) {}

  create(input: CreateApprovalInput): Approval {
    const id = newId('appr');
    const now = nowIso();
    const approval: Approval = {
      id,
      runId: input.runId ?? null,
      taskId: input.taskId ?? null,
      projectId: input.projectId ?? null,
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? '',
      payload: input.payload ?? {},
      risk: input.risk ?? 'medium',
      status: 'pending',
      source: input.source,
      createdAt: now,
      decidedAt: null,
      decisionReason: null,
      decidedBy: null,
    };
    this.db
      .prepare(
        `INSERT INTO approvals (id, run_id, task_id, project_id, kind, title, detail, payload, risk, status, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(
        id,
        approval.runId,
        approval.taskId,
        approval.projectId,
        approval.kind,
        approval.title,
        approval.detail,
        JSON.stringify(approval.payload),
        approval.risk,
        approval.source,
        now,
      );
    this.events.emit({
      type: 'approval.requested',
      severity: approval.risk === 'high' ? 'warn' : 'info',
      message: approval.title,
      runId: approval.runId,
      taskId: approval.taskId,
      projectId: approval.projectId,
      data: { approvalId: id, kind: approval.kind, risk: approval.risk, source: approval.source },
      source: 'approvals',
    });
    if (input.autoApprove) {
      return this.decide(id, {
        approved: true,
        reason: input.autoApproveReason ?? 'auto-approved by policy',
        decidedBy: 'policy',
      });
    }
    return approval;
  }

  decide(id: string, input: ApprovalDecisionInput): Approval {
    const current = this.get(id);
    if (current.status !== 'pending') return current;
    const now = nowIso();
    const status = input.approved ? 'approved' : 'denied';
    this.db
      .prepare('UPDATE approvals SET status = ?, decided_at = ?, decision_reason = ?, decided_by = ? WHERE id = ? AND status = ?')
      .run(status, now, input.reason ?? null, input.decidedBy ?? 'user', id, 'pending');
    const updated = this.get(id);
    this.events.emit({
      type: input.approved ? 'approval.approved' : 'approval.denied',
      severity: input.approved ? 'info' : 'warn',
      message: `${input.approved ? 'Approved' : 'Denied'}: ${current.title}`,
      runId: current.runId,
      taskId: current.taskId,
      projectId: current.projectId,
      data: { approvalId: id, kind: current.kind, reason: input.reason ?? null, decidedBy: input.decidedBy ?? 'user' },
      source: 'approvals',
    });
    const waiter = this.waiters.get(id);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.waiters.delete(id);
      waiter.resolve(updated);
    }
    return updated;
  }

  /**
   * Withdraw every pending approval that belongs to a run (used when a run is
   * canceled) and release anything waiting on a decision, so a cancel can never
   * leave an agent blocked on an approval that will never come.
   */
  cancelForRun(runId: string, reason = 'run canceled'): Approval[] {
    const pending = this.db
      .prepare("SELECT id FROM approvals WHERE run_id = ? AND status = 'pending'")
      .all(runId) as Array<{ id: string }>;
    const canceled: Approval[] = [];
    for (const { id } of pending) {
      this.db
        .prepare("UPDATE approvals SET status = 'canceled', decided_at = ?, decision_reason = ? WHERE id = ? AND status = 'pending'")
        .run(nowIso(), reason, id);
      const updated = this.get(id);
      const waiter = this.waiters.get(id);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.waiters.delete(id);
        waiter.resolve(updated);
      }
      this.events.emit({
        type: 'approval.canceled',
        severity: 'warn',
        message: `Approval canceled: ${updated.title}`,
        runId,
        taskId: updated.taskId,
        projectId: updated.projectId,
        data: { approvalId: id, kind: updated.kind, reason },
        source: 'approvals',
      });
      canceled.push(updated);
    }
    return canceled;
  }

  get(id: string): Approval {
    const row = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
    if (!row) throw new Error(`Approval ${id} not found`);
    return rowToApproval(row);
  }

  list(filter: { status?: Approval['status']; runId?: string; limit?: number } = {}): Approval[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    if (filter.runId) {
      clauses.push('run_id = ?');
      params.push(filter.runId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM approvals ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, filter.limit ?? 200) as any[];
    return rows.map(rowToApproval);
  }

  /** Await a decision (used by the orchestrator for agent-initiated actions). */
  waitFor(id: string, timeoutMs: number): Promise<Approval> {
    const current = this.get(id);
    if (current.status !== 'pending') return Promise.resolve(current);
    return new Promise<Approval>((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        this.db
          .prepare("UPDATE approvals SET status = 'expired', decided_at = ?, decision_reason = ? WHERE id = ? AND status = 'pending'")
          .run(nowIso(), 'timed out waiting for a decision', id);
        const expired = this.get(id);
        this.events.emit({
          type: 'approval.expired',
          severity: 'warn',
          message: `Approval expired: ${current.title}`,
          runId: current.runId,
          data: { approvalId: id },
          source: 'approvals',
        });
        resolve(expired);
      }, timeoutMs);
      this.waiters.set(id, { resolve, timer });
    });
  }

  /** Convenience: create an approval and wait for a decision in one call. */
  async request(input: CreateApprovalInput, timeoutMs: number): Promise<Approval> {
    const approval = this.create(input);
    if (approval.status !== 'pending') return approval;
    return this.waitFor(approval.id, timeoutMs);
  }

  dispose(): void {
    for (const w of this.waiters.values()) clearTimeout(w.timer);
    this.waiters.clear();
  }
}

function rowToApproval(r: any): Approval {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(r.payload ?? '{}');
  } catch {
    payload = {};
  }
  return {
    id: r.id,
    runId: r.run_id,
    taskId: r.task_id,
    projectId: r.project_id,
    kind: r.kind,
    title: r.title,
    detail: r.detail,
    payload,
    risk: r.risk,
    status: r.status,
    source: r.source,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decisionReason: r.decision_reason,
    decidedBy: r.decided_by,
  };
}
