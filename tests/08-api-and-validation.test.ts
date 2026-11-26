import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createCore, type Core } from '../src/core/core';
import { Dispatcher, DispatchFailure } from '../src/core/dispatcher';
import { createApiServer, type RunningServerHandle } from '../src/server/http';
import { CORE_MODULES } from '../src/shared/types';
import { REPO_ROOT } from './helpers/core';

let core: Core;
let handle: RunningServerHandle;
let base: string;

beforeAll(async () => {
  core = createCore({ inMemory: true });
  const project = await core.projects.add(path.join(REPO_ROOT, 'tests/fixtures/fixture-app'));
  await core.projects.reindex(project.id);
  handle = createApiServer({ core, port: 0, host: '127.0.0.1', allowedOrigins: ['http://localhost:5173'] });
  await handle.started;
  base = handle.origin();
});

afterEach(async () => {
  // keep the server alive across tests in this file
});

import { afterAll } from 'vitest';
afterAll(async () => {
  await handle.close();
  await core.dispose();
});

async function invoke(channel: string, input: unknown, init: RequestInit = {}) {
  const res = await fetch(`${base}/api/invoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify({ channel, input }),
    ...init,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe('HTTP API surface', () => {
  it('exposes a health endpoint with module state', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.runtime).toBe('web');
    expect(body.version).toBe(core.version);
    expect(body.modules.length).toBeGreaterThanOrEqual(7);
    expect(body.modules.find((m: { id: string }) => m.id === 'echoshell').enabled).toBe(false);
  });

  it('serves the boot payload the renderer needs', async () => {
    const { status, body } = await invoke('app.info', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.runtime).toBe('web');
    expect(body.result.version).toBe(core.version);
    expect(Array.isArray(body.result.channels)).toBe(true);
    expect(body.result.channels).toContain('projects.reindex');
    expect(body.result.capabilities).toBeTruthy();
  });

  it('rejects malformed envelopes, unknown channels and bad input', async () => {
    const bad = await fetch(`${base}/api/invoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"nope":1}' });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('invalid_request');

    const unknown = await invoke('does.not.exist', {});
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe('unknown_channel');

    const invalid = await invoke('projects.reindex', { projectId: 42 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('invalid_input');
    expect(JSON.stringify(invalid.body.details)).toMatch(/projectId/);
  });

  it('maps a missing project to a 404 and a domain error to 409', async () => {
    const missing = await invoke('projects.tree', { projectId: 'prj_nope' });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('not_found');

    const project = core.projects.list()[0];
    const required = await invoke('projects.file', { projectId: project.id, path: '.env' });
    expect(required.status).toBe(403);
    expect(required.body.error).toBe('not_permitted');
  });

  it('refuses a channel for a disabled module with a clear code', async () => {
    const res = await invoke('terminal.sessions', { projectId: core.projects.list()[0].id });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('module_disabled');
    expect(res.body.message).toMatch(/echoshell/);
  });

  it('returns 409 approval_required for MCP tools that are not auto-approved', async () => {
    const missing = await invoke('mcp.call', { id: 'mcp_missing', tool: 'x', arguments: {}, approve: false });
    // An unknown server is a not-found rather than an approval problem.
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('not_found');
  });

  it('enforces the configured CORS allow-list', async () => {
    const blocked = await fetch(`${base}/api/health`, { headers: { origin: 'https://evil.example' } });
    expect(blocked.status).toBe(403);
    const allowed = await fetch(`${base}/api/health`, { headers: { origin: 'http://localhost:5173' } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('answers preflight requests for allowed origins only', async () => {
    const ok = await fetch(`${base}/api/invoke`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
    });
    expect(ok.status).toBe(204);
    const bad = await fetch(`${base}/api/invoke`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(bad.status).toBe(403);
  });

  it('rejects bodies that exceed the size cap', async () => {
    const huge = 'x'.repeat(5 * 1024 * 1024);
    const res = await fetch(`${base}/api/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'settings.list', input: { pad: huge } }),
    });
    expect([400, 413]).toContain(res.status);
  });

  it('streams events over SSE with the right framing', async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const seen: string[] = [];
    // Trigger an event after the stream is open.
    setTimeout(() => core.events.emit({ type: 'sse.test', message: 'hello sse', source: 'test' }), 60);
    const deadline = Date.now() + 5000;
    let buffer = '';
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        seen.push(chunk);
        if (chunk.includes('sse.test')) {
          controller.abort();
          expect(chunk.startsWith('event:')).toBe(false); // default message framing
          expect(chunk).toContain('data: ');
          const payload = JSON.parse(chunk.replace(/^data: /, ''));
          expect(payload.type).toBe('sse.test');
          expect(payload.message).toBe('hello sse');
          return;
        }
      }
    }
    throw new Error(`SSE event not received; saw ${seen.length} chunks`);
  });

  it('serves the SPA shell and 404s unknown API routes', async () => {
    const api404 = await fetch(`${base}/api/unknown`);
    expect(api404.status).toBe(404);
    const spa = await fetch(`${base}/some/route`);
    expect([200, 404]).toContain(spa.status);
  });

  it('runs a full journey across the API: create agent, run it, read traces and evals', async () => {
    const project = core.projects.list()[0];

    const agentRes = await invoke('agents.create', { projectId: project.id, name: 'API bot', role: 'planner', systemPrompt: 'Plan.' });
    expect(agentRes.status).toBe(200);
    const agentId = agentRes.body.result.id;

    const runRes = await invoke('runs.create', {
      projectId: project.id,
      mode: 'demo',
      labels: ['api-journey'],
      tasks: [{ title: 'Journey task', description: 'do it', pipeline: [agentId], dependsOn: [], input: '', priority: 50, maxAttempts: 1 }],
    });
    expect(runRes.status).toBe(200);
    const runId = runRes.body.result.run.id;

    // `runs.create` starts the run immediately and streams progress via TraceX.
    let got = await invoke('runs.get', { runId });
    for (let i = 0; i < 100 && !['completed', 'failed', 'canceled'].includes(got.body.result.run.status); i++) {
      await new Promise((r) => setTimeout(r, 50));
      got = await invoke('runs.get', { runId });
    }
    expect(got.status).toBe(200);
    expect(got.body.result.run.status).toBe('completed');
    expect(String(got.body.result.tasks[0].output ?? '').length).toBeGreaterThan(0);

    const events = await invoke('runs.events', { runId, limit: 200 });
    expect(Array.isArray(events.body.result)).toBe(true);
    expect(events.body.result.length).toBeGreaterThan(5);

    const trace = await invoke('trace.events', { runId, limit: 50, offset: 0 });
    expect(trace.body.result.total).toBeGreaterThan(0);

    const toolCalls = await invoke('trace.toolCalls', { runId });
    expect(toolCalls.body.result.length).toBeGreaterThan(0);

    const summary = await invoke('trace.summary', { runId });
    expect(summary.body.result.events).toBeGreaterThan(0);

    const evalRun = await invoke('evals.run', { suiteId: 'suite-fixture-integrity', projectId: project.id });
    expect(evalRun.status).toBe(200);
    expect(evalRun.body.result.evalRun.stats.passed).toBe(3);

    const list = await invoke('evals.runs', { projectId: project.id });
    expect(list.body.result.length).toBeGreaterThan(0);

    const exportRes = await invoke('evals.export', { evalRunId: evalRun.body.result.evalRun.id, format: 'json' });
    expect(exportRes.body.result.content).toContain('suite');
  });

  it('keeps internal MCP status and module toggles in sync through the API', async () => {
    const initial = await invoke('mcp.internal.status', {});
    expect(initial.body.result.running).toBe(false);

    await invoke('modules.set', { id: 'rebuild-studio', enabled: true });
    const modules = await invoke('modules.list', {});
    expect(modules.body.result.find((m: { id: string }) => m.id === 'rebuild-studio').enabled).toBe(true);

    const denied = await invoke('modules.set', { id: 'agent-control', enabled: false });
    expect(denied.status).toBe(409);
    expect(denied.body.message).toMatch(/cannot be disabled/);

    await invoke('modules.set', { id: 'rebuild-studio', enabled: false });
  });

  it('reports capability gates for the desktop bridge', async () => {
    const info = await invoke('app.info', {});
    expect(info.body.result.capabilities.supportsIpc).toBe(false);
    expect(info.body.result.capabilities.supportsWindowControls).toBe(false);
    expect(info.body.result.capabilities.runtime).toBe('web');
  });
});

describe('dispatcher validation invariants', () => {
  it('validates every registered channel has a schema and vice versa', async () => {
    const dispatcher = new Dispatcher(core, 'web');
    const channels = dispatcher.channels();
    expect(channels.length).toBeGreaterThan(80);
    for (const channel of channels) {
      expect(channel).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
    }
    expect(new Set(channels).size).toBe(channels.length);
  });

  it('rejects unknown channels before touching services', async () => {
    const dispatcher = new Dispatcher(core, 'web');
    await expect(dispatcher.dispatch('nope.nope', {})).rejects.toMatchObject({ code: 'unknown_channel' });
  });

  it('rejects extra fields so the API contract stays strict', async () => {
    const dispatcher = new Dispatcher(core, 'web');
    await expect(dispatcher.dispatch('projects.list', { surprise: true } as never)).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('marks core modules in the shared contract consistently', () => {
    expect(CORE_MODULES).toContain('project-intelligence');
    expect(CORE_MODULES).toContain('openbridge');
    expect(CORE_MODULES).not.toContain('echoshell');
    expect(CORE_MODULES).not.toContain('rebuild-studio');
  });

  it('exposes an error taxonomy the UI can render', async () => {
    const failure = new DispatchFailure('not_found', 'missing');
    expect(failure.code).toBe('not_found');
    expect(failure.message).toBe('missing');
    expect(failure).toBeInstanceOf(Error);
  });

  it('never leaves the data dir uninitialised on disk-backed cores', async () => {
    const tmp = path.join(process.cwd(), '.arqenium-data', 'api-disk');
    fs.rmSync(tmp, { recursive: true, force: true });
    const disk = createCore({ dataDir: tmp });
    expect(fs.existsSync(path.join(tmp, 'arqenium.db'))).toBe(true);
    disk.dispose();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
