import type {
  ChatRequest,
  ChatResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  ProviderHealth,
} from '../../../shared/types';
import { ProviderError, withTimeout, type AdapterContext, type ProviderAdapter } from '../types';

/** Google Gemini generateContent adapter. */

function baseUrlFor(cfg: ProviderConfig): string {
  return (cfg.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
}

function splitMessages(req: ChatRequest): { system: string; contents: unknown[] } {
  const systemParts: string[] = [];
  const contents: unknown[] = [];
  for (const m of req.messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      let response: unknown;
      try {
        response = JSON.parse(m.content);
      } catch {
        response = { result: m.content };
      }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name ?? 'tool', response } }],
      });
      continue;
    }
    if (m.role === 'assistant') {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) {
        let args: unknown = {};
        try {
          args = JSON.parse(tc.arguments || '{}');
        } catch {
          args = {};
        }
        parts.push({ functionCall: { name: tc.name, args } });
      }
      if (parts.length) contents.push({ role: 'model', parts });
      continue;
    }
    contents.push({ role: 'user', parts: [{ text: m.content }] });
  }
  return { system: systemParts.join('\n\n'), contents };
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  let res: Response;
  try {
    res = await withTimeout(fetchImpl(url, init), timeoutMs, 'gemini request');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError(`gemini: ${msg}`, null, /timed out|fetch failed|ECONN/i.test(msg), 'gemini');
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
    throw new ProviderError(`gemini: HTTP ${res.status}: ${detail}`, res.status, res.status === 429 || res.status >= 500, 'gemini');
  }
  return body;
}

export class GeminiAdapter implements ProviderAdapter {
  readonly kind = 'gemini';

  capabilities(_cfg: ProviderConfig): ProviderCapabilities {
    return { streaming: false, toolCalling: true, vision: true, modelDiscovery: true, usageReporting: true };
  }

  private key(ctx: AdapterContext): string {
    if (!ctx.apiKey) throw new ProviderError('gemini: missing API key', null, false, 'gemini');
    return ctx.apiKey;
  }

  async listModels(cfg: ProviderConfig, ctx: AdapterContext): Promise<ModelInfo[]> {
    const body = await requestJson(
      `${baseUrlFor(cfg)}/v1beta/models?page_size=100`,
      { method: 'GET', headers: { 'x-goog-api-key': this.key(ctx) } },
      20_000,
    );
    const models = (body?.models ?? []) as Array<{
      name: string;
      displayName?: string;
      inputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    }>;
    return models
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => ({
        id: m.name.replace(/^models\//, ''),
        name: m.displayName ?? m.name,
        contextWindow: m.inputTokenLimit ?? null,
      }));
  }

  async chat(cfg: ProviderConfig, req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse> {
    const model = cfg.defaultModel;
    if (!model) throw new ProviderError('gemini: no model configured', null, false, 'gemini');
    const { system, contents } = splitMessages(req);
    const payload: Record<string, unknown> = { contents };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };
    if (req.temperature !== undefined) payload.generationConfig = { temperature: req.temperature, maxOutputTokens: req.maxTokens };
    if (req.tools?.length) {
      payload.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    const timeoutMs = Number(ctx.extra.timeoutMs ?? 90_000);
    const body = await requestJson(
      `${baseUrlFor(cfg)}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.key(ctx) },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([req.signal ?? new AbortController().signal, AbortSignal.timeout(timeoutMs)]),
      },
      timeoutMs + 5_000,
      ctx.fetchImpl,
    );
    const candidate = body?.candidates?.[0];
    const parts = (candidate?.content?.parts ?? []) as Array<any>;
    const text = parts.filter((p) => p.text).map((p) => p.text as string).join('\n');
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        id: `call_${i}`,
        name: String(p.functionCall.name ?? ''),
        arguments: JSON.stringify(p.functionCall.args ?? {}),
      }));
    const finishRaw = candidate?.finishReason as string | undefined;
    const finish: ChatResponse['finishReason'] =
      finishRaw === 'STOP' ? (toolCalls.length ? 'tool-calls' : 'stop') : finishRaw === 'MAX_TOKENS' ? 'length' : toolCalls.length ? 'tool-calls' : 'unknown';
    const usage = body?.usageMetadata;
    return {
      message: { role: 'assistant', content: text, ...(toolCalls.length ? { toolCalls } : {}) },
      model,
      usage: usage
        ? { tokensIn: usage.promptTokenCount ?? null, tokensOut: usage.candidatesTokenCount ?? null }
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
