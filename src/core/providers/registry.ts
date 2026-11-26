import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { CredentialStore } from '../credentials';
import type {
  ChatRequest,
  ChatResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  ProviderHealth,
} from '../../shared/types';
import { newId, nowIso } from '../../shared/ids';
import { ProviderError, type AdapterContext, type ProviderAdapter } from './types';
import { OpenAiCompatibleAdapter } from './adapters/openai';
import { AnthropicAdapter } from './adapters/anthropic';
import { GeminiAdapter } from './adapters/gemini';
import { DemoAdapter } from './adapters/demo';

const ENV_KEYS: Record<string, { key?: string; base?: string }> = {
  openai: { key: 'ARQ_OPENAI_API_KEY', base: 'ARQ_OPENAI_BASE_URL' },
  'openai-compatible': { key: 'ARQ_COMPAT_API_KEY' },
  anthropic: { key: 'ARQ_ANTHROPIC_API_KEY' },
  gemini: { key: 'ARQ_GEMINI_API_KEY' },
  ollama: { base: 'ARQ_OLLAMA_HOST' },
  demo: {},
};

export interface CreateProviderInput {
  kind: ProviderConfig['kind'];
  name: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
  apiKey?: string;
  config?: Record<string, unknown>;
}

/**
 * Provider registry: CRUD over provider configs plus an adapter map that can
 * be extended without modifying call sites (open-closed provider architecture).
 */
export class ProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();
  /** Tracks consecutive failures per provider for health display. */
  private health = new Map<string, ProviderHealth>();

  constructor(
    private db: Db,
    private events: EventBus,
    private credentials: CredentialStore,
  ) {
    this.registerAdapter(new OpenAiCompatibleAdapter('openai'));
    this.registerAdapter(new OpenAiCompatibleAdapter('openai-compatible'));
    this.registerAdapter(new OpenAiCompatibleAdapter('ollama'));
    this.registerAdapter(new AnthropicAdapter());
    this.registerAdapter(new GeminiAdapter());
    this.registerAdapter(new DemoAdapter());
    this.seedDemoProvider();
  }

  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.kind, adapter);
  }

  getAdapter(kind: string): ProviderAdapter {
    const a = this.adapters.get(kind);
    if (!a) throw new Error(`No adapter registered for provider kind "${kind}"`);
    return a;
  }

  private seedDemoProvider(): void {
    const existing = this.db.prepare("SELECT id FROM providers WHERE kind = 'demo'").get();
    if (existing) return;
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO providers (id, kind, name, base_url, default_model, enabled, credential_ref, config, created_at, updated_at)
         VALUES (?, 'demo', ?, NULL, 'demo-deterministic', 1, NULL, '{}', ?, ?)`,
      )
      .run(newId('prov'), 'Demo (sample data)', now, now);
  }

  list(): ProviderConfig[] {
    const rows = this.db
      .prepare('SELECT id, kind, name, base_url, default_model, enabled, credential_ref, config, created_at, updated_at FROM providers ORDER BY created_at')
      .all() as any[];
    return rows.map((r) => this.rowToConfig(r));
  }

  get(id: string): ProviderConfig {
    const row = this.db
      .prepare('SELECT id, kind, name, base_url, default_model, enabled, credential_ref, config, created_at, updated_at FROM providers WHERE id = ?')
      .get(id) as any;
    if (!row) throw new Error(`Provider ${id} not found`);
    return this.rowToConfig(row);
  }

  private rowToConfig(r: any): ProviderConfig {
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(r.config ?? '{}');
    } catch {
      config = {};
    }
    return {
      id: r.id,
      kind: r.kind,
      name: r.name,
      baseUrl: r.base_url,
      defaultModel: r.default_model,
      enabled: r.enabled === 1,
      credentialRef: r.credential_ref,
      config,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  create(input: CreateProviderInput): ProviderConfig {
    this.getAdapter(input.kind);
    const id = newId('prov');
    const now = nowIso();
    const credentialRef = input.apiKey ? `${id}:api-key` : null;
    if (input.apiKey && credentialRef) {
      this.credentials.set('provider', credentialRef, input.apiKey);
    }
    let baseUrl = input.baseUrl ?? null;
    if (!baseUrl && input.kind === 'ollama') {
      baseUrl = process.env.ARQ_OLLAMA_HOST ?? 'http://127.0.0.1:11434';
    }
    this.db
      .prepare(
        `INSERT INTO providers (id, kind, name, base_url, default_model, enabled, credential_ref, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      )
      .run(id, input.kind, input.name, baseUrl, input.defaultModel ?? null, credentialRef, JSON.stringify(input.config ?? {}), now, now);
    return this.get(id);
  }

  update(id: string, patch: Partial<Pick<ProviderConfig, 'name' | 'baseUrl' | 'defaultModel' | 'enabled' | 'config'>>, apiKey?: string): ProviderConfig {
    const current = this.get(id);
    if (apiKey) {
      const ref = current.credentialRef ?? `${id}:api-key`;
      this.credentials.set('provider', ref, apiKey);
      this.db.prepare('UPDATE providers SET credential_ref = ? WHERE id = ?').run(ref, id);
    }
    this.db
      .prepare(
        `UPDATE providers SET name = ?, base_url = ?, default_model = ?, enabled = ?, config = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        patch.name ?? current.name,
        patch.baseUrl !== undefined ? patch.baseUrl : current.baseUrl,
        patch.defaultModel !== undefined ? patch.defaultModel : current.defaultModel,
        patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : current.enabled ? 1 : 0,
        JSON.stringify(patch.config ?? current.config),
        nowIso(),
        id,
      );
    return this.get(id);
  }

  delete(id: string): void {
    const p = this.get(id);
    if (p.credentialRef) this.credentials.delete('provider', p.credentialRef);
    this.db.prepare('DELETE FROM providers WHERE id = ?').run(id);
    this.health.delete(id);
  }

  /** Resolve the API key: encrypted store first, then environment fallback. */
  private async contextFor(cfg: ProviderConfig): Promise<AdapterContext> {
    let key: string | null = null;
    if (cfg.credentialRef) key = this.credentials.get('provider', cfg.credentialRef);
    if (!key) {
      const env = ENV_KEYS[cfg.kind];
      if (env?.key) key = process.env[env.key] || null;
    }
    if (!key && cfg.kind !== 'ollama' && cfg.kind !== 'demo' && cfg.kind !== 'openai-compatible') {
      // still let adapters produce a precise error; mark clearly here
    }
    return { apiKey: key, extra: cfg.config ?? {} };
  }

  capabilities(cfg: ProviderConfig): ProviderCapabilities {
    return this.getAdapter(cfg.kind).capabilities(cfg);
  }

  capabilitiesById(id: string): ProviderCapabilities {
    return this.capabilities(this.get(id));
  }

  async listModels(id: string): Promise<ModelInfo[]> {
    const cfg = this.get(id);
    const ctx = await this.contextFor(cfg);
    return this.getAdapter(cfg.kind).listModels(cfg, ctx);
  }

  async healthCheck(id: string): Promise<ProviderHealth> {
    const cfg = this.get(id);
    const ctx = await this.contextFor(cfg);
    const result = await this.getAdapter(cfg.kind).health(cfg, ctx);
    this.health.set(id, result);
    return result;
  }

  healthOf(id: string): ProviderHealth | null {
    return this.health.get(id) ?? null;
  }

  /**
   * Execute a chat request with retries on retryable provider errors.
   * Emits provider.request/response/error trace events with durations.
   */
  async chat(id: string, req: ChatRequest, opts: { retries?: number; correlationId?: string } = {}): Promise<ChatResponse> {
    const cfg = this.get(id);
    if (!cfg.enabled) throw new Error(`Provider "${cfg.name}" is disabled`);
    const adapter = this.getAdapter(cfg.kind);
    const ctx = await this.contextFor(cfg);
    const retries = opts.retries ?? 2;
    let attempt = 0;
    const start = Date.now();
    this.events.emit({
      type: 'provider.request',
      message: `${cfg.kind}/${cfg.defaultModel ?? 'default'} request`,
      correlationId: opts.correlationId,
      data: { providerId: id, kind: cfg.kind, model: cfg.defaultModel, messages: req.messages.length, tools: req.tools?.length ?? 0 },
      source: 'providers',
    });
    for (;;) {
      try {
        const res = await adapter.chat(cfg, req, ctx);
        this.events.emit({
          type: 'provider.response',
          severity: 'info',
          message: `${cfg.kind} response in ${Date.now() - start}ms`,
          correlationId: opts.correlationId,
          durationMs: Date.now() - start,
          data: { providerId: id, model: res.model, usage: res.usage, finishReason: res.finishReason, attempt },
          source: 'providers',
        });
        this.health.set(id, { ok: true, message: 'ok', latencyMs: Date.now() - start });
        return res;
      } catch (err) {
        const pe = err instanceof ProviderError ? err : null;
        const retryable = pe?.retryable ?? false;
        attempt += 1;
        if (retryable && attempt <= retries) {
          this.events.emit({
            type: 'provider.error',
            severity: 'warn',
            message: `retryable provider error (attempt ${attempt}): ${pe?.message ?? err}`,
            correlationId: opts.correlationId,
            data: { providerId: id, attempt },
            source: 'providers',
          });
          await new Promise((r) => setTimeout(r, Math.min(4000, 400 * 2 ** attempt)));
          continue;
        }
        this.events.emit({
          type: 'provider.error',
          severity: 'error',
          message: pe?.message ?? String(err),
          correlationId: opts.correlationId,
          durationMs: Date.now() - start,
          data: { providerId: id, attempt },
          source: 'providers',
        });
        this.health.set(id, { ok: false, message: pe?.message ?? String(err), latencyMs: Date.now() - start });
        throw err;
      }
    }
  }

  /** Parse "providerId/model" refs used by agents. */
  /**
   * Model references are `providerId:model` (the form the UI writes) or
   * `providerId/model` (a legacy form). A bare provider id means "use the
   * provider's default model".
   */
  resolveModelRef(ref: string | null): { providerId: string; model: string | null } | null {
    if (!ref) return null;
    const trimmed = ref.trim();
    if (!trimmed) return null;
    const colon = trimmed.lastIndexOf(':');
    const slash = trimmed.indexOf('/');
    const idx = colon > 0 ? colon : slash;
    if (idx <= 0) {
      try {
        this.get(trimmed);
      } catch {
        return null;
      }
      return { providerId: trimmed, model: null };
    }
    const providerId = trimmed.slice(0, idx);
    const model = trimmed.slice(idx + 1) || null;
    try {
      this.get(providerId);
    } catch {
      return null;
    }
    return { providerId, model };
  }

  /** Provider for demo-mode runs; throws if missing (it is seeded automatically). */
  demoProvider(): ProviderConfig {
    const row = this.db.prepare("SELECT id FROM providers WHERE kind = 'demo' LIMIT 1").get() as { id: string } | undefined;
    if (!row) throw new Error('Demo provider missing');
    return this.get(row.id);
  }
}
