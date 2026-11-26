import { z } from 'zod';

/**
 * Strict request contracts for every renderer -> core message. The same schemas
 * validate Electron IPC payloads and HTTP API bodies. Responses are constructed
 * by trusted core code; requests are untrusted and always parsed before use.
 */

const projectId = z.string().min(1);
const id = z.string().min(1);
const path = z.string().min(1);
const runId = z.string().min(1);
const taskId = z.string().min(1);

export const requestSchemas = {
  // ---- app ----
  'app.info': z.object({}),
  'app.health': z.object({}),

  // ---- settings ----
  'settings.get': z.object({ key: z.string().min(1) }),
  'settings.set': z.object({ key: z.string().min(1), value: z.unknown() }),
  'settings.list': z.object({}),

  // ---- modules ----
  'modules.list': z.object({}),
  'modules.set': z.object({
    id: z.enum([
      'agent-control',
      'project-intelligence',
      'openbridge',
      'tracex',
      'evaluation',
      'providers',
      'shared-context',
      'echoshell',
      'rebuild-studio',
    ]),
    enabled: z.boolean(),
    config: z.record(z.unknown()).optional(),
  }),

  // ---- projects ----
  'projects.list': z.object({}),
  'projects.add': z.object({ path, name: z.string().min(1).optional() }),
  'projects.get': z.object({ projectId }),
  'projects.remove': z.object({ projectId }),
  'projects.update': z.object({
    projectId,
    name: z.string().min(1).optional(),
    exclusions: z
      .object({
        ignorePatterns: z.array(z.string()),
        allowPatterns: z.array(z.string()),
        maxFileBytes: z.number().int().positive(),
      })
      .optional(),
  }),
  'projects.reindex': z.object({ projectId }),
  'projects.tree': z.object({ projectId, path: path.optional() }),
  'projects.file': z.object({ projectId, path }),
  'projects.summary': z.object({ projectId, path }),
  'projects.symbols': z.object({
    projectId,
    query: z.string().optional(),
    kind: z.string().optional(),
    path: z.string().optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  'projects.search': z.object({ projectId, query: z.string().min(1), limit: z.number().int().min(1).max(500).optional() }),
  'projects.graph': z.object({ projectId }),
  'projects.impact': z.object({
    projectId,
    paths: z.array(z.string()).min(1),
    depth: z.number().int().min(1).max(6).optional(),
  }),
  'projects.changes': z.object({ projectId }),
  'projects.stats': z.object({ projectId }),

  // ---- shared project context ----
  'context.list': z.object({ projectId }),
  'context.upsert': z.object({
    projectId,
    id: id.optional(),
    key: z.string().min(1).max(200),
    kind: z.enum(['decision', 'convention', 'note', 'outcome']),
    content: z.string().min(1).max(20_000),
    tags: z.array(z.string()).max(20).default([]),
    includeInPrompt: z.boolean().default(true),
  }),
  'context.delete': z.object({ projectId, id }),

  // ---- agents ----
  'agents.list': z.object({ projectId: z.string().optional() }),
  'agents.get': z.object({ id }),
  'agents.create': z.object({
    projectId: z.string().nullable(),
    name: z.string().min(1).max(120),
    role: z.enum(['planner', 'architect', 'implementer', 'reviewer', 'tester', 'documentation', 'custom']),
    description: z.string().max(2000).default(''),
    systemPrompt: z.string().max(20_000).default(''),
    modelRef: z.string().nullable().default(null),
    tools: z.array(z.string()).default([]),
    permissions: z
      .object({
        canReadFiles: z.boolean(),
        canWriteFiles: z.boolean(),
        canRunCommands: z.boolean(),
        autoApprove: z.array(z.string()),
      })
      .optional(),
    maxIterations: z.number().int().min(1).max(50).optional(),
    timeoutMs: z.number().int().min(5_000).max(30 * 60_000).optional(),
    maxRetries: z.number().int().min(0).max(5).optional(),
  }),
  'agents.update': z.object({
    id,
    patch: z
      .object({
        name: z.string().min(1).max(120).optional(),
        role: z.enum(['planner', 'architect', 'implementer', 'reviewer', 'tester', 'documentation', 'custom']).optional(),
        description: z.string().max(2000).optional(),
        systemPrompt: z.string().max(20_000).optional(),
        modelRef: z.string().nullable().optional(),
        tools: z.array(z.string()).optional(),
        permissions: z
          .object({
            canReadFiles: z.boolean(),
            canWriteFiles: z.boolean(),
            canRunCommands: z.boolean(),
            autoApprove: z.array(z.string()),
          })
          .optional(),
        maxIterations: z.number().int().min(1).max(50).optional(),
        timeoutMs: z.number().int().min(5_000).max(30 * 60_000).optional(),
        maxRetries: z.number().int().min(0).max(5).optional(),
      })
      .strict(),
  }),
  'agents.delete': z.object({ id }),
  'agents.templates': z.object({}),

  // ---- runs / tasks ----
  'runs.list': z.object({
    projectId: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
    kind: z.enum(['orchestration', 'evaluation', 'manual']).optional(),
  }),
  'runs.get': z.object({ runId }),
  'runs.create': z.object({
    projectId,
    mode: z.enum(['live', 'demo']).default('live'),
    labels: z.array(z.string()).max(20).default([]),
    budget: z
      .object({
        maxDurationMs: z.number().int().min(1_000).max(60 * 60_000),
        maxToolCalls: z.number().int().min(0).max(1000),
        maxTokens: z.number().int().min(0).max(10_000_000),
        maxTasks: z.number().int().min(1).max(500),
      })
      .optional(),
    tasks: z
      .array(
        z.object({
          title: z.string().min(1).max(300),
          description: z.string().max(20_000).default(''),
          pipeline: z.array(id).min(1).max(6),
          dependsOn: z.array(z.number().int().min(0)).default([]),
          input: z.string().max(50_000).default(''),
          priority: z.number().int().min(0).max(100).default(50),
          maxAttempts: z.number().int().min(1).max(5).default(1),
        }),
      )
      .min(1)
      .max(100),
  }),
  'runs.cancel': z.object({ runId }),
  'runs.events': z.object({ runId, limit: z.number().int().min(1).max(2000).optional() }),
  'tasks.get': z.object({ taskId }),

  // ---- approvals ----
  'approvals.list': z.object({
    status: z.enum(['pending', 'approved', 'denied', 'expired']).optional(),
    runId: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  'approvals.decide': z.object({
    id,
    approved: z.boolean(),
    reason: z.string().max(2000).optional(),
    decidedBy: z.string().max(120).optional(),
  }),

  // ---- providers ----
  'providers.list': z.object({}),
  'providers.create': z.object({
    kind: z.enum(['openai', 'openai-compatible', 'anthropic', 'gemini', 'ollama', 'demo']),
    name: z.string().min(1).max(120),
    baseUrl: z.string().url().nullable().default(null),
    defaultModel: z.string().nullable().default(null),
    apiKey: z.string().max(4000).optional(),
    config: z.record(z.unknown()).default({}),
  }),
  'providers.update': z.object({
    id,
    patch: z
      .object({
        name: z.string().min(1).max(120).optional(),
        baseUrl: z.string().url().nullable().optional(),
        defaultModel: z.string().nullable().optional(),
        enabled: z.boolean().optional(),
        config: z.record(z.unknown()).optional(),
      })
      .strict(),
    apiKey: z.string().max(4000).optional(),
  }),
  'providers.delete': z.object({ id }),
  'providers.test': z.object({ id }),
  'providers.models': z.object({ id }),
  'providers.chat': z.object({
    id,
    messages: z
      .array(
        z.object({
          role: z.enum(['system', 'user', 'assistant', 'tool']),
          content: z.string().max(100_000),
          toolCallId: z.string().optional(),
          name: z.string().optional(),
        }),
      )
      .min(1)
      .max(200),
    maxTokens: z.number().int().min(1).max(32_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
  }),

  // ---- credentials ----
  'credentials.list': z.object({ scope: z.string().optional() }),
  'credentials.set': z.object({ scope: z.string().min(1), ref: z.string().min(1), value: z.string().min(1) }),
  'credentials.delete': z.object({ scope: z.string().min(1), ref: z.string().min(1) }),
  'credentials.has': z.object({ scope: z.string().min(1), ref: z.string().min(1) }),

  // ---- mcp ----
  'mcp.list': z.object({}),
  'mcp.add': z.object({
    name: z.string().min(1).max(120),
    transport: z.enum(['stdio', 'http']),
    command: z.string().max(500).optional(),
    args: z.array(z.string().max(500)).max(64).optional(),
    env: z.record(z.string().max(4000)).optional(),
    url: z.string().url().optional(),
    headers: z.record(z.string().max(4000)).optional(),
    permissions: z
      .object({
        allowTools: z.array(z.string()),
        denyTools: z.array(z.string()),
        autoApprove: z.array(z.string()),
        maxResultBytes: z.number().int().min(1024).max(5_000_000),
      })
      .optional(),
    connect: z.boolean().default(false),
  }),
  'mcp.update': z.object({
    id,
    patch: z
      .object({
        name: z.string().min(1).max(120).optional(),
        enabled: z.boolean().optional(),
        command: z.string().max(500).nullable().optional(),
        args: z.array(z.string().max(500)).max(64).optional(),
        env: z.record(z.string().max(4000)).optional(),
        url: z.string().url().nullable().optional(),
        headers: z.record(z.string().max(4000)).optional(),
        permissions: z
          .object({
            allowTools: z.array(z.string()),
            denyTools: z.array(z.string()),
            autoApprove: z.array(z.string()),
            maxResultBytes: z.number().int().min(1024).max(5_000_000),
          })
          .optional(),
      })
      .strict(),
  }),
  'mcp.remove': z.object({ id }),
  'mcp.connect': z.object({ id }),
  'mcp.disconnect': z.object({ id }),
  'mcp.status': z.object({ id }),
  'mcp.capabilities': z.object({ id }),
  'mcp.call': z.object({
    id,
    tool: z.string().min(1).max(200),
    arguments: z.record(z.unknown()).default({}),
    /** Explicit user approval for write-capable tools from the UI. */
    approve: z.boolean().default(false),
  }),
  'mcp.directory': z.object({}),
  'mcp.internal.status': z.object({}),
  'mcp.internal.set': z.object({ enabled: z.boolean(), port: z.number().int().min(0).max(65_535).optional() }),

  // ---- evaluation ----
  'evals.suites': z.object({}),
  'evals.suiteCreate': z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(4000).default(''),
    kind: z.enum(['deterministic', 'ai', 'mixed']).default('deterministic'),
    cases: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          description: z.string().max(4000).default(''),
          kind: z.enum(['deterministic', 'ai']),
          config: z.record(z.unknown()).default({}),
          criteria: z.string().max(4000).default(''),
        }),
      )
      .min(1)
      .max(100),
  }),
  'evals.suiteDelete': z.object({ id }),
  'evals.run': z.object({
    suiteId: id,
    projectId: z.string().optional(),
    mode: z.enum(['live', 'demo']).default('demo'),
    agentIds: z.array(id).max(10).optional(),
  }),
  'evals.runs': z.object({ projectId: projectId.optional(), limit: z.number().int().min(1).max(200).optional() }),
  'evals.results': z.object({ evalRunId: id }),
  'evals.export': z.object({ evalRunId: id, format: z.enum(['json', 'csv']).default('json') }),
  'evals.rerun': z.object({ evalRunId: id }),

  // ---- terminal (EchoShell) ----
  'terminal.sessions': z.object({ projectId }),
  'terminal.sessionCreate': z.object({ projectId, name: z.string().max(120).optional(), cwd: z.string().optional() }),
  'terminal.sessionDelete': z.object({ id }),
  'terminal.preview': z.object({ projectId, sessionId: id.optional(), command: z.string().min(1).max(4000) }),
  'terminal.execute': z.object({ approvalId: id }),
  'terminal.history': z.object({ projectId, limit: z.number().int().min(1).max(500).optional() }),
  'terminal.explain': z.object({ command: z.string().min(1).max(4000) }),

  // ---- rebuild studio ----
  'rebuild.captures': z.object({ projectId: z.string().optional() }),
  'rebuild.captureScreenshot': z.object({
    projectId: z.string().nullable(),
    name: z.string().min(1).max(200),
    dataBase64: z.string().min(8).max(20_000_000),
    mime: z.enum(['image/png', 'image/jpeg']),
  }),
  'rebuild.captureUrl': z.object({ projectId: z.string().nullable(), url: z.string().url() }),
  'rebuild.captureDelete': z.object({ id }),
  'rebuild.analyze': z.object({ captureId: id }),
  'rebuild.generate': z.object({ analysisId: id }),
  'rebuild.preview': z.object({ analysisId: id }),
  'rebuild.exportPreview': z.object({ analysisId: id, projectId, targetDir: z.string().default('') }),
  'rebuild.exportCommit': z.object({ approvalId: id }),

  // ---- trace / observability ----
  'trace.events': z.object({
    projectId: z.string().optional(),
    runId: z.string().optional(),
    type: z.string().optional(),
    severity: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    search: z.string().max(500).optional(),
    since: z.string().optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).default(0),
  }),
  'trace.eventTypes': z.object({}),
  'trace.toolCalls': z.object({ runId: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }),
  'trace.summary': z.object({ runId: z.string().optional() }),

  // ---- artifacts ----
  'artifacts.list': z.object({ projectId: z.string().optional(), runId: z.string().optional() }),
} as const;

/**
 * Every request object is strict: payload fields that the contract does not
 * declare are rejected instead of being forwarded to services. Applied
 * recursively so nested objects (task definitions, provider config, ...) are
 * covered too. Uses zod's own `.strict()` semantics via `unknownKeys`.
 */
function strictify(schema: z.ZodTypeAny, seen = new Set<unknown>()): void {
  if (!schema || typeof schema !== 'object' || seen.has(schema)) return;
  seen.add(schema);
  const def = (schema as any)._def;
  if (!def) return;
  if (def.typeName === 'ZodObject') {
    def.unknownKeys = 'strict';
    for (const child of Object.values(def.shape() as Record<string, z.ZodTypeAny>)) strictify(child, seen);
    return;
  }
  for (const key of ['type', 'innerType', 'schema', 'left', 'right', 'valueType'] as const) {
    const child = def[key];
    if (child && typeof child === 'object' && typeof (child as any)._def === 'object') strictify(child as z.ZodTypeAny, seen);
  }
  if (Array.isArray(def.options)) for (const opt of def.options) strictify(opt, seen);
  if (Array.isArray(def.items)) for (const item of def.items) strictify(item, seen);
}

for (const schema of Object.values(requestSchemas)) strictify(schema);

export type Channel = keyof typeof requestSchemas;
export type ChannelInput<C extends Channel> = z.infer<(typeof requestSchemas)[C]>;

export const CHANNELS = Object.keys(requestSchemas) as Channel[];
