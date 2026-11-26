import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db/database';
import type { EventBus } from './events/bus';
import { maskSecret } from './redact';

/**
 * Encrypted local credential store (AES-256-GCM).
 *
 * The data key is derived from a machine-local key file created with mode
 * 0600 on first use. Secrets are never returned in full after being stored -
 * `list` exposes only masked hints. No secret value is ever written to events.
 */
export class CredentialStore {
  private key: Buffer | null = null;

  constructor(
    private db: Db,
    private events: EventBus,
    private dataDir: string,
  ) {}

  private getKey(): Buffer {
    if (this.key) return this.key;
    const keyPath = path.join(this.dataDir, 'secret.key');
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath);
      if (raw.length !== 32) throw new Error('Corrupt credential key file');
      this.key = raw;
    } else {
      const key = crypto.randomBytes(32);
      fs.writeFileSync(keyPath, key, { mode: 0o600 });
      try {
        fs.chmodSync(keyPath, 0o600);
      } catch {
        /* best effort on non-posix */
      }
      this.key = key;
    }
    return this.key;
  }

  set(scope: string, ref: string, value: string): void {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getKey(), iv);
    const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO credentials (scope, ref, algo, ciphertext, iv, tag, hint, created_at, updated_at)
         VALUES (?, ?, 'aes-256-gcm', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope, ref) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv,
           tag = excluded.tag, hint = excluded.hint, updated_at = excluded.updated_at`,
      )
      .run(scope, ref, enc.toString('base64'), iv.toString('base64'), tag.toString('base64'), maskSecret(value), now, now);
    this.events.emit({
      type: 'credential.stored',
      message: `Credential stored for ${scope}/${ref}`,
      data: { scope, ref, hint: maskSecret(value) },
      source: 'credentials',
    });
  }

  get(scope: string, ref: string): string | null {
    const row = this.db.prepare('SELECT ciphertext, iv, tag, algo FROM credentials WHERE scope = ? AND ref = ?').get(
      scope,
      ref,
    ) as { ciphertext: string; iv: string; tag: string; algo: string } | undefined;
    if (!row) return null;
    if (row.algo !== 'aes-256-gcm') throw new Error('Unsupported credential algorithm');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.getKey(), Buffer.from(row.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  }

  has(scope: string, ref: string): boolean {
    const row = this.db.prepare('SELECT 1 AS x FROM credentials WHERE scope = ? AND ref = ?').get(scope, ref);
    return !!row;
  }

  delete(scope: string, ref: string): boolean {
    const res = this.db.prepare('DELETE FROM credentials WHERE scope = ? AND ref = ?').run(scope, ref);
    if (res.changes > 0) {
      this.events.emit({
        type: 'credential.deleted',
        message: `Credential deleted for ${scope}/${ref}`,
        data: { scope, ref },
        source: 'credentials',
      });
      return true;
    }
    return false;
  }

  list(scope?: string): Array<{ scope: string; ref: string; hint: string; updatedAt: string }> {
    const rows = (
      scope
        ? this.db.prepare('SELECT scope, ref, hint, updated_at FROM credentials WHERE scope = ? ORDER BY ref').all(scope)
        : this.db.prepare('SELECT scope, ref, hint, updated_at FROM credentials ORDER BY scope, ref').all()
    ) as Array<{ scope: string; ref: string; hint: string; updated_at: string }>;
    return rows.map((r) => ({ scope: r.scope, ref: r.ref, hint: r.hint, updatedAt: r.updated_at }));
  }

  /** Wipe every stored credential (local data deletion control). */
  purgeAll(): number {
    const res = this.db.prepare('DELETE FROM credentials').run();
    return res.changes;
  }
}
