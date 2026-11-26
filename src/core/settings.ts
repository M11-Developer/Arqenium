import type { Db } from './db/database';

/** Typed wrapper over the settings key/value store. */
export class SettingsService {
  constructor(private db: Db) {}

  get<T = unknown>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), new Date().toISOString());
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  list(): Array<{ key: string; value: unknown }> {
    const rows = this.db.prepare('SELECT key, value FROM settings ORDER BY key').all() as Array<{
      key: string;
      value: string;
    }>;
    return rows.map((r) => {
      let value: unknown = r.value;
      try {
        value = JSON.parse(r.value);
      } catch {
        /* keep raw */
      }
      return { key: r.key, value };
    });
  }
}
