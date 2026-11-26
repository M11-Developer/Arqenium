import { contextBridge, ipcRenderer } from 'electron';

/**
 * Typed, minimal preload bridge. The renderer gets exactly four capabilities:
 * a validated invoke channel, two native file pickers, and an event stream.
 * No Node.js API, no filesystem handle and no shell access is exposed.
 */
type Result<T> = { ok: true; result: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

const allowedEventTypes = new Set(['string']);

const api = {
  runtime: 'electron' as const,

  invoke<T = unknown>(channel: string, input?: unknown): Promise<Result<T>> {
    if (typeof channel !== 'string' || channel.length === 0 || channel.length > 120) {
      return Promise.resolve({ ok: false, error: { code: 'invalid_channel', message: 'Channel must be a non-empty string' } });
    }
    return ipcRenderer.invoke('arq:invoke', channel, input ?? {});
  },

  pickDirectory(): Promise<string | null> {
    return ipcRenderer.invoke('arq:pickDirectory');
  },

  pickFile(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> {
    return ipcRenderer.invoke('arq:pickFile', filters ?? []);
  },

  openExternal(url: string): Promise<boolean> {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return Promise.resolve(false);
    return ipcRenderer.invoke('arq:openExternal', url);
  },

  onEvent(listener: (event: unknown) => void): () => void {
    if (typeof listener !== 'function') return () => undefined;
    const handler = (_e: unknown, payload: unknown) => {
      if (!allowedEventTypes.has(typeof payload) || payload === null) return;
      listener(payload);
    };
    ipcRenderer.on('arq:event', handler);
    return () => ipcRenderer.removeListener('arq:event', handler);
  },
};

contextBridge.exposeInMainWorld('arqenium', api);

export type ArqeniumBridge = typeof api;
