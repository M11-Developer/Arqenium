/** Re-export the shared domain types for renderer use. */
export type {
  Agent,
  AgentRole,
  AppInfo,
  Approval,
  ApprovalKind,
  ContextEntry,
  DependencyGraph,
  EvalCase,
  EvalResult,
  EvalRun,
  EvalSuite,
  EventRecord,
  FileEdge,
  GitChange,
  ImpactResult,
  IndexStats,
  IndexedFile,
  McpCapability,
  McpServerConfig,
  ModelInfo,
  ModuleId,
  ModuleState,
  Project,
  ProviderCapabilities,
  ProviderConfig,
  ProviderHealth,
  ProviderKind,
  RebuildAnalysis,
  RebuildCapture,
  Run,
  RunBudget,
  RunMode,
  RunStats,
  SymbolRecord,
  Task,
  TaskStatus,
  TerminalCommandResult,
  TerminalSession,
  ToolCallRecord,
} from '../../shared/types';

export interface EventRecordLike {
  id: string;
  ts: string;
  type: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  size?: number;
  children?: TreeNode[];
}

export interface GroundedSummary {
  path: string;
  language: string;
  bytes: number;
  lines: number;
  symbolCount: number;
  importCount: number;
  symbols: Array<{ name: string; kind: string; line: number }>;
  imports: Array<{ moduleSpec: string; resolved: string | null; line: number }>;
  externalImports: string[];
  dependents: string[];
  hasTests: boolean;
  todoCount: number;
  notes: string[];
  quality: 'parsed' | 'approximate' | 'none';
}
