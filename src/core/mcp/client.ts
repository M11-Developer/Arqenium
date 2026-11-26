import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { ModuleService } from '../modules';
import type { CredentialStore } from '../credentials';
import type { McpCapability, McpServerConfig } from '../../shared/types';
import type { CreateMcpServerInput, McpToolDescriptor } from './types';
import { newId, nowIso } from '../../shared/ids';
import { filterEnv } from '../redact';

interface Connection {
  client: Client;
  transport: Transport;
  capabilities: McpCapability[];
  connectedAt: string;
}

const CONNECT_TIMEOUT_MS = 20_000;
const CALL_TIMEOUT_MS = 120_000;

/**
 * OpenBridge MCP client. Every external server is untrusted: connections are
 * isolated per server, tool lists are filtered through per-server permissions,
 * arguments are validated against the server-declared schema, and results are
 * capped before they reach an agent or the UI.
 */
export class McpClientManager {
  private connections = new Map<string, Connection>();

  constructor(
    private db: Db,
    private events: EventBus,
    private modules: ModuleService,
    private credentials: CredentialStore,
  ) {}

  // -------------------------------------------------------------- CRUD

  list(): McpServerConfig[] {
    const rows = this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at').all() as any[];
    return rows.map(rowToServer);
  }

  get(id: string): McpServerConfig {
    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id);
    if (!row) throw new Error(`MCP server ${id} not found`);
    return rowToServer(row);
  }

  add(input: CreateMcpServerInput): McpServerConfig {
    this.modules.requireEnabled('openbridge');
    if (input.transport === 'stdio' && !input.command) throw new Error('stdio servers require a command');
    if (input.transport === 'http' && !input.url) throw new Error('http servers require a url');
    if (this.list().some((s) => s.name === input.name)) throw new Error(`A server named "${input.name}" already exists`);
    const id = newId('mcp');
    const now = nowIso();
    const permissions = {
      // Safer default: nothing is callable until an allow rule is added.
      allowTools: input.permissions?.allowTools ?? [],
      denyTools: input.permissions?.denyTools ?? [],
      autoApprove: input.permissions?.autoApprove ?? [],
      maxResultBytes: input.permissions?.maxResultBytes ?? 64_000,
    };
    const config = {
      command: input.command ?? null,
      args: input.args ?? [],
      env: input.env ?? {},
      url: input.url ?? null,
      headers: input.headers ?? {},
    };
    this.db
      .prepare(
        `INSERT INTO mcp_servers (id, name, transport, config, permissions, enabled, status, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'disabled', NULL, ?, ?)`,
      )
      .run(id, input.name, input.transport, JSON.stringify(config), JSON.stringify(permissions), input.enabled === false ? 0 : 1, now, now);
    this.events.emit({
      type: 'mcp.server.added',
      message: `MCP server registered: ${input.name} (${input.transport})`,
      data: { id, transport: input.transport },
      source: 'mcp',
    });
    return this.get(id);
  }

  update(id: string, patch: Partial<CreateMcpServerInput>): McpServerConfig {
    const cur = this.get(id);
    const permissions = { ...cur.permissions, ...(patch.permissions ?? {}) };
    const config = {
      command: patch.command !== undefined ? patch.command : (cur.command ?? null),
      args: patch.args ?? cur.args ?? [],
      env: patch.env ?? cur.env ?? {},
      url: patch.url !== undefined ? patch.url : (cur.url ?? null),
      headers: patch.headers ?? cur.headers ?? {},
    };
    this.db
      .prepare('UPDATE mcp_servers SET name = ?, config = ?, permissions = ?, enabled = ?, updated_at = ? WHERE id = ?')
      .run(patch.name ?? cur.name, JSON.stringify(config), JSON.stringify(permissions), (patch.enabled ?? cur.enabled) ? 1 : 0, nowIso(), id);
    if (patch.enabled === false) void this.disconnect(id).catch(() => undefined);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.disconnect(id).catch(() => undefined);
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM mcp_capabilities WHERE server_id = ?').run(id);
    this.events.emit({ type: 'mcp.server.removed', message: `MCP server removed`, data: { id }, source: 'mcp' });
  }

  // ------------------------------------------------------- connections

  isConnected(id: string): boolean {
    return this.connections.has(id);
  }

  async connect(id: string): Promise<{ status: McpServerConfig['status']; capabilities: McpCapability[]; error: string | null }> {
    this.modules.requireEnabled('openbridge');
    const cfg = this.get(id);
    if (!cfg.enabled) throw new Error('Server is disabled; enable it before connecting');
    if (this.connections.has(id)) {
      return { status: 'connected', capabilities: this.connections.get(id)!.capabilities, error: null };
    }

    this.setStatus(id, 'connecting', null);
    this.events.emit({
      type: 'mcp.connecting',
      message: `Connecting to MCP server ${cfg.name}`,
      data: { id, transport: cfg.transport },
      source: 'mcp',
    });

    try {
      const transport = this.buildTransport(cfg);
      const client = new Client(
        { name: 'arqenium-openbridge', version: '0.1.0' },
        { capabilities: { roots: {}, elicitation: {} }, jsonSchemaValidator: new AjvJsonSchemaValidator() },
      );

      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `Timed out connecting to ${cfg.name}`);

      const capabilities = await this.discover(id, client);
      this.connections.set(id, { client, transport, capabilities, connectedAt: nowIso() });
      this.setStatus(id, 'connected', null);
      this.events.emit({
        type: 'mcp.connected',
        message: `Connected to ${cfg.name} (${capabilities.filter((c) => c.kind === 'tool').length} tools)`,
        data: { id, capabilities: capabilities.length },
        source: 'mcp',
      });
      transport.onclose = () => {
        if (this.connections.get(id)?.transport === transport) {
          this.connections.delete(id);
          this.setStatus(id, 'error', 'Connection closed by server');
          this.events.emit({
            type: 'mcp.disconnected',
            severity: 'warn',
            message: `Connection to ${cfg.name} closed`,
            data: { id },
            source: 'mcp',
          });
        }
      };
      return { status: 'connected', capabilities, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.connections.delete(id);
      this.setStatus(id, 'error', message);
      this.events.emit({
        type: 'mcp.error',
        severity: 'error',
        message: `Failed to connect to ${cfg.name}: ${message}`,
        data: { id },
        source: 'mcp',
      });
      return { status: 'error', capabilities: [], error: message };
    }
  }

  async disconnect(id: string): Promise<void> {
    const conn = this.connections.get(id);
    if (!conn) {
      this.setStatus(id, this.get(id).enabled ? 'disabled' : 'disabled', null);
      return;
    }
    try {
      await conn.client.close();
    } catch {
      // best effort
    }
    this.connections.delete(id);
    this.setStatus(id, 'disabled', null);
    this.events.emit({ type: 'mcp.disconnected', message: `Disconnected from MCP server`, data: { id }, source: 'mcp' });
  }

  /** Reconnect every enabled server (used at startup when the module is on). */
  async connectEnabled(): Promise<void> {
    if (!this.modules.isEnabled('openbridge')) return;
    for (const s of this.list()) {
      if (s.enabled) await this.connect(s.id).catch(() => undefined);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const id of [...this.connections.keys()]) {
      await this.disconnect(id).catch(() => undefined);
    }
  }

  async status(id: string): Promise<{ server: McpServerConfig; connected: boolean; capabilities: number; connectedAt: string | null }> {
    const server = this.get(id);
    const conn = this.connections.get(id);
    return { server, connected: !!conn, capabilities: conn?.capabilities.length ?? 0, connectedAt: conn?.connectedAt ?? null };
  }

  capabilities(id: string): McpCapability[] {
    // Prefer live data, fall back to the persisted discovery cache.
    const conn = this.connections.get(id);
    if (conn) return conn.capabilities;
    const rows = this.db.prepare('SELECT * FROM mcp_capabilities WHERE server_id = ?').all(id) as any[];
    return rows.map(rowToCapability);
  }

  /** Tools available to an agent/UI, filtered by per-server allow/deny rules. */
  tools(id: string): McpToolDescriptor[] {
    const server = this.get(id);
    return this.capabilities(id)
      .filter((c) => c.kind === 'tool')
      .filter((c) => permits(server, c.name))
      .map((c) => ({
        serverId: id,
        serverName: server.name,
        name: c.name,
        description: c.description,
        schema: c.schema,
        autoApprove: server.permissions.autoApprove.includes(c.name) || server.permissions.autoApprove.includes('*'),
        connected: this.isConnected(id),
      }));
  }

  async call(
    id: string,
    toolName: string,
    args: unknown,
    opts: { approvalId?: string | null; runId?: string | null; taskId?: string | null } = {},
  ): Promise<{ ok: boolean; content: unknown; isError: boolean; error?: string; durationMs: number }> {
    this.modules.requireEnabled('openbridge');
    const server = this.get(id);
    if (!permits(server, toolName)) {
      throw new Error(`Tool "${toolName}" is not permitted by this server's policy`);
    }
    const conn = this.connections.get(id);
    if (!conn) throw new Error(`Server ${server.name} is not connected`);
    if (!server.permissions.autoApprove.includes(toolName) && !server.permissions.autoApprove.includes('*')) {
      if (!opts.approvalId) {
        throw new Error('Approval required: this tool is not auto-approved for the server');
      }
    }

    const started = Date.now();
    this.events.emit({
      type: 'mcp.tool.call',
      message: `MCP call ${server.name}:${toolName}`,
      data: { serverId: id, tool: toolName },
      runId: opts.runId ?? undefined,
      source: 'mcp',
    });
    try {
      const result: any = await withTimeout(
        conn.client.callTool({ name: toolName, arguments: (args ?? {}) as Record<string, unknown> }),
        CALL_TIMEOUT_MS,
        `MCP tool call timed out after ${CALL_TIMEOUT_MS}ms`,
      );
      const capped = capResult(result, server.permissions.maxResultBytes);
      this.events.emit({
        type: result.isError ? 'mcp.tool.error' : 'mcp.tool.result',
        severity: result.isError ? 'error' : 'info',
        message: `MCP result ${server.name}:${toolName} (${Date.now() - started}ms)`,
        data: { serverId: id, tool: toolName, isError: !!result.isError, durationMs: Date.now() - started },
        runId: opts.runId ?? undefined,
        source: 'mcp',
      });
      return { ok: !result.isError, content: capped, isError: !!result.isError, durationMs: Date.now() - started };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.events.emit({
        type: 'mcp.tool.error',
        severity: 'error',
        message: `MCP call failed ${server.name}:${toolName}: ${message}`,
        data: { serverId: id, tool: toolName },
        runId: opts.runId ?? undefined,
        source: 'mcp',
      });
      return { ok: false, content: null, isError: true, error: message, durationMs: Date.now() - started };
    }
  }

  async readResource(id: string, uri: string): Promise<unknown> {
    const conn = this.connections.get(id);
    if (!conn) throw new Error('Server is not connected');
    const res = await withTimeout(conn.client.readResource({ uri }), CALL_TIMEOUT_MS, 'Resource read timed out');
    return res;
  }

  async getPrompt(id: string, name: string, args: Record<string, string> = {}): Promise<unknown> {
    const conn = this.connections.get(id);
    if (!conn) throw new Error('Server is not connected');
    return withTimeout(conn.client.getPrompt({ name, arguments: args }), CALL_TIMEOUT_MS, 'Prompt fetch timed out');
  }

  // --------------------------------------------------------- internals

  private buildTransport(cfg: McpServerConfig): Transport {
    if (cfg.transport === 'stdio') {
      if (!cfg.command) throw new Error('Missing command for stdio server');
      return new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        // Environment is filtered so provider credentials never leak into a child process.
        env: { ...filterEnv(process.env), ...(cfg.env ?? {}) } as Record<string, string>,
        stderr: 'pipe',
      });
    }
    if (!cfg.url) throw new Error('Missing url for http server');
    const headers: Record<string, string> = { ...(cfg.headers ?? {}) };
    for (const [k, v] of Object.entries(headers)) {
      if (v.startsWith('cred:')) {
        const ref = v.slice('cred:'.length);
        const secret = this.credentials.get('mcp', ref);
        if (!secret) throw new Error(`Missing credential "${ref}" for header ${k}`);
        headers[k] = secret;
      }
    }
    return new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: { headers },
    });
  }

  private async discover(id: string, client: Client): Promise<McpCapability[]> {
    const found: McpCapability[] = [];
    const now = nowIso();

    try {
      const tools: any = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, 'listTools timed out');
      for (const t of tools?.tools ?? []) {
        found.push({
          serverId: id,
          kind: 'tool',
          name: String(t.name ?? ''),
          description: String(t.description ?? ''),
          schema: t.inputSchema ?? { type: 'object', properties: {} },
          discoveredAt: now,
        });
      }
    } catch (err) {
      this.events.emit({
        type: 'mcp.discovery',
        severity: 'warn',
        message: `Server does not expose tools: ${err instanceof Error ? err.message : String(err)}`,
        data: { serverId: id, kind: 'tool' },
        source: 'mcp',
      });
    }

    try {
      const res: any = await withTimeout(client.listResources(), CONNECT_TIMEOUT_MS, 'listResources timed out');
      for (const r of res?.resources ?? []) {
        found.push({
          serverId: id,
          kind: 'resource',
          name: String(r.name ?? r.uri ?? ''),
          description: String(r.description ?? r.uri ?? ''),
          schema: { uri: r.uri, mimeType: r.mimeType ?? null },
          discoveredAt: now,
        });
      }
    } catch {
      // Resources are optional in the MCP spec.
    }

    try {
      const res: any = await withTimeout(client.listPrompts(), CONNECT_TIMEOUT_MS, 'listPrompts timed out');
      for (const p of res?.prompts ?? []) {
        found.push({
          serverId: id,
          kind: 'prompt',
          name: String(p.name ?? ''),
          description: String(p.description ?? ''),
          schema: { arguments: p.arguments ?? [] },
          discoveredAt: now,
        });
      }
    } catch {
      // Prompts are optional in the MCP spec.
    }

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM mcp_capabilities WHERE server_id = ?').run(id);
      const stmt = this.db.prepare(
        'INSERT INTO mcp_capabilities (server_id, kind, name, description, schema, discovered_at) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const c of found) stmt.run(c.serverId, c.kind, c.name, c.description, JSON.stringify(c.schema), c.discoveredAt);
    });
    tx();
    return found;
  }

  private setStatus(id: string, status: McpServerConfig['status'], error: string | null): void {
    this.db
      .prepare('UPDATE mcp_servers SET status = ?, last_error = ?, last_connected_at = CASE WHEN ? = \'connected\' THEN ? ELSE last_connected_at END, updated_at = ? WHERE id = ?')
      .run(status, error, status, nowIso(), nowIso(), id);
  }
}

function permits(server: McpServerConfig, tool: string): boolean {
  const { allowTools, denyTools } = server.permissions;
  if (denyTools.includes(tool) || denyTools.includes('*')) return false;
  if (allowTools.includes('*')) return true;
  return allowTools.some((p) => (p.endsWith('*') ? tool.startsWith(p.slice(0, -1)) : p === tool));
}

function capResult(result: unknown, maxBytes: number): unknown {
  const json = JSON.stringify(result ?? null);
  if (Buffer.byteLength(json) <= maxBytes) return result;
  return { truncated: true, maxBytes, preview: json.slice(0, maxBytes) };
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function rowToServer(r: any): McpServerConfig {
  const parse = <T>(v: string | null, fb: T): T => {
    if (!v) return fb;
    try {
      return JSON.parse(v) as T;
    } catch {
      return fb;
    }
  };
  const config = parse<Record<string, any>>(r.config, {});
  return {
    id: r.id,
    name: r.name,
    transport: r.transport,
    command: config.command ?? undefined,
    args: Array.isArray(config.args) ? config.args : [],
    env: config.env && typeof config.env === 'object' ? config.env : {},
    url: config.url ?? undefined,
    headers: config.headers && typeof config.headers === 'object' ? config.headers : {},
    enabled: !!r.enabled,
    status: r.status,
    lastError: r.last_error,
    lastConnectedAt: r.last_connected_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    permissions: parse(r.permissions, { allowTools: [], denyTools: [], autoApprove: [], maxResultBytes: 64_000 }),
  };
}

function rowToCapability(r: any): McpCapability {
  let schema: unknown = {};
  try {
    schema = JSON.parse(r.schema ?? '{}');
  } catch {
    schema = {};
  }
  return {
    serverId: r.server_id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    schema,
    discoveredAt: r.discovered_at,
  };
}
