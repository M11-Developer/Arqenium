import type { Channel, ChannelInput } from '../../shared/channels';

export interface ArqeniumEvent {
  id: string;
  ts: string;
  type: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  projectId: string | null;
  runId: string | null;
  taskId: string | null;
  agentId: string | null;
  correlationId: string | null;
  source: string;
  message: string;
  data: unknown;
  durationMs: number | null;
}

export class RequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

interface ElectronBridge {
  runtime: 'electron';
  invoke<T>(channel: string, input?: unknown): Promise<{ ok: true; result: T } | { ok: false; error: { code: string; message: string; details?: unknown } }>;
  pickDirectory(): Promise<string | null>;
  pickFile(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null>;
  openExternal(url: string): Promise<boolean>;
  onEvent(listener: (event: unknown) => void): () => void;
}

declare global {
  interface Window {
    arqenium?: ElectronBridge;
  }
}

const isElectron = typeof window !== 'undefined' && !!window.arqenium;

export const runtime: 'electron' | 'web' = isElectron ? 'electron' : 'web';

/** Single request entrypoint: Electron IPC in the desktop app, HTTP otherwise. */
export async function request<C extends Channel>(channel: C, input: ChannelInput<C>): Promise<unknown> {
  if (window.arqenium) {
    const res = await window.arqenium.invoke(channel, input);
    if (!res.ok) throw new RequestError(res.error.code, res.error.message, res.error.details);
    return res.result;
  }
  const res = await fetch('/api/invoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, input }),
  });
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    throw new RequestError('bad_response', `Server returned a non-JSON response (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const err = payload?.error ?? {};
    throw new RequestError(err.code ?? 'request_failed', err.message ?? `HTTP ${res.status}`, err.details);
  }
  return payload.result;
}

export async function pickDirectory(): Promise<string | null> {
  if (window.arqenium) return window.arqenium.pickDirectory();
  // The web runtime cannot open a native dialog; the UI falls back to a text input.
  return null;
}

export async function pickFile(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> {
  if (window.arqenium) return window.arqenium.pickFile(filters);
  return null;
}

export function canPickNative(): boolean {
  return isElectron;
}

export async function openExternal(url: string): Promise<void> {
  if (window.arqenium) {
    await window.arqenium.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Subscribe to the live event stream (SSE in web, IPC push in Electron). */
export function subscribeEvents(onEvent: (e: ArqeniumEvent) => void, onState?: (state: 'live' | 'reconnecting' | 'closed') => void): () => void {
  if (window.arqenium) {
    onState?.('live');
    const off = window.arqenium.onEvent((payload) => onEvent(payload as ArqeniumEvent));
    return off;
  }
  let source: EventSource | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    source = new EventSource('/api/events');
    source.onopen = () => onState?.('live');
    source.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data) as ArqeniumEvent);
      } catch {
        // ignore malformed frames
      }
    };
    source.onerror = () => {
      onState?.('reconnecting');
      source?.close();
      source = null;
      if (!closed) retry = setTimeout(connect, 2500);
    };
  };
  connect();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    source?.close();
    onState?.('closed');
  };
}
