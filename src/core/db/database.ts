import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './migrations';

export type Db = Database.Database;

export interface OpenDbOptions {
  /** File path or ':memory:'. */
  file: string;
  readonly?: boolean;
}

/**
 * Opens the local SQLite store and applies migrations idempotently.
 * Local-first: the database never leaves the machine.
 */
export function openDb(opts: OpenDbOptions): Db {
  if (opts.file !== ':memory:') {
    fs.mkdirSync(path.dirname(opts.file), { recursive: true });
  }
  const db = new Database(opts.file, { readonly: opts.readonly ?? false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (!opts.readonly) migrate(db);
  return db;
}

export function migrate(db: Db): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((r) => (r as { id: string }).id),
  );
  const newlyApplied: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const run = db.transaction(() => {
      db.exec(m.up);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(m.id, new Date().toISOString());
    });
    run();
    newlyApplied.push(m.id);
  }
  return newlyApplied;
}

export function migrationStatus(db: Db): Array<{ id: string; applied_at: string }> {
  try {
    return db.prepare('SELECT id, applied_at FROM schema_migrations ORDER BY id').all() as Array<{
      id: string;
      applied_at: string;
    }>;
  } catch {
    return [];
  }
}
