import { afterEach, describe, expect, it } from 'vitest';
import { withIndexedProject } from './helpers/core';
import type { Core } from '../src/core/core';
import type { ChatRequest, ProviderConfig } from '../src/shared/types';
import { DemoAdapter } from '../src/core/providers/adapters/demo';
import { OpenAiCompatibleAdapter } from '../src/core/providers/adapters/openai';
import { AnthropicAdapter } from '../src/core/providers/adapters/anthropic';
import { GeminiAdapter } from '../src/core/providers/adapters/gemini';

let core: Core | null = null;
afterEach(() => {
  core?.dispose();
  core = null;
});

describe('shared project context', () => {
  it('stores, updates and deletes context per project', async () => {
    const { core: c, projectId } = await withIndexedProject('ctx-1');
    core = c;

    const created = c.context.upsert({
      projectId,
      key: 'error-handling',
      kind: 'convention',
      content: 'Always return typed errors from service functions.',
      tags: ['architecture'],
      includeInPrompt: true,
    });
    expect(created.key).toBe('error-handling');

    const updated = c.context.upsert({
      projectId,
      id: created.id,
      key: 'error-handling',
      kind: 'convention',
      content: 'Return typed errors; never throw raw strings.',
      tags: ['architecture', 'style'],
      includeInPrompt: true,
    });
    expect(updated.id).toBe(created.id);
    expect(updated.content).toMatch(/typed errors/);
    expect(c.context.list(projectId)).toHaveLength(1);

    expect(c.context.promptEntries(projectId).map((e) => e.key)).toEqual(['error-handling']);
    expect(c.context.delete(projectId, created.id)).toBe(true);
    expect(c.context.list(projectId)).toHaveLength(0);
  });

  it('keeps context scoped to its project', async () => {
    const { core: c, projectId } = await withIndexedProject('ctx-2');
    core = c;
    const entry = c.context.upsert({
      projectId,
      key: 'k',
      kind: 'note',
      content: 'scoped',
      tags: [],
      includeInPrompt: true,
    });
    expect(() =>
      c.context.upsert({
        projectId: 'prj_other',
        id: entry.id,
        key: 'k',
        kind: 'note',
        content: 'hijack',
        tags: [],
        includeInPrompt: true,
      }),
    ).toThrow(/another project/);
  });

  it('excludes entries marked as not for prompts', async () => {
    const { core: c, projectId } = await withIndexedProject('ctx-3');
    core = c;
    c.context.upsert({ projectId, key: 'included', kind: 'note', content: 'yes', tags: [], includeInPrompt: true });
    c.context.upsert({ projectId, key: 'excluded', kind: 'note', content: 'no', tags: [], includeInPrompt: false });
    expect(c.context.promptEntries(projectId).map((e) => e.key)).toEqual(['included']);
  });
});

describe('provider adapters', () => {
  const baseConfig = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
    id: 'p_test',
    kind: 'demo',
    name: 'Demo',
    baseUrl: null,
    defaultModel: 'demo-deterministic',
    enabled: true,
    credentialRef: null,
    config: {},
    createdAt: '',
    updatedAt: '',
    ...over,
  });

  it('seeds a demo provider that needs no credentials', async () => {
    const { core: c } = await withIndexedProject('prov-1');
    core = c;
    const demo = c.providers.demoProvider();
    expect(demo.kind).toBe('demo');
    const caps = c.providers.capabilitiesById(demo.id);
    expect(caps.streaming).toBe(false);
    expect(caps.toolCalling).toBe(true);
  });

  it('demo adapter is deterministic and makes exactly one tool call first', async () => {
    const adapter = new DemoAdapter();
    const cfg = baseConfig();
    const ctx = { apiKey: null, extra: {} };
    const req: ChatRequest = {
      messages: [
        { role: 'system', content: 'You are a planner.' },
        { role: 'user', content: 'Summarise' },
      ],
      tools: [
        { name: 'search_symbols', description: 'search', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
        { name: 'read_file', description: 'read', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
      ],
    };
    const first = await adapter.chat(cfg, req, ctx);
    expect(first.finishReason).toBe('tool-calls');
    expect(first.message.toolCalls).toHaveLength(1);
    expect(['search_symbols', 'read_file']).toContain(first.message.toolCalls![0].name);
    expect(first.usage).toEqual({ tokensIn: 0, tokensOut: 0 });

    const again = await adapter.chat(cfg, req, ctx);
    expect(again.message.toolCalls![0]).toEqual(first.message.toolCalls![0]);

    const last = await adapter.chat(
      cfg,
      {
        messages: [
          ...req.messages,
          { role: 'assistant', content: '', toolCalls: first.message.toolCalls },
          { role: 'tool', content: '{"total":1}', toolCallId: first.message.toolCalls![0].id },
        ],
        tools: req.tools,
      },
      ctx,
    );
    expect(last.finishReason).toBe('stop');
    expect(last.message.content).toMatch(/sample data/i);
  });

  it('reports adapter capabilities that match the implementation', () => {
    const cfg = baseConfig();
    const openai = new OpenAiCompatibleAdapter('openai');
    expect(openai.capabilities(cfg).toolCalling).toBe(true);
    expect(openai.capabilities(cfg).streaming).toBe(false);
    const anthropic = new AnthropicAdapter();
    expect(anthropic.capabilities(cfg).toolCalling).toBe(true);
    const gemini = new GeminiAdapter();
    expect(gemini.capabilities(cfg).toolCalling).toBe(true);
    // No adapter claims streaming while every request is non-streaming.
    for (const caps of [openai.capabilities(cfg), anthropic.capabilities(cfg), gemini.capabilities(cfg), new DemoAdapter().capabilities(cfg)]) {
      expect(caps.streaming).toBe(false);
    }
  });

  it('builds provider-specific request bodies without leaking keys into the URL', async () => {
    const openai = new OpenAiCompatibleAdapter('openai');
    const captured: { url?: string; headers?: Record<string, string>; body?: any } = {};
    const fakeFetch = (async (url: any, init: any) => {
      captured.url = String(url);
      captured.headers = init?.headers;
      captured.body = JSON.parse(init?.body ?? '{}');
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          model: 'm',
          usage: { prompt_tokens: 3, completion_tokens: 4 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const res = await openai.chat(
      baseConfig({ kind: 'openai', baseUrl: 'https://api.example.com/v1', defaultModel: 'gpt-x' }),
      { messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 'x', description: 'd', parameters: { type: 'object' } }] },
      { apiKey: 'sk-test-key-123', extra: {}, fetchImpl: fakeFetch },
    );
    expect(res.message.content).toBe('ok');
    expect(res.usage).toEqual({ tokensIn: 3, tokensOut: 4 });
    expect(captured.url).toBe('https://api.example.com/v1/chat/completions');
    expect(captured.url).not.toContain('sk-test-key-123');
    expect(captured.headers?.authorization ?? captured.headers?.Authorization).toContain('sk-test-key-123');
    expect(captured.body.messages[0].content).toBe('hi');
    expect(captured.body.tools[0].function.name).toBe('x');
  });

  it('surfaces provider HTTP errors as ProviderError with status', async () => {
    const openai = new OpenAiCompatibleAdapter('openai');
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'bad key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    await expect(
      openai.chat(baseConfig({ kind: 'openai' }), { messages: [{ role: 'user', content: 'hi' }] }, { apiKey: 'sk-bad', extra: {}, fetchImpl: fakeFetch }),
    ).rejects.toThrow(/401|bad key/i);
  });

  it('creates, updates and deletes provider configs with credential references', async () => {
    const { core: c } = await withIndexedProject('prov-2');
    core = c;
    const created = c.providers.create({ kind: 'anthropic', name: 'Claude', defaultModel: 'claude-x', apiKey: 'sk-ant-secret-value' });
    expect(created.credentialRef).toBeTruthy();
    expect(JSON.stringify(created)).not.toContain('sk-ant-secret-value');
    expect(c.credentials.has('provider', created.credentialRef!)).toBe(true);
    const hint = c.credentials.list('provider').find((x) => x.ref === created.credentialRef);
    expect(hint?.hint).not.toContain('sk-ant-secret-value');

    const updated = c.providers.update(created.id, { name: 'Claude 2', defaultModel: 'claude-y' });
    expect(updated.name).toBe('Claude 2');
    expect(updated.defaultModel).toBe('claude-y');

    c.providers.delete(created.id);
    expect(c.providers.list().some((p) => p.id === created.id)).toBe(false);
  });

  it('resolves model references of the form providerId:model', async () => {
    const { core: c } = await withIndexedProject('prov-3');
    core = c;
    const p = c.providers.create({ kind: 'openai-compatible', name: 'Local', baseUrl: 'http://127.0.0.1:11434/v1', defaultModel: 'llama' });
    expect(c.providers.resolveModelRef(`${p.id}:llama3`)).toEqual({ providerId: p.id, model: 'llama3' });
    expect(c.providers.resolveModelRef(`${p.id}/llama3`)).toEqual({ providerId: p.id, model: 'llama3' });
    expect(c.providers.resolveModelRef(p.id)).toEqual({ providerId: p.id, model: null });
    expect(c.providers.resolveModelRef('nonsense')).toBeNull();
    expect(c.providers.resolveModelRef(null)).toBeNull();
  });

  it('reports health failure instead of pretending a provider is reachable', async () => {
    const { core: c } = await withIndexedProject('prov-4');
    core = c;
    const p = c.providers.create({ kind: 'openai-compatible', name: 'Dead', baseUrl: 'http://127.0.0.1:9/v1', defaultModel: 'x' });
    const health = await c.providers.healthCheck(p.id);
    expect(health.ok).toBe(false);
    expect(health.message.length).toBeGreaterThan(0);
  });
});
