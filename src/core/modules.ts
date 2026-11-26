import type { Db } from './db/database';
import type { EventBus } from './events/bus';
import type { ModuleId, ModuleState } from '../shared/types';
import { CORE_MODULES } from '../shared/types';

const DEFAULTS: Record<ModuleId, boolean> = {
  'agent-control': true,
  'project-intelligence': true,
  openbridge: true,
  tracex: true,
  evaluation: true,
  providers: true,
  'shared-context': true,
  echoshell: false,
  'rebuild-studio': false,
};

/**
 * Capability registry. A disabled module must not perform background work:
 * services check `isEnabled` before any operation and the orchestrator refuses
 * to schedule when its module is off.
 */
export class ModuleService {
  constructor(
    private db: Db,
    private events: EventBus,
  ) {
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO modules (id, enabled, config, updated_at) VALUES (?, ?, '{}', ?)
       ON CONFLICT(id) DO NOTHING`,
    );
    for (const [id, enabled] of Object.entries(DEFAULTS)) {
      insert.run(id, enabled ? 1 : 0, now);
    }
  }

  list(): ModuleState[] {
    const rows = this.db.prepare('SELECT id, enabled, config, updated_at FROM modules ORDER BY id').all() as Array<{
      id: ModuleId;
      enabled: number;
      config: string;
      updated_at: string | null;
    }>;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const all = [...CORE_MODULES, 'echoshell', 'rebuild-studio'] as ModuleId[];
    return all.map((id) => {
      const row = byId.get(id);
      let config: Record<string, unknown> = {};
      try {
        config = row ? (JSON.parse(row.config) as Record<string, unknown>) : {};
      } catch {
        config = {};
      }
      return {
        id,
        enabled: row ? row.enabled === 1 : DEFAULTS[id],
        core: CORE_MODULES.includes(id),
        config,
        updatedAt: row?.updated_at ?? null,
      };
    });
  }

  isEnabled(id: ModuleId): boolean {
    const row = this.db.prepare('SELECT enabled FROM modules WHERE id = ?').get(id) as { enabled: number } | undefined;
    if (!row) return DEFAULTS[id];
    return row.enabled === 1;
  }

  /** Core modules cannot be disabled. */
  set(id: ModuleId, enabled: boolean, config?: Record<string, unknown>): ModuleState {
    if (CORE_MODULES.includes(id) && !enabled) {
      throw new Error(`Module "${id}" is required and cannot be disabled`);
    }
    const existing = this.db.prepare('SELECT config FROM modules WHERE id = ?').get(id) as
      | { config: string }
      | undefined;
    let merged: Record<string, unknown> = {};
    if (existing) {
      try {
        merged = JSON.parse(existing.config) as Record<string, unknown>;
      } catch {
        merged = {};
      }
    }
    if (config) merged = { ...merged, ...config };
    this.db
      .prepare(
        `INSERT INTO modules (id, enabled, config, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, config = excluded.config, updated_at = excluded.updated_at`,
      )
      .run(id, enabled ? 1 : 0, JSON.stringify(merged), new Date().toISOString());
    this.events.emit({
      type: enabled ? 'module.enabled' : 'module.disabled',
      message: `${id} ${enabled ? 'enabled' : 'disabled'}`,
      data: { moduleId: id, enabled },
      source: 'modules',
    });
    return { id, enabled, core: CORE_MODULES.includes(id), config: merged, updatedAt: new Date().toISOString() };
  }

  config<T extends Record<string, unknown>>(id: ModuleId): T {
    const row = this.db.prepare('SELECT config FROM modules WHERE id = ?').get(id) as { config: string } | undefined;
    if (!row) return {} as T;
    try {
      return JSON.parse(row.config) as T;
    } catch {
      return {} as T;
    }
  }

  /** Throws when a module is disabled - used at every module entry point. */
  requireEnabled(id: ModuleId): void {
    if (!this.isEnabled(id)) {
      throw new Error(`Module "${id}" is disabled. Enable it in Settings > Modules to use this feature.`);
    }
  }
}
