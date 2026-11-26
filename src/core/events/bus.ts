import { EventEmitter } from 'node:events';
import type { EventRecord, Severity } from '../../shared/types';
import { newId, nowIso } from '../../shared/ids';
import { redactDeep } from '../redact';

export interface EmitInput {
  type: string;
  severity?: Severity;
  message?: string;
  projectId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  correlationId?: string | null;
  source?: string;
  data?: unknown;
  durationMs?: number | null;
}

type Listener = (event: EventRecord) => void;

/**
 * In-process typed event bus. Every listener receives redacted events so no
 * secret value can leak into traces, logs or the UI stream.
 */
export class EventBus {
  private emitter = new EventEmitter();
  private buffer: EventRecord[] = [];
  private persist: ((e: EventRecord) => void) | null = null;
  private historyLimit = 500;

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  setPersistence(fn: (e: EventRecord) => void): void {
    this.persist = fn;
  }

  emit(input: EmitInput): EventRecord {
    const event: EventRecord = {
      id: newId('evt'),
      ts: nowIso(),
      type: input.type,
      severity: input.severity ?? 'info',
      projectId: input.projectId ?? null,
      runId: input.runId ?? null,
      taskId: input.taskId ?? null,
      agentId: input.agentId ?? null,
      correlationId: input.correlationId ?? null,
      source: input.source ?? 'app',
      message: input.message ?? '',
      data: input.data === undefined ? null : redactDeep(input.data),
      durationMs: input.durationMs ?? null,
    };
    try {
      this.persist?.(event);
    } catch {
      // Persistence failures must not break execution flows.
    }
    this.buffer.push(event);
    if (this.buffer.length > this.historyLimit) this.buffer.shift();
    this.emitter.emit('event', event);
    return event;
  }

  on(listener: Listener): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  recent(): EventRecord[] {
    return [...this.buffer];
  }
}
