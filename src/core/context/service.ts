import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { ContextEntry } from '../../shared/types';
import { newId, nowIso } from '../../shared/ids';

/**
 * Project-scoped shared context: decisions, conventions, notes and outcomes
 * that agents may read during runs. Fully inspectable, editable and deletable.
 */
export class ContextService {
  constructor(
    private db: Db,
    private events: EventBus,
  ) {}

  list(projectId: string): ContextEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM context_entries WHERE project_id = ? ORDER BY updated_at DESC')
      .all(projectId) as any[];
    return rows.map(rowToEntry);
  }

  get(id: string): ContextEntry {
    const row = this.db.prepare('SELECT * FROM context_entries WHERE id = ?').get(id);
    if (!row) throw new Error(`Context entry ${id} not found`);
    return rowToEntry(row);
  }

  upsert(input: {
    projectId: string;
    id?: string;
    key: string;
    kind: ContextEntry['kind'];
    content: string;
    tags: string[];
    includeInPrompt: boolean;
  }): ContextEntry {
    const now = nowIso();
    if (input.id) {
      const existing = this.get(input.id);
      if (existing.projectId !== input.projectId) throw new Error('Context entry belongs to another project');
      this.db
        .prepare(
          'UPDATE context_entries SET key = ?, kind = ?, content = ?, tags = ?, include_in_prompt = ?, updated_at = ? WHERE id = ?',
        )
        .run(input.key, input.kind, input.content, JSON.stringify(input.tags), input.includeInPrompt ? 1 : 0, now, input.id);
      this.events.emit({
        type: 'context.updated',
        projectId: input.projectId,
        message: `Context updated: ${input.key}`,
        data: { id: input.id, key: input.key },
        source: 'context',
      });
      return this.get(input.id);
    }
    const id = newId('ctx');
    this.db
      .prepare(
        `INSERT INTO context_entries (id, project_id, key, kind, content, tags, source, include_in_prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, ?)
         ON CONFLICT(project_id, key) DO UPDATE SET kind = excluded.kind, content = excluded.content,
           tags = excluded.tags, include_in_prompt = excluded.include_in_prompt, updated_at = excluded.updated_at`,
      )
      .run(id, input.projectId, input.key, input.kind, input.content, JSON.stringify(input.tags), input.includeInPrompt ? 1 : 0, now, now);
    this.events.emit({
      type: 'context.created',
      projectId: input.projectId,
      message: `Context created: ${input.key}`,
      data: { id, key: input.key, kind: input.kind },
      source: 'context',
    });
    const row = this.db
      .prepare('SELECT * FROM context_entries WHERE project_id = ? AND key = ?')
      .get(input.projectId, input.key) as any;
    return rowToEntry(row);
  }

  delete(projectId: string, id: string): boolean {
    const entry = this.get(id);
    if (entry.projectId !== projectId) throw new Error('Context entry belongs to another project');
    const res = this.db.prepare('DELETE FROM context_entries WHERE id = ?').run(id);
    if (res.changes) {
      this.events.emit({
        type: 'context.deleted',
        projectId,
        message: `Context deleted: ${entry.key}`,
        data: { id, key: entry.key },
        source: 'context',
      });
    }
    return res.changes > 0;
  }

  /** Entries included in agent prompts (project-scoped, opt-out per entry). */
  promptEntries(projectId: string): ContextEntry[] {
    return this.list(projectId).filter((e) => e.includeInPrompt);
  }
}

function rowToEntry(r: any): ContextEntry {
  let tags: string[] = [];
  try {
    tags = JSON.parse(r.tags ?? '[]');
  } catch {
    tags = [];
  }
  return {
    id: r.id,
    projectId: r.project_id,
    key: r.key,
    kind: r.kind,
    content: r.content,
    tags,
    source: r.source,
    includeInPrompt: r.include_in_prompt === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
