/** ARQENIUM shared domain types. All persistence and IPC contracts build on these. */

export type ModuleId =
  | 'agent-control'
  | 'project-intelligence'
  | 'openbridge'
  | 'tracex'
  | 'evaluation'
  | 'providers'
  | 'shared-context'
  | 'echoshell'
  | 'rebuild-studio';

export const CORE_MODULES: ModuleId[] = [
  'agent-control',
  'project-intelligence',
  'openbridge',
  'tracex',
  'evaluation',
  'providers',
  'shared-context',
];

export const OPTIONAL_MODULES: ModuleId[] = ['echoshell', 'rebuild-studio'];

export type AgentRole =
  | 'planner'
  | 'architect'
  | 'implementer'
  | 'reviewer'
  | 'tester'
  | 'documentation'
  | 'custom';

export const AGENT_ROLES: AgentRole[] = [
  'planner',
  'architect',
  'implementer',
  'reviewer',
  'tester',
  'documentation',
  'custom',
];

export type ProjectStatus = 'ready' | 'indexing' | 'error';
export type IndexState = 'idle' | 'scanning' | 'indexing' | 'ready' | 'error';

export interface ProjectExclusions {
  ignorePatterns: string[];
  /** Extra patterns considered sensitive and never indexed unless listed here. */
  allowPatterns: string[];
  maxFileBytes: number;
}

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  status: ProjectStatus;
  createdAt: string;
  lastIndexedAt: string | null;
  indexState: IndexState;
  indexStats: IndexStats;
  exclusions: ProjectExclusions;
}

export interface IndexStats {
  filesDiscovered: number;
  filesIndexed: number;
  filesSkipped: number;
  filesFailed: number;
  symbols: number;
  edges: number;
  languages: Record<string, number>;
  durationMs?: number;
}

export type FileParseStatus = 'indexed' | 'skipped' | 'error';
export type ParseQuality = 'parsed' | 'approximate' | 'none';

export interface IndexedFile {
  id: string;
  projectId: string;
  path: string;
  language: string;
  bytes: number;
  mtimeMs: number;
  hash: string;
  status: FileParseStatus;
  parseQuality: ParseQuality;
  error: string | null;
  symbolCount: number;
}

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'method'
  | 'property'
  | 'module'
  | 'struct'
  | 'class-method'
  | 'class-attribute';

export interface SymbolRecord {
  id: string;
  projectId: string;
  path: string;
  name: string;
  kind: SymbolKind;
  line: number;
  endLine: number;
  signature: string;
  container: string | null;
  exported: boolean;
  quality: ParseQuality;
}

export interface FileEdge {
  id: string;
  projectId: string;
  fromPath: string;
  toPath: string | null;
  external: boolean;
  moduleSpec: string;
  kind: 'import' | 'require' | 'dynamic-import';
  resolved: boolean;
  line: number;
}

export interface DependencyGraph {
  nodes: Array<{
    id: string;
    path: string;
    language: string;
    symbolCount: number;
    isTest: boolean;
    changed: boolean;
    external?: boolean;
  }>;
  edges: Array<{ from: string; to: string; external?: boolean; resolved: boolean }>;
}

export type ImpactConfidence = 'parsed' | 'heuristic';

export interface ImpactResult {
  source: string[];
  affected: Array<{
    path: string;
    depth: number;
    reason: string;
    via: string[];
    confidence: ImpactConfidence;
    isTest: boolean;
  }>;
  tests: string[];
  truncated: boolean;
}

export interface GitChange {
  path: string;
  status: string;
  staged: boolean;
}

export interface AgentPermissions {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canRunCommands: boolean;
  /** Tool names that execute without a manual approval prompt (still audited). */
  autoApprove: string[];
}

export interface Agent {
  id: string;
  projectId: string | null;
  name: string;
  role: AgentRole;
  description: string;
  systemPrompt: string;
  /** providerId/model, e.g. "prov_demo/demo-1" or "prov_ollama/llama3.2". */
  modelRef: string | null;
  tools: string[];
  permissions: AgentPermissions;
  maxIterations: number;
  timeoutMs: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus =
  | 'pending'
  | 'blocked'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'skipped'
  | 'timeout';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
export type RunKind = 'orchestration' | 'evaluation' | 'manual';
export type RunMode = 'live' | 'demo';

export interface RunBudget {
  maxDurationMs: number;
  maxToolCalls: number;
  maxTokens: number;
  maxTasks: number;
}

export interface RunStats {
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  tasksCompleted: number;
  tasksFailed: number;
  providerRequests: number;
  estimatedCost: number | null;
}

export interface Run {
  id: string;
  projectId: string;
  kind: RunKind;
  mode: RunMode;
  trigger: 'user' | 'evaluation' | 'mcp' | 'system';
  status: RunStatus;
  labels: string[];
  budget: RunBudget;
  stats: RunStats;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Task {
  id: string;
  runId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  /** Ordered agent pipeline: each agent receives the previous agent's output. */
  pipeline: string[];
  dependsOn: string[];
  priority: number;
  input: string;
  output: string | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type Severity = 'debug' | 'info' | 'warn' | 'error';

export interface EventRecord {
  id: string;
  ts: string;
  type: string;
  severity: Severity;
  projectId: string | null;
  runId: string | null;
  taskId: string | null;
  agentId: string | null;
  correlationId: string | null;
  source: string;
  message: string;
  data: unknown;
  durationMs: number | null;
}

export type ApprovalKind =
  | 'file-write'
  | 'command-exec'
  | 'mcp-tool'
  | 'provider-action'
  | 'rebuild-export'
  | 'other';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'canceled';

export interface Approval {
  id: string;
  runId: string | null;
  taskId: string | null;
  projectId: string | null;
  kind: ApprovalKind;
  title: string;
  detail: string;
  payload: Record<string, unknown>;
  risk: 'low' | 'medium' | 'high';
  status: ApprovalStatus;
  source: 'agent' | 'mcp' | 'terminal' | 'rebuild' | 'user';
  createdAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  decidedBy: string | null;
}

export interface ToolCallRecord {
  id: string;
  runId: string | null;
  taskId: string | null;
  server: string;
  tool: string;
  source: 'agent' | 'mcp' | 'user' | 'internal';
  input: unknown;
  output: unknown;
  status: 'started' | 'ok' | 'error' | 'denied';
  error: string | null;
  approvalId: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export type McpTransport = 'stdio' | 'http';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  /** stdio */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http */
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  status: 'disabled' | 'connecting' | 'connected' | 'error';
  lastError: string | null;
  lastConnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: McpPermissions;
}

export interface McpPermissions {
  /** Tool name patterns allowed to be discovered/called ("*" = all). */
  allowTools: string[];
  denyTools: string[];
  /** Tools that may run without a manual approval. */
  autoApprove: string[];
  maxResultBytes: number;
}

export interface McpCapability {
  serverId: string;
  kind: 'tool' | 'resource' | 'prompt';
  name: string;
  description: string;
  schema: unknown;
  discoveredAt: string;
}

export type ProviderKind =
  | 'openai'
  | 'openai-compatible'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'demo';

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string | null;
  defaultModel: string | null;
  enabled: boolean;
  /** Credential reference inside the encrypted store (never the secret itself). */
  credentialRef: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  modelDiscovery: boolean;
  usageReporting: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number | null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  name?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: Array<{ name: string; description: string; parameters: unknown }>;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatUsage {
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface ChatResponse {
  message: ChatMessage;
  model: string;
  usage: ChatUsage | null;
  finishReason: 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'unknown';
  raw?: unknown;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
  latencyMs: number | null;
}

export interface EvalCase {
  id: string;
  suiteId: string;
  name: string;
  description: string;
  kind: 'deterministic' | 'ai';
  config: Record<string, unknown>;
  criteria: string;
  orderIndex: number;
}

export interface EvalSuite {
  id: string;
  name: string;
  description: string;
  kind: 'deterministic' | 'ai' | 'mixed';
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
  cases: EvalCase[];
}

export type EvalCaseStatus = 'pass' | 'fail' | 'error' | 'skipped';

export interface EvalResult {
  id: string;
  evalRunId: string;
  caseId: string;
  caseName: string;
  agentId: string | null;
  status: EvalCaseStatus;
  score: number | null;
  metrics: Record<string, number>;
  /** Objective, machine-checked outcome. */
  objective: string;
  /** Model-graded or human judgment, clearly separated from objective results. */
  subjective: string | null;
  durationMs: number;
  error: string | null;
  runId: string | null;
}

export interface EvalRun {
  id: string;
  suiteId: string;
  suiteName: string;
  projectId: string | null;
  status: RunStatus;
  mode: RunMode;
  startedAt: string;
  finishedAt: string | null;
  stats: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    skipped: number;
    durationMs: number;
  };
}

export interface ContextEntry {
  id: string;
  projectId: string;
  key: string;
  kind: 'decision' | 'convention' | 'note' | 'outcome';
  content: string;
  tags: string[];
  source: string;
  includeInPrompt: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalCommandResult {
  id: string;
  sessionId: string;
  argv: string[];
  cwd: string;
  status: 'ok' | 'error' | 'timeout' | 'canceled' | 'blocked';
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  approvalId: string | null;
  risk: 'low' | 'medium' | 'high';
  riskReasons: string[];
}

export interface TerminalSession {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
}

export interface RebuildCapture {
  id: string;
  projectId: string | null;
  kind: 'screenshot' | 'url';
  source: string;
  path: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface RebuildAnalysis {
  id: string;
  captureId: string;
  projectId: string | null;
  /** Facts measured directly from pixels or fetched markup. */
  extracted: Record<string, unknown>;
  /** Estimated details that are not directly measured. */
  inferred: Record<string, unknown>;
  warnings: string[];
  createdAt: string;
}

export interface ModuleState {
  id: ModuleId;
  enabled: boolean;
  /** Core modules ship enabled and cannot be disabled. */
  core: boolean;
  config: Record<string, unknown>;
  updatedAt: string | null;
}

export interface AppInfo {
  name: string;
  version: string;
  runtime: 'electron' | 'web';
  dataDir: string;
  node: string;
  platform: string;
  telemetryEnabled: false;
}

export interface ApprovalDecisionInput {
  approved: boolean;
  reason?: string;
  decidedBy?: string;
}
