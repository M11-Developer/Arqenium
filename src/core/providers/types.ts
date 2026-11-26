import type {
  ChatRequest,
  ChatResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  ProviderHealth,
} from '../../shared/types';

export interface AdapterContext {
  /** Resolved API key, or null for keyless endpoints (e.g. local Ollama). */
  apiKey: string | null;
  /** Extra per-provider config stored with the provider record. */
  extra: Record<string, unknown>;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Provider adapters normalize authentication, model discovery, generation,
 * tool calling, usage reporting, errors and health checks across vendors.
 * Adapters never claim a capability they have not demonstrated.
 */
export interface ProviderAdapter {
  readonly kind: string;
  capabilities(cfg: ProviderConfig): ProviderCapabilities;
  listModels(cfg: ProviderConfig, ctx: AdapterContext): Promise<ModelInfo[]>;
  chat(cfg: ProviderConfig, req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse>;
  health(cfg: ProviderConfig, ctx: AdapterContext): Promise<ProviderHealth>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly providerKind: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function combineSignals(a: AbortSignal | undefined, b: AbortSignal | undefined): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;
  const ctrl = new AbortController();
  const abort = () => ctrl.abort(a.reason ?? b.reason);
  if (a.aborted || b.aborted) abort();
  else {
    a.addEventListener('abort', abort, { once: true });
    b.addEventListener('abort', abort, { once: true });
  }
  return ctrl.signal;
}
