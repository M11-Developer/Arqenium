import type {
  ChatRequest,
  ChatResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  ProviderHealth,
} from '../../../shared/types';
import { ProviderError, withTimeout, type AdapterContext, type ProviderAdapter } from '../types';

/** Anthropic Messages API adapter. */

function baseUrlFor(cfg: ProviderConfig): string {
  return (cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
}

function splitMessages(req: ChatRequest): { system: string; messages: unknown[] } {
  const systemParts: string[] = [];
  const out: unknown[] = [];
  for (const m of req.messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      out.push({
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: m.content, is_error: false },
        ],
      });
      continue;
    }
    if (m.role === 'assistant') {
      const content: unknown[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls ?? []) {
        let input: unknown = {};
        try {
          input = JSON.parse(tc.arguments || '{}');
        } catch {
          input = {};
        }
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
      }
      out.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: '' }] });
      continue;
    }
    out.push({ role: 'user', content: m.content });
  }
  // Anthropic requires alternating roles starting with user; merge consecutive same-role messages.
  const merged: Array<{ role: string; content: unknown }> = [];
  for (const msg of out as Array<{ role: string; content: unknown }>) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      const lastArr = Array.isArray(last.content) ? last.content : [{ type: 'text', text: String(last.content) }];
      const newArr = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: String(msg.content) }];
      last.content = [...lastArr, ...newArr];
    } else {
      merged.push(msg);
    }
  }
  if (merged.length && merged[0].role !== 'user') {
    merged.unshift({ role: 'user', content: [{ type: 'text', text: '(continue)' }] });
  }
  return { system: systemParts.join('\n\n'), messages: merged };
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  let res: Response;
  try {
    res = await withTimeout(fetchImpl(url, init), timeoutMs, 'anthropic request');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError(`anthropic: ${msg}`, null, /timed out|fetch failed|ECONN/i.test(msg), 'anthropic');
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const detail = body?.error?.message ?? text.slice(0, 300);
    throw new ProviderError(`anthropic: HTTP ${res.status}: ${detail}`, res.status, res.status === 429 || res.status >= 500, 'anthropic');
  }
  return body;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly kind = 'anthropic';

  capabilities(_cfg: ProviderConfig): ProviderCapabilities {
    return { streaming: false, toolCalling: true, vision: true, modelDiscovery: true, usageReporting: true };
  }

  private headers(ctx: AdapterContext): Record<string, string> {
    if (!ctx.apiKey) throw new ProviderError('anthropic: missing API key', null, false, 'anthropic');
    return {
      'content-type': 'application/json',
      'x-api-key': ctx.apiKey,
      'anthropic-version': String(ctx.extra.apiVersion ?? '2023-06-01'),
    };
  }

  async listModels(cfg: ProviderConfig, ctx: AdapterContext): Promise<ModelInfo[]> {
    const body = await requestJson(
      `${baseUrlFor(cfg)}/v1/models?limit=100`,
      { method: 'GET', headers: this.headers(ctx) },
      20_000,
      ctx.fetchImpl,
    );
    const data = (body?.data ?? []) as Array<{ id: string; display_name?: string }>;
    return data.map((m) => ({ id: m.id, name: m.display_name ?? m.id, contextWindow: null }));
  }

  async chat(cfg: ProviderConfig, req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse> {
    const model = cfg.defaultModel;
    if (!model) throw new ProviderError('anthropic: no model configured', null, false, 'anthropic');
    const { system, messages } = splitMessages(req);
    const payload: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens ?? 4096,
      messages,
    };
    if (system) payload.system = system;
    if (req.temperature !== undefined) payload.temperature = req.temperature;
    if (req.tools?.length) {
      payload.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }
    const timeoutMs = Number(ctx.extra.timeoutMs ?? 90_000);
    const body = await requestJson(
      `${baseUrlFor(cfg)}/v1/messages`,
      {
        method: 'POST',
        headers: this.headers(ctx),
        body: JSON.stringify(payload),
        signal: combineSignalsLocal(req.signal, timeoutMs),
      },
      timeoutMs + 5_000,
      ctx.fetchImpl,
    );
    const content = (body?.content ?? []) as Array<any>;
    const textParts = content.filter((c) => c.type === 'text').map((c) => c.text as string);
    const toolCalls = content
      .filter((c) => c.type === 'tool_use')
      .map((c, i) => ({
        id: c.id ?? `call_${i}`,
        name: String(c.name ?? ''),
        arguments: JSON.stringify(c.input ?? {}),
      }));
    const stop = body?.stop_reason as string | undefined;
    const finish: ChatResponse['finishReason'] =
      stop === 'tool_use' ? 'tool-calls' : stop === 'max_tokens' ? 'length' : stop === 'end_turn' ? 'stop' : toolCalls.length ? 'tool-calls' : 'unknown';
    return {
      message: {
        role: 'assistant',
        content: textParts.join('\n'),
        ...(toolCalls.length ? { toolCalls } : {}),
      },
      model: body?.model ?? model,
      usage: body?.usage
        ? { tokensIn: body.usage.input_tokens ?? null, tokensOut: body.usage.output_tokens ?? null }
        : null,
      finishReason: finish,
      raw: body,
    };
  }

  async health(cfg: ProviderConfig, ctx: AdapterContext): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.listModels(cfg, ctx);
      return { ok: true, message: 'reachable', latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start };
    }
  }
}

function combineSignalsLocal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal | undefined {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  const ctrl = new AbortController();
  const abort = () => ctrl.abort(signal.reason ?? new Error('aborted'));
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  return AbortSignal.any([ctrl.signal, timeout]);
}
