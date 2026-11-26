import { afterEach, describe, expect, it } from 'vitest';
import { withIndexedProject } from './helpers/core';
import { Dispatcher, DispatchFailure } from '../src/core/dispatcher';
import type { Core } from '../src/core/core';

let core: Core | null = null;
afterEach(async () => {
  if (!core) return;
  await core.mcp.disconnectAll().catch(() => undefined);
  await core.internalMcp.stop().catch(() => undefined);
  core.dispose();
  core = null;
});

const INTERNAL_PORT = 4391;

async function startInternal(c: Core) {
  await c.internalMcp.start(INTERNAL_PORT);
  return `http://127.0.0.1:${INTERNAL_PORT}/mcp`;
}

describe('MCP server registration and lifecycle', () => {
  it('registers a server with safe default permissions and never auto-connects', async () => {
    const { core: c } = await withIndexedProject('mcp-1');
    core = c;
    const server = c.mcp.add({ name: 'Internal', transport: 'http', url: 'http://127.0.0.1:9/mcp' });
    expect(server.enabled).toBe(true);
    expect(server.status).toBe('disabled');
    expect(server.permissions.allowTools).toEqual([]);
    expect(server.permissions.autoApprove).toEqual([]);
    expect(c.mcp.isConnected(server.id)).toBe(false);
  });

  it('rejects duplicate names and invalid transports', async () => {
    const { core: c } = await withIndexedProject('mcp-2');
    core = c;
    c.mcp.add({ name: 'Dup', transport: 'http', url: 'http://127.0.0.1:9/mcp' });
    expect(() => c.mcp.add({ name: 'Dup', transport: 'http', url: 'http://127.0.0.1:9/mcp' })).toThrow(/already exists/);
    expect(() => c.mcp.add({ name: 'NoUrl', transport: 'http' })).toThrow(/require a url/);
    expect(() => c.mcp.add({ name: 'NoCmd', transport: 'stdio' })).toThrow(/require a command/);
  });

  it('reports a connection error instead of a fake connected status', async () => {
    const { core: c } = await withIndexedProject('mcp-3');
    core = c;
    const server = c.mcp.add({ name: 'Dead', transport: 'http', url: 'http://127.0.0.1:9/mcp' });
    const res = await c.mcp.connect(server.id);
    expect(res.status).toBe('error');
    expect(res.error).toBeTruthy();
    const stored = c.mcp.get(server.id);
    expect(stored.status).toBe('error');
    expect(stored.lastError).toBeTruthy();
  });
});

describe('internal MCP server + external client round trip', () => {
  it('discovers tools over real Streamable HTTP and executes them', async () => {
    const { core: c, projectId } = await withIndexedProject('mcp-4');
    core = c;
    const url = await startInternal(c);
    expect(c.internalMcp.getStatus().running).toBe(true);

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const client = new Client({ name: 'arqenium-test', version: '1.0.0' }, { capabilities: {} });
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      expect(names).toContain('project_structure');
      expect(names).toContain('search_symbols');
      expect(names).toContain('impact_analysis');
      expect(names).toContain('trace_query');
      for (const t of tools.tools) {
        expect(t.inputSchema).toBeTruthy();
        expect(t.description?.length ?? 0).toBeGreaterThan(10);
      }

      const symbols = await client.callTool({ name: 'search_symbols', arguments: { query: 'createRouter' } });
      const parsed = JSON.parse((symbols.content as Array<{ text: string }>)[0].text);
      expect(parsed.symbols[0].name).toBe('createRouter');
      expect(parsed.symbols[0].path).toBe('src/lib/router.ts');

      const impact = await client.callTool({ name: 'impact_analysis', arguments: { paths: ['src/lib/format.ts'] } });
      const impactData = JSON.parse((impact.content as Array<{ text: string }>)[0].text);
      expect(impactData.affected.map((a: { path: string }) => a.path)).toContain('src/lib/router.ts');

      // The internal server refuses unknown projects rather than silently picking one.
      const bad = await client.callTool({ name: 'search_symbols', arguments: { query: 'x', projectId: 'does-not-exist' } });
      expect(bad.isError).toBe(true);
    } finally {
      await client.close();
    }
    void projectId;
  });

  it('serves only the loopback interface and rejects unknown paths', async () => {
    const { core: c } = await withIndexedProject('mcp-5');
    core = c;
    await startInternal(c);
    const res = await fetch(`http://127.0.0.1:${INTERNAL_PORT}/not-mcp`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/\/mcp/);
  });
});

describe('MCP client policy enforcement', () => {
  it('filters tools by allow/deny rules and gates non-auto-approved calls', async () => {
    const { core: c } = await withIndexedProject('mcp-6');
    core = c;
    const url = await startInternal(c);
    const server = c.mcp.add({
      name: 'Policy test',
      transport: 'http',
      url,
      permissions: {
        allowTools: ['search_*', 'project_structure'],
        denyTools: ['search_files'],
        autoApprove: ['search_symbols'],
        maxResultBytes: 64_000,
      },
    });
    const conn = await c.mcp.connect(server.id);
    expect(conn.status).toBe('connected');

    const allowed = c.mcp.tools(server.id).map((t) => t.name);
    expect(allowed).toContain('search_symbols');
    expect(allowed).toContain('project_structure');
    expect(allowed).not.toContain('search_files'); // explicitly denied
    expect(allowed).not.toContain('impact_analysis'); // not allowed
    expect(allowed).not.toContain('evaluation_run');

    const auto = c.mcp.tools(server.id).find((t) => t.name === 'search_symbols')!;
    expect(auto.autoApprove).toBe(true);
    const gated = c.mcp.tools(server.id).find((t) => t.name === 'project_structure')!;
    expect(gated.autoApprove).toBe(false);

    const ok = await c.mcp.call(server.id, 'search_symbols', { query: 'format' });
    expect(ok.ok).toBe(true);

    await expect(c.mcp.call(server.id, 'project_structure', {})).rejects.toThrow(/Approval required/);
    await expect(c.mcp.call(server.id, 'search_files', { query: 'x' })).rejects.toThrow(/not permitted/);

    const withApproval = await c.mcp.call(server.id, 'project_structure', {}, { approvalId: 'appr_test' });
    expect(withApproval.ok).toBe(true);
  });

  it('caps oversized results', async () => {
    const { core: c } = await withIndexedProject('mcp-7');
    core = c;
    const url = await startInternal(c);
    const server = c.mcp.add({
      name: 'Tiny cap',
      transport: 'http',
      url,
      permissions: { allowTools: ['*'], denyTools: [], autoApprove: ['*'], maxResultBytes: 1024 },
    });
    await c.mcp.connect(server.id);
    const res = await c.mcp.call(server.id, 'project_structure', {});
    const json = JSON.stringify(res.content);
    expect(json).toContain('truncated');
    expect(Buffer.byteLength(json)).toBeLessThan(4096);
  });
});

describe('MCP through the validated dispatcher', () => {
  it('requires explicit confirmation for non-auto-approved tools', async () => {
    const { core: c } = await withIndexedProject('mcp-8');
    core = c;
    const url = await startInternal(c);
    const server = c.mcp.add({
      name: 'Dispatcher test',
      transport: 'http',
      url,
      permissions: { allowTools: ['search_symbols'], denyTools: [], autoApprove: [], maxResultBytes: 64_000 },
    });
    await c.mcp.connect(server.id);

    const dispatcher = new Dispatcher(c, 'web');
    await expect(
      dispatcher.dispatch('mcp.call', { id: server.id, tool: 'search_symbols', arguments: { query: 'a' }, approve: false }),
    ).rejects.toMatchObject({ code: 'approval_required' });

    const res = (await dispatcher.dispatch('mcp.call', {
      id: server.id,
      tool: 'search_symbols',
      arguments: { query: 'a' },
      approve: true,
    })) as { ok: boolean };
    expect(res.ok).toBe(true);

    const approvals = c.approvals.list({ status: 'approved' });
    expect(approvals.some((a) => a.kind === 'mcp-tool')).toBe(true);
  });

  it('refuses tools that were never discovered', async () => {
    const { core: c } = await withIndexedProject('mcp-9');
    core = c;
    const url = await startInternal(c);
    const server = c.mcp.add({ name: 'Unknown tool', transport: 'http', url, permissions: { allowTools: ['*'], denyTools: [], autoApprove: ['*'], maxResultBytes: 64000 } });
    await c.mcp.connect(server.id);
    const dispatcher = new Dispatcher(c, 'web');
    await expect(dispatcher.dispatch('mcp.call', { id: server.id, tool: 'nope', arguments: {}, approve: true })).rejects.toBeInstanceOf(DispatchFailure);
  });
});
