import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  ProviderHealth,
} from '../../../shared/types';
import { ProviderError, combineSignals, withTimeout, type AdapterContext, type ProviderAdapter } from '../types';

/** OpenAI Chat Completions protocol: used by OpenAI, OpenAI-compatible servers and Ollama (/v1). */

function baseUrlFor(cfg: ProviderConfig, kind: string): string {
  if (cfg.baseUrl) return cfg.baseUrl.replace(/\/$/, '');
  if (kind === 'ollama') return 'http://127.0.0.1:11434';
  if (kind === 'openai') return 'https://api.openai.com/v1';
  throw new Error(`Provider kind "${kind}" requires a base URL`);
}

function toOpenAiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: t.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  kind: string,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  let res: Response;
  try {
    res = await withTimeout(fetchImpl(url, init), timeoutMs, `${kind} request`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryable = /timed out|fetch failed|network|ECONNRESET|ECONNREFUSED/i.test(msg);
    throw new ProviderError(`${kind}: ${msg}`, null, retryable, kind);
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const detail = body?.error?.message ?? body?.message ?? text.slice(0, 300) ?? res.statusText;
    const retryable = res.status === 429 || res.status >= 500;
    throw new ProviderError(`${kind}: HTTP ${res.status}: ${detail}`, res.status, retryable, kind);
  }
  return body;
}

export class OpenAiCompatibleAdapter implements ProviderAdapter {
  constructor(readonly kind: 'openai' | 'openai-compatible' | 'ollama') {}

  capabilities(_cfg: ProviderConfig): ProviderCapabilities {
    return {
      // Requests are non-streaming: reporting `streaming: true` here would be a
      // capability claim the adapter does not honour.
      streaming: false,
      toolCalling: true,
      vision: this.kind === 'openai',
      modelDiscovery: true,
      usageReporting: true,
    };
  }

  private headers(ctx: AdapterContext): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (ctx.apiKey) h.authorization = `Bearer ${ctx.apiKey}`;
    return h;
  }

  async listModels(cfg: ProviderConfig, ctx: AdapterContext): Promise<ModelInfo[]> {
    const base = baseUrlFor(cfg, this.kind);
    const url = this.kind === 'ollama' ? `${base}/api/tags` : `${base}/models`;
    const body = await requestJson(
      url,
      { method: 'GET', headers: this.headers(ctx) },
      20_000,
      this.kind,
      ctx.fetchImpl,
    );
    if (this.kind === 'ollama') {
      const models = (body?.models ?? []) as Array<{ name: string; details?: { parameter_size?: string } }>;
      return models.map((m) => ({ id: m.name, name: m.name, contextWindow: null }));
    }
    const data = (body?.data ?? []) as Array<{ id: string; context_length?: number }>;
    return data.map((m) => ({ id: m.id, name: m.id, contextWindow: m.context_length ?? null }));
  }

  async chat(cfg: ProviderConfig, req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse> {
    const base = baseUrlFor(cfg, this.kind);
    const model = cfg.defaultModel;
    if (!model) throw new ProviderError(`${this.kind}: no model configured`, null, false, this.kind);
    const payload: Record<string, unknown> = {
      model,
      messages: toOpenAiMessages(req.messages),
      stream: false,
    };
    if (req.maxTokens) payload.max_tokens = req.maxTokens;
    if (req.temperature !== undefined) payload.temperature = req.temperature;
    if (req.tools?.length) {
      payload.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      payload.tool_choice = 'auto';
    }
    const timeoutMs = Number(ctx.extra.timeoutMs ?? 90_000);
    const body = await requestJson(
      `${base}/chat/completions`,
      {
        method: 'POST',
        headers: this.headers(ctx),
        body: JSON.stringify(payload),
        signal: combineSignals(req.signal, AbortSignal.timeout(timeoutMs)) ?? undefined,
      },
      timeoutMs + 5_000,
      this.kind,
      ctx.fetchImpl,
    );
    const choice = body?.choices?.[0];
    if (!choice) throw new ProviderError(`${this.kind}: empty response`, null, false, this.kind);
    const msg = choice.message ?? {};
    const toolCalls = Array.isArray(msg.tool_calls)
      ? msg.tool_calls.map((tc: any, i: number) => ({
          id: tc.id ?? `call_${i}`,
          name: tc.function?.name ?? '',
          arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments ?? {}),
        }))
      : [];
    const finishRaw = choice.finish_reason as string | undefined;
    const finish: ChatResponse['finishReason'] =
      finishRaw === 'tool_calls' ? 'tool-calls' : finishRaw === 'length' ? 'length' : finishRaw === 'stop' ? 'stop' : toolCalls.length ? 'tool-calls' : 'unknown';
    return {
      message: {
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : msg.content == null ? '' : JSON.stringify(msg.content),
        ...(toolCalls.length ? { toolCalls } : {}),
      },
      model: body.model ?? model,
      usage: body.usage
        ? { tokensIn: body.usage.prompt_tokens ?? null, tokensOut: body.usage.completion_tokens ?? null }
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
