import { randomUUID } from 'node:crypto';

/** Generate a short prefixed unique id, e.g. newId('task') -> task_9f3a... */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
