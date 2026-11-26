import { z } from 'zod';
import type { Agent, ModuleId } from '../../shared/types';
import type { ApprovalService } from '../approvals';
import type { EventBus } from '../events/bus';
import type { TraceService } from '../traces/service';
import type { ModuleService } from '../modules';
import type { ProjectService } from '../projects/service';

export interface ToolContext {
  projectId: string;
  agent: Agent;
  runId: string | null;
  taskId: string | null;
  approvals: ApprovalService;
  events: EventBus;
  traces: TraceService;
  modules: ModuleService;
  projects: ProjectService;
  /** How long to wait for a human decision before giving up. */
  approvalTimeoutMs: number;
  /** Test hook: resolve approvals immediately instead of waiting for a user. */
  approvalResolver?: (approvalId: string) => Promise<boolean>;
}

export interface ToolResult {
  content: string;
  status: 'ok' | 'denied' | 'error';
  approvalId?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  sensitive: boolean;
  risk: 'low' | 'medium' | 'high';
  requiresModule?: ModuleId;
  permissionKey?: 'canReadFiles' | 'canWriteFiles' | 'canRunCommands';
  execute(args: any, ctx: ToolContext): Promise<string>;
}

const MAX_TOOL_OUTPUT = 24_000;

function cap(s: string, max = MAX_TOOL_OUTPUT): string {
  return s.length > max ? `${s.slice(0, max)}\n... [output truncated at ${max} chars]` : s;
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'project_structure',
    description: 'List the project file tree (directories and files) as JSON. Optionally start at a subdirectory.',
    parameters: z.object({ path: z.string().optional(), maxEntries: z.number().int().min(1).max(2000).optional() }),
    sensitive: false,
    risk: 'low',
    permissionKey: 'canReadFiles',
    async execute(args, ctx) {
      const tree = ctx.projects.tree(ctx.projectId, args.path ?? '');
      let count = 0;
      const max = args.maxEntries ?? 500;
      const prune = (nodes: any[]): any[] => {
        const out: any[] = [];
        for (const n of nodes) {
          if (count >= max) break;
          count += 1;
          if (n.type === 'dir') out.push({ ...n, children: prune(n.children ?? []) });
          else out.push({ name: n.name, path: n.path, type: 'file', size: n.size });
        }
        return out;
      };
      return cap(JSON.stringify({ root: ctx.projects.get(ctx.projectId).rootPath, entries: count, tree: prune(tree) }, null, 2));
    },
  },
  {
    name: 'search_symbols',
    description: 'Search indexed symbols (functions, classes, interfaces, methods) by name.',
    parameters: z.object({ query: z.string().min(1).max(200), limit: z.number().int().min(1).max(100).optional() }),
    sensitive: false,
    risk: 'low',
    permissionKey: 'canReadFiles',
    async execute(args, ctx) {
      const { items, total } = ctx.projects.symbols(ctx.projectId, { query: args.query, limit: args.limit ?? 30 });
      return cap(
        JSON.stringify(
          {
            total,
            symbols: items.map((s) => ({ name: s.name, kind: s.kind, path: s.path, line: s.line, container: s.container })),
          },
          null,
          2,
        ),
      );
    },
  },
  {
    name: 'search_files',
    description: 'Search indexed file paths by substring.',
    parameters: z.object({ query: z.string().min(1).max(300), limit: z.number().int().min(1).max(100).optional() }),
    sensitive: false,
    risk: 'low',
    permissionKey: 'canReadFiles',
    async execute(args, ctx) {
      const res = ctx.projects.search(ctx.projectId, args.query, args.limit ?? 30);
      return cap(JSON.stringify(res, null, 2));
    },
  },
  {
    name: 'read_file',
    description: 'Read a text file from the project (project-relative path). Sensitive paths are blocked.',
    parameters: z.object({ path: z.string().min(1).max(1000) }),
    sensitive: false,
    risk: 'low',
    permissionKey: 'canReadFiles',
    async execute(args, ctx) {
      const file = ctx.projects.readFile(ctx.projectId, args.path);
      const body = file.truncated ? `${file.content}\n... [file truncated]` : file.content;
      return cap(`FILE ${args.path} (${file.language}, ${file.bytes} bytes):\n\n${body}`, 40_000);
    },
  },
  {
    name: 'project_summary',
    description: 'Deterministic summary of a file (symbols, imports, size) or of the whole project when omitted.',
    parameters: z.object({ path: z.string().optional() }),
    sensitive: false,
    risk: 'low',
    permissionKey: 'canReadFiles',
    async execute(args, ctx) {
      if (args.path) return cap(JSON.stringify(ctx.projects.summary(ctx.projectId, args.path), null, 2));
      const p = ctx.projects.get(ctx.projectId);
      const graph = ctx.projects.graph(ctx.projectId);
      return cap(
        JSON.stringify(
          {
            name: p.name,
            rootPath: p.rootPath,
            indexStats: p.indexStats,
            fileCount: graph.nodes.filter((n) => !n.external).length,
            externalDependencies: graph.nodes.filter((n) => n.external).map((n) => n.path),
          },
          null,
          2,
        ),
      );
    },
  },
  {
    name: 'dependency_graph',
    description: 'Dependency graph adjacency for a file, or summary counts for the project.',
    parameters: z.object({ path: z.string().optional() }),
    sensitive: false,
    risk: 'low',
    permissionKey: 'canReadFiles',
    async execute(args, ctx) {
      const graph = ctx.projects.graph(ctx.projectId);
      if (args.path) {
        const rel = args.path.replace(/\\/g, '/');
        const out = graph.edges.filter((e) => e.from === rel);
        const inn = graph.edges.filter((e) => e.to === rel);
        return cap(JSON.stringify({ path: rel, imports: out, importedBy: inn }, null, 2));
      }
      const internal = graph.nodes.filter((n) => !n.external);
      return cap(
        JSON.stringify(
          {
            files: internal.length,
            externals: graph.nodes.filter((n) => n.external).length,
            edges: graph.edges.filter((e) => !e.external).length,
            topConnected: internal
              .map((n) => ({ path: n.path, degree: graph.edges.filter((e) => e.from === n.path || e.to === n.path).length }))
              .sort((a, b) => b.degree - a.degree)
              .slice(0, 20),
          },
          null,
          2,
        ),
      );
    },
  },
  {
    name: 'impact_analysis',
    description: 'Files likely affected by changing the given paths (reverse dependency analysis plus test heuristics).',
    parameters: z.object({ paths: z.array(z.string()).min(1).max(50), depth: z.number().int().min(1).max(5).optional() }),
    sensitive: false,
    risk: 'low',
    permissionKey: 'canReadFiles',
    async execute(args, ctx) {
      const res = ctx.projects.impact(ctx.projectId, args.paths, args.depth ?? 3);
      return cap(JSON.stringify(res, null, 2));
    },
  },
  {
    name: 'write_file',
    description: 'Write a text file inside the project. Requires explicit user approval before execution.',
    parameters: z.object({ path: z.string().min(1).max(1000), content: z.string().max(200_000) }),
    sensitive: true,
    risk: 'high',
    permissionKey: 'canWriteFiles',
    async execute(args, ctx) {
      const abs = ctx.projects.resolveWithin(ctx.projectId, args.path);
      const fs = await import('node:fs/promises');
      const pathMod = await import('node:path');
      await fs.mkdir(pathMod.dirname(abs), { recursive: true });
      await fs.writeFile(abs, args.content, 'utf8');
      return `Wrote ${args.content.length} bytes to ${args.path}`;
    },
  },
  {
    name: 'run_command',
    description:
      'Execute a command inside the project using EchoShell (module must be enabled). Always requires explicit user approval; destructive commands are flagged.',
    parameters: z.object({
      command: z.array(z.string().min(1).max(2000)).min(1).max(64),
      cwd: z.string().max(1000).optional(),
    }),
    sensitive: true,
    risk: 'high',
    requiresModule: 'echoshell',
    permissionKey: 'canRunCommands',
    async execute(args, ctx) {
      // Late import avoids a circular dependency between orchestration and terminal.
      const { assessCommand, runApprovedCommand } = await import('../terminal/service');
      const assessment = assessCommand(args.command, args.cwd ?? '');
      if (assessment.blocked) {
        throw new ToolExecutionError(`Command blocked by safety policy: ${assessment.reasons.join('; ')}`);
      }
      const result = await runApprovedCommand(ctx, args.command, args.cwd ?? '', assessment);
      return cap(
        JSON.stringify(
          {
            status: result.status,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            stdout: result.stdout.slice(0, 8000),
            stderr: result.stderr.slice(0, 4000),
          },
          null,
          2,
        ),
      );
    },
  },
];

export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

/**
 * Tool router: applies agent permissions, module capability checks, approval
 * gates and audit recording before any tool executes.
 */
export class ToolRouter {
  constructor(
    private approvals: ApprovalService,
    private traces: TraceService,
    private modules: ModuleService,
    private projects: ProjectService,
  ) {}

  private defs = new Map(AGENT_TOOLS.map((t) => [t.name, t]));

  /** Tools this agent may see (permissions + enabled modules). */
  visibleTools(agent: Agent): AgentTool[] {
    return AGENT_TOOLS.filter((t) => {
      if (!agent.tools.includes(t.name)) return false;
      if (t.requiresModule && !this.modules.isEnabled(t.requiresModule)) return false;
      if (t.permissionKey && !agent.permissions[t.permissionKey]) return false;
      return true;
    });
  }

  schemasFor(agent: Agent): Array<{ name: string; description: string; parameters: unknown }> {
    return this.visibleTools(agent).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.parameters),
    }));
  }

  async call(agent: Agent, name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.defs.get(name);
    if (!tool) return { content: `Unknown tool: ${name}`, status: 'error' };
    if (!agent.tools.includes(name)) {
      this.recordDenied(ctx, name, rawArgs, 'not granted to this agent');
      return { content: `Tool "${name}" is not granted to agent ${agent.name}`, status: 'denied' };
    }
    if (tool.requiresModule && !this.modules.isEnabled(tool.requiresModule)) {
      this.recordDenied(ctx, name, rawArgs, `module ${tool.requiresModule} disabled`);
      return { content: `Tool unavailable: module "${tool.requiresModule}" is disabled`, status: 'denied' };
    }
    if (tool.permissionKey && !agent.permissions[tool.permissionKey]) {
      this.recordDenied(ctx, name, rawArgs, 'permission disabled for agent');
      return { content: `Tool "${name}" denied: agent lacks the required permission`, status: 'denied' };
    }

    const parsed = tool.parameters.safeParse(rawArgs);
    if (!parsed.success) {
      return { content: `Invalid arguments for ${name}: ${parsed.error.message.slice(0, 500)}`, status: 'error' };
    }

    const started = Date.now();
    let approvalId: string | undefined;

    if (tool.sensitive && !agent.permissions.autoApprove.includes(name)) {
      const approval = await this.approvals.request(
        {
          runId: ctx.runId,
          taskId: ctx.taskId,
          projectId: ctx.projectId,
          kind: name === 'run_command' ? 'command-exec' : 'file-write',
          title: `Agent ${agent.name} requests ${name}`,
          detail: JSON.stringify(parsed.data, null, 2).slice(0, 4000),
          payload: { tool: name, args: parsed.data, agentId: agent.id },
          risk: tool.risk,
          source: 'agent',
        },
        ctx.approvalTimeoutMs,
      );
      approvalId = approval.id;
      if (approval.status !== 'approved') {
        this.traces.recordToolCallStart({
          runId: ctx.runId,
          taskId: ctx.taskId,
          server: 'internal',
          tool: name,
          source: 'agent',
          input: parsed.data,
          approvalId: approval.id,
        });
        this.recordDenied(ctx, name, parsed.data, `approval ${approval.status}`, approval.id);
        return {
          content: `Tool "${name}" was ${approval.status} by the user. Do not retry; report this in your output.`,
          status: 'denied',
          approvalId: approval.id,
        };
      }
    }

    const callId = this.traces.recordToolCallStart({
      runId: ctx.runId,
      taskId: ctx.taskId,
      server: 'internal',
      tool: name,
      source: 'agent',
      input: sanitizeForLog(parsed.data),
      approvalId: approvalId ?? null,
    });
    try {
      const content = await tool.execute(parsed.data, ctx);
      this.traces.recordToolCallEnd(callId, 'ok', { length: content.length }, null, Date.now() - started);
      return { content, status: 'ok', approvalId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.traces.recordToolCallEnd(callId, 'error', null, message, Date.now() - started);
      return { content: `Tool "${name}" failed: ${message}`, status: 'error', approvalId };
    }
  }

  private recordDenied(ctx: ToolContext, name: string, args: unknown, reason: string, approvalId?: string): void {
    const callId = this.traces.recordToolCallStart({
      runId: ctx.runId,
      taskId: ctx.taskId,
      server: 'internal',
      tool: name,
      source: 'agent',
      input: sanitizeForLog(args),
      approvalId: approvalId ?? null,
    });
    this.traces.recordToolCallEnd(callId, 'denied', null, reason, null);
  }
}

function sanitizeForLog(v: unknown): unknown {
  if (v && typeof v === 'object' && 'content' in (v as any)) {
    const clone = { ...(v as any) };
    if (typeof clone.content === 'string' && clone.content.length > 2000) {
      clone.content = `${clone.content.slice(0, 2000)}... [truncated]`;
    }
    return clone;
  }
  return v;
}

/** Convert a zod schema to JSON Schema for provider tool definitions. */
export function zodToJsonSchema(schema: z.ZodTypeAny): unknown {
  // Lightweight structural conversion covering the shapes used by our tools.
  const walk = (s: any): any => {
    const def = s._def ?? {};
    const typeName = def.typeName as string | undefined;
    if (typeName === 'ZodObject') {
      const shape = typeof s.shape === 'function' ? s.shape() : s.shape ?? {};
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        properties[k] = walk(v);
        if (!(v as any).isOptional?.()) required.push(k);
      }
      return { type: 'object', properties, required, additionalProperties: false };
    }
    if (typeName === 'ZodString') {
      const out: any = { type: 'string' };
      if (def.minLength) out.minLength = def.minLength.value;
      if (def.maxLength) out.maxLength = def.maxLength.value;
      return out;
    }
    if (typeName === 'ZodNumber') {
      const out: any = { type: 'number' };
      if (def.minValue != null) out.minimum = def.minValue;
      if (def.maxValue != null) out.maximum = def.maxValue;
      if (def.checks?.some((c: any) => c.kind === 'int')) out.type = 'integer';
      return out;
    }
    if (typeName === 'ZodBoolean') return { type: 'boolean' };
    if (typeName === 'ZodArray') {
      return { type: 'array', items: walk(def.type), maxItems: def.maxLength?.value };
    }
    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') return walk(def.innerType);
    if (typeName === 'ZodDefault') return walk(def.innerType);
    if (typeName === 'ZodEnum') return { type: 'string', enum: def.values };
    if (typeName === 'ZodUnion') return { anyOf: def.options.map(walk) };
    if (typeName === 'ZodLiteral') return { const: def.value };
    return {};
  };
  try {
    return walk(schema);
  } catch {
    return { type: 'object', properties: {} };
  }
}
