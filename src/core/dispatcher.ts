import { z } from 'zod';
import { requestSchemas, type Channel } from '../shared/channels';
import type { Core } from './core';
import { newId } from '../shared/ids';

export interface DispatchError {
  code: string;
  message: string;
  details?: unknown;
}

export class DispatchFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'DispatchFailure';
  }
}

export interface AppInfoPayload {
  name: string;
  version: string;
  runtime: 'electron' | 'web';
  dataDir: string;
  node: string;
  platform: string;
  telemetryEnabled: false;
}

export const VERSION = '0.1.0';

/**
 * The dispatcher is the only place untrusted input becomes a service call.
 * Every request is parsed with the shared zod contract first; unknown channels
 * and invalid payloads never reach application code.
 */
export class Dispatcher {
  constructor(
    private core: Core,
    private runtime: 'electron' | 'web',
  ) {}

  /** Every channel the API accepts, taken from the shared contract. */
  channels(): string[] {
    return Object.keys(requestSchemas).sort();
  }

  async dispatch(channel: string, rawInput: unknown): Promise<unknown> {
    const parsedInput = this.parse(channel, rawInput);
    try {
      return await this.route(channel as Channel, parsedInput as any);
    } catch (err) {
      if (err instanceof DispatchFailure) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new DispatchFailure('request_failed', message);
    }
  }

  private parse(channel: string, rawInput: unknown): unknown {
    if (!(channel in requestSchemas)) {
      throw new DispatchFailure('unknown_channel', `Unknown channel: ${channel}`);
    }
    const schema = requestSchemas[channel as Channel];
    const result = schema.safeParse(rawInput ?? {});
    if (!result.success) {
      throw new DispatchFailure('invalid_input', `Invalid input for ${channel}: ${formatZod(result.error)}`, result.error.issues);
    }
    return result.data;
  }

  private async route(channel: Channel, input: any): Promise<unknown> {
    const c = this.core;
    switch (channel) {
      // ------------------------------------------------------------- app
      case 'app.info':
        return this.bootInfo();
      case 'app.health':
        return this.health();

      // -------------------------------------------------------- settings
      case 'settings.get':
        return { key: input.key, value: c.settings.get(input.key, null) };
      case 'settings.set':
        c.settings.set(input.key, input.value);
        c.events.emit({ type: 'settings.updated', message: `Setting updated: ${input.key}`, data: { key: input.key }, source: 'settings' });
        return { key: input.key, ok: true };
      case 'settings.list':
        return c.settings.list();

      // --------------------------------------------------------- modules
      case 'modules.list':
        return c.modules.list();
      case 'modules.set': {
        const state = c.modules.set(input.id, input.enabled, input.config);
        // Reactive side effects for modules with background services.
        if (input.id === 'openbridge') {
          if (input.enabled) void c.mcp.connectEnabled();
          else void c.mcp.disconnectAll();
        }
        if (input.id === 'rebuild-studio' && !input.enabled) {
          // Nothing to tear down; captures stay on disk for re-enabling.
        }
        return state;
      }

      // -------------------------------------------------------- projects
      case 'projects.list':
        return c.projects.list();
      case 'projects.add':
        c.modules.requireEnabled('project-intelligence');
        return await c.projects.add(input.path, input.name);
      case 'projects.get':
        return c.projects.get(input.projectId);
      case 'projects.remove':
        c.projects.remove(input.projectId);
        return { ok: true };
      case 'projects.update':
        return c.projects.update(input.projectId, { name: input.name, exclusions: input.exclusions });
      case 'projects.reindex':
        c.modules.requireEnabled('project-intelligence');
        return await c.projects.reindex(input.projectId);
      case 'projects.tree':
        return c.projects.tree(input.projectId, input.path ?? '');
      case 'projects.file':
        return c.projects.readFile(input.projectId, input.path);
      case 'projects.summary':
        return c.projects.summary(input.projectId, input.path);
      case 'projects.symbols':
        return c.projects.symbols(input.projectId, {
          query: input.query,
          kind: input.kind,
          path: input.path,
          limit: input.limit,
          offset: input.offset,
        });
      case 'projects.search':
        return c.projects.search(input.projectId, input.query, input.limit);
      case 'projects.graph':
        return c.projects.graph(input.projectId);
      case 'projects.impact':
        return c.projects.impact(input.projectId, input.paths, input.depth);
      case 'projects.changes':
        return await c.projects.changes(input.projectId);
      case 'projects.stats':
        return c.projects.stats(input.projectId);

      // --------------------------------------------------------- context
      case 'context.list':
        c.modules.requireEnabled('shared-context');
        return c.context.list(input.projectId);
      case 'context.upsert':
        c.modules.requireEnabled('shared-context');
        return c.context.upsert({ ...input, source: 'user' });
      case 'context.delete':
        c.modules.requireEnabled('shared-context');
        return { deleted: c.context.delete(input.projectId, input.id) };

      // ---------------------------------------------------------- agents
      case 'agents.list':
        c.modules.requireEnabled('agent-control');
        return c.agents.list(input.projectId);
      case 'agents.get':
        return c.agents.get(input.id);
      case 'agents.create':
        c.modules.requireEnabled('agent-control');
        return c.agents.create(input);
      case 'agents.update':
        c.modules.requireEnabled('agent-control');
        return c.agents.update(input.id, input.patch);
      case 'agents.delete':
        c.agents.delete(input.id);
        return { ok: true };
      case 'agents.templates':
        return c.agents.templates();

      // ------------------------------------------------------------ runs
      case 'runs.list':
        return c.orchestrator.listRuns({ projectId: input.projectId, limit: input.limit, kind: input.kind });
      case 'runs.get': {
        const { run, tasks } = c.orchestrator.getRun(input.runId);
        return { run, tasks };
      }
      case 'runs.create': {
        const created = c.orchestrator.createRun({
          projectId: input.projectId,
          mode: input.mode,
          labels: input.labels,
          budget: input.budget,
          tasks: input.tasks,
          trigger: 'user',
          kind: 'orchestration',
        });
        // Fire and forget: the run streams progress through TraceX events.
        void c.orchestrator.start(created.run.id).catch((err) => {
          c.events.emit({
            type: 'run.error',
            severity: 'error',
            runId: created.run.id,
            message: `Run failed to start: ${err instanceof Error ? err.message : String(err)}`,
            source: 'orchestration',
          });
        });
        return created;
      }
      case 'runs.cancel':
        return c.orchestrator.cancel(input.runId);
      case 'runs.events':
        return c.traces.runEvents(input.runId, input.limit ?? 1000);
      case 'tasks.get':
        return c.orchestrator.getTask(input.taskId);

      // ------------------------------------------------------- approvals
      case 'approvals.list':
        return c.approvals.list({ status: input.status, runId: input.runId, limit: input.limit });
      case 'approvals.decide':
        return c.approvals.decide(input.id, {
          approved: input.approved,
          reason: input.reason,
          decidedBy: input.decidedBy ?? 'user',
        });

      // ------------------------------------------------------- providers
      case 'providers.list':
        return c.providers.list();
      case 'providers.create':
        c.modules.requireEnabled('providers');
        return c.providers.create(input);
      case 'providers.update':
        c.modules.requireEnabled('providers');
        return c.providers.update(input.id, input.patch, input.apiKey);
      case 'providers.delete':
        c.providers.delete(input.id);
        return { ok: true };
      case 'providers.test':
        return await c.providers.healthCheck(input.id);
      case 'providers.models':
        return await c.providers.listModels(input.id);
      case 'providers.chat': {
        c.modules.requireEnabled('providers');
        return await c.providers.chat(input.id, {
          messages: input.messages,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
        });
      }

      // ----------------------------------------------------- credentials
      case 'credentials.list':
        return c.credentials.list(input.scope);
      case 'credentials.set':
        c.credentials.set(input.scope, input.ref, input.value);
        return { ok: true };
      case 'credentials.delete':
        return { deleted: c.credentials.delete(input.scope, input.ref) };
      case 'credentials.has':
        return { has: c.credentials.has(input.scope, input.ref) };

      // ------------------------------------------------------------- mcp
      case 'mcp.list':
        return c.mcp.list();
      case 'mcp.add': {
        const created = c.mcp.add({
          name: input.name,
          transport: input.transport,
          command: input.command,
          args: input.args,
          env: input.env,
          url: input.url,
          headers: input.headers,
          permissions: input.permissions,
          enabled: true,
        });
        if (input.connect) await c.mcp.connect(created.id).catch(() => undefined);
        return c.mcp.get(created.id);
      }
      case 'mcp.update':
        return c.mcp.update(input.id, input.patch);
      case 'mcp.remove':
        await c.mcp.remove(input.id);
        return { ok: true };
      case 'mcp.connect':
        return await c.mcp.connect(input.id);
      case 'mcp.disconnect':
        await c.mcp.disconnect(input.id);
        return { ok: true };
      case 'mcp.status':
        return await c.mcp.status(input.id);
      case 'mcp.capabilities':
        return c.mcp.capabilities(input.id);
      case 'mcp.call': {
        const tools = c.mcp.tools(input.id);
        const tool = tools.find((t) => t.name === input.tool);
        if (!tool) throw new DispatchFailure('not_permitted', `Tool "${input.tool}" is not permitted or not discovered for this server`);
        let approvalId: string | null = null;
        if (!tool.autoApprove) {
          if (input.approve) {
            // The UI confirmed this specific call; record the decision before executing.
            const approval = c.approvals.create({
              kind: 'mcp-tool',
              title: `MCP call ${tool.serverName}:${tool.name}`,
              detail: JSON.stringify(input.arguments ?? {}, null, 2).slice(0, 4000),
              payload: { serverId: input.id, tool: input.tool },
              risk: 'medium',
              source: 'mcp',
              autoApprove: false,
            });
            c.approvals.decide(approval.id, { approved: true, reason: 'confirmed in integrations console', decidedBy: 'user' });
            approvalId = approval.id;
          } else {
            const approval = c.approvals.create({
              kind: 'mcp-tool',
              title: `MCP call pending approval: ${tool.serverName}:${tool.name}`,
              detail: JSON.stringify(input.arguments ?? {}, null, 2).slice(0, 4000),
              payload: { serverId: input.id, tool: input.tool },
              risk: 'medium',
              source: 'mcp',
            });
            throw new DispatchFailure('approval_required', 'This tool requires explicit approval before execution', {
              approvalId: approval.id,
            });
          }
        }
        const callId = c.traces.recordToolCallStart({
          server: input.id,
          tool: input.tool,
          source: 'mcp',
          input: input.arguments,
          approvalId,
        });
        const startedAt = Date.now();
        const result = await c.mcp.call(input.id, input.tool, input.arguments, { approvalId });
        c.traces.recordToolCallEnd(callId, result.ok ? 'ok' : 'error', result.content, result.error ?? null, Date.now() - startedAt);
        return result;
      }
      case 'mcp.directory':
        return (await import('./mcp/types')).MCP_DIRECTORY;
      case 'mcp.internal.status':
        return c.internalMcp.getStatus();
      case 'mcp.internal.set': {
        c.modules.requireEnabled('openbridge');
        const current = c.internalMcp.getStatus();
        if (input.enabled) {
          await c.internalMcp.stop().catch(() => undefined);
          return await c.internalMcp.start(input.port ?? current.port ?? 4321);
        }
        await c.internalMcp.stop();
        return c.internalMcp.getStatus();
      }

      // ----------------------------------------------------- evaluation
      case 'evals.suites':
        c.modules.requireEnabled('evaluation');
        return c.evals.listSuites();
      case 'evals.suiteCreate':
        return c.evals.createSuite(input);
      case 'evals.suiteDelete':
        c.evals.deleteSuite(input.id);
        return { ok: true };
      case 'evals.run': {
        const out = await c.evals.runSuite({
          suiteId: input.suiteId,
          projectId: input.projectId ?? null,
          mode: input.mode,
          agentIds: input.agentIds ?? null,
        });
        return out;
      }
      case 'evals.runs':
        c.modules.requireEnabled('evaluation');
        // `projectId` lets the UI scope the history list to the active project.
        return c.evals.listRuns(input.limit, (input as { projectId?: string }).projectId);
      case 'evals.results':
        return c.evals.results(input.evalRunId);
      case 'evals.export': {
        const content = c.evals.export(input.evalRunId, input.format);
        return { format: input.format, content, filename: `eval-${input.evalRunId}.${input.format}` };
      }
      case 'evals.rerun': {
        const run = c.evals.getEvalRun(input.evalRunId);
        return await c.evals.runSuite({ suiteId: run.suiteId, projectId: run.projectId, mode: run.mode });
      }

      // ------------------------------------------------------- terminal
      case 'terminal.sessions':
        return c.terminal.listSessions(input.projectId);
      case 'terminal.sessionCreate':
        return c.terminal.createSession(input);
      case 'terminal.sessionDelete':
        c.terminal.deleteSession(input.id);
        return { ok: true };
      case 'terminal.preview':
        return c.terminal.preview(input);
      case 'terminal.execute':
        return await c.terminal.execute(input.approvalId);
      case 'terminal.history':
        c.modules.requireEnabled('echoshell');
        return c.terminal.history(input.projectId, input.limit);
      case 'terminal.explain':
        return c.terminal.explain(input.command);

      // -------------------------------------------------------- rebuild
      case 'rebuild.captures':
        return c.rebuild.listCaptures(input.projectId);
      case 'rebuild.captureScreenshot': {
        const buffer = Buffer.from(input.dataBase64, 'base64');
        return c.rebuild.captureScreenshot({
          projectId: input.projectId,
          name: input.name,
          buffer,
          mime: input.mime,
        });
      }
      case 'rebuild.captureUrl':
        return await c.rebuild.captureUrl(input);
      case 'rebuild.captureDelete':
        c.rebuild.deleteCapture(input.id);
        return { ok: true };
      case 'rebuild.analyze':
        return c.rebuild.analyze(input.captureId);
      case 'rebuild.generate':
        return c.rebuild.preview(input.analysisId);
      case 'rebuild.preview':
        return c.rebuild.preview(input.analysisId);
      case 'rebuild.exportPreview':
        return c.rebuild.exportPreview(input);
      case 'rebuild.exportCommit':
        return c.rebuild.exportCommit(input.approvalId);

      // ----------------------------------------------------------- trace
      case 'trace.events':
        return c.traces.query(input);
      case 'trace.eventTypes':
        return c.traces.eventTypes();
      case 'trace.toolCalls':
        return c.traces.toolCalls({ runId: input.runId, limit: input.limit });
      case 'trace.summary':
        return c.traces.summary(input.runId);

      // ------------------------------------------------------- artifacts
      case 'artifacts.list': {
        const clauses: string[] = [];
        const params: unknown[] = [];
        if (input.projectId) {
          clauses.push('project_id = ?');
          params.push(input.projectId);
        }
        if (input.runId) {
          clauses.push('run_id = ?');
          params.push(input.runId);
        }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        return c.db.prepare(`SELECT * FROM artifacts ${where} ORDER BY created_at DESC LIMIT 200`).all(...params);
      }

      default: {
        const exhaustive: never = channel;
        throw new DispatchFailure('unimplemented', `Channel not implemented: ${String(exhaustive)}`);
      }
    }
  }

  /**
   * Everything the renderer needs on boot in one round trip: build info,
   * runtime capabilities, the channel list and the module gate state.
   */
  bootInfo(): AppInfoPayload & {
    channels: string[];
    capabilities: {
      runtime: 'electron' | 'web';
      supportsIpc: boolean;
      supportsNativeDialogs: boolean;
      supportsWindowControls: boolean;
      supportsAutoUpdate: boolean;
      supportsEventStream: boolean;
    };
    modules: Array<{ id: string; enabled: boolean; core: boolean }>;
  } {
    const info = this.appInfo();
    const isElectron = this.runtime === 'electron';
    return {
      ...info,
      channels: this.channels(),
      capabilities: {
        runtime: this.runtime,
        supportsIpc: isElectron,
        supportsNativeDialogs: isElectron,
        supportsWindowControls: isElectron,
        supportsAutoUpdate: false,
        supportsEventStream: true,
      },
      modules: this.core.modules.list().map((m) => ({ id: m.id, enabled: m.enabled, core: m.core })),
    };
  }

  appInfo(): AppInfoPayload {
    return {
      name: 'ARQENIUM',
      version: this.core.version,
      runtime: this.runtime,
      dataDir: this.core.dataDir,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      telemetryEnabled: false,
    };
  }

  health(): Record<string, unknown> {
    const c = this.core;
    return {
      ok: true,
      version: this.core.version,
      runtime: this.runtime,
      uptimeSec: Math.round(process.uptime()),
      modules: c.modules.list().map((m) => ({ id: m.id, enabled: m.enabled })),
      projects: c.projects.list().length,
      providers: c.providers.list().map((p) => ({ id: p.id, kind: p.kind, enabled: p.enabled, model: p.defaultModel })),
      mcpServers: c.mcp.list().length,
      traceEvents: (c.db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c,
      pendingApprovals: c.approvals.list({ status: 'pending' }).length,
      languages: c.languages.report(),
    };
  }
}

function formatZod(error: z.ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

export function correlationId(): string {
  return newId('corr');
}
