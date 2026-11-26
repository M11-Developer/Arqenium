import type { AgentRole, ModuleId } from './types';

export interface ModuleMeta {
  id: ModuleId;
  name: string;
  summary: string;
  details: string;
  permissions: string[];
  resourceUsage: string;
  core: boolean;
}

export const MODULE_CATALOG: ModuleMeta[] = [
  {
    id: 'agent-control',
    name: 'Agent Control Plane',
    summary: 'Multi-agent orchestration: agents, task graphs, budgets, approvals.',
    details:
      'Coordinates agents through typed task pipelines with dependency scheduling, retries, timeouts, cancellation and human approval gates for sensitive operations.',
    permissions: ['Runs local agent tasks against configured providers'],
    resourceUsage: 'Moderate: in-process scheduling and provider calls',
    core: true,
  },
  {
    id: 'project-intelligence',
    name: 'Project Intelligence',
    summary: 'Repository scanning, symbol indexing, dependency graphs, impact analysis.',
    details:
      'Parses TypeScript/JavaScript with the TypeScript compiler API and Python with the standard ast module. Sensitive files and dependency directories are excluded by default.',
    permissions: ['Reads files inside user-selected project folders'],
    resourceUsage: 'Moderate during indexing, low at rest',
    core: true,
  },
  {
    id: 'openbridge',
    name: 'OpenBridge',
    summary: 'MCP client for external servers plus an internal MCP server for ARQENIUM.',
    details:
      'Discovers tools, resources and prompts from configured MCP servers, validates calls against their schemas, and exposes approved ARQENIUM capabilities to external AI clients.',
    permissions: ['Spawns configured MCP server processes', 'Outbound HTTP to configured MCP endpoints'],
    resourceUsage: 'One process or connection per enabled server',
    core: true,
  },
  {
    id: 'tracex',
    name: 'TraceX',
    summary: 'Structured event log, run timelines and execution diagnostics.',
    details:
      'Records every meaningful application event with correlation ids, durations and redacted payloads so runs can be inspected end to end.',
    permissions: ['Writes to the local event store'],
    resourceUsage: 'Low; events are pruned by retention settings',
    core: true,
  },
  {
    id: 'evaluation',
    name: 'Evaluation Lab',
    summary: 'Deterministic and AI-assisted agent test suites with reproducible results.',
    details:
      'Runs built-in deterministic suites without any AI provider, and optional AI suites against configured agents. Objective results are kept separate from model-graded judgments.',
    permissions: ['Runs evaluation cases locally', 'Optional provider calls for AI cases'],
    resourceUsage: 'Bursts during suite execution',
    core: true,
  },
  {
    id: 'providers',
    name: 'Provider Management',
    summary: 'Provider adapters for OpenAI, Anthropic, Gemini, Ollama and OpenAI-compatible endpoints.',
    details:
      'Normalizes authentication, model discovery, streaming, tool calling, usage reporting, errors and health checks. Credentials are stored encrypted locally.',
    permissions: ['Outbound HTTPS to configured provider endpoints'],
    resourceUsage: 'Negligible at rest',
    core: true,
  },
  {
    id: 'shared-context',
    name: 'Shared Project Context',
    summary: 'Project-scoped memory for decisions, conventions and outcomes.',
    details:
      'Lets users store engineering context that agents can read during runs. Entries are fully inspectable, editable and deletable.',
    permissions: ['Reads and writes local context entries'],
    resourceUsage: 'Low',
    core: true,
  },
  {
    id: 'echoshell',
    name: 'EchoShell',
    summary: 'Contextual terminal with preview, approval and scoped execution.',
    details:
      'Disabled by default. Executes argument-safe commands inside the project directory with timeouts, environment filtering and explicit confirmation for destructive operations.',
    permissions: ['Spawns local processes inside project boundaries', 'Reads command history'],
    resourceUsage: 'Only while sessions are active',
    core: false,
  },
  {
    id: 'rebuild-studio',
    name: 'Rebuild Studio',
    summary: 'Visual website reconstruction from screenshots or authorized URLs.',
    details:
      'Disabled by default. Extracts design tokens from images and structure from markup you provide, generates a new implementation, and previews it against the reference.',
    permissions: ['Reads uploaded screenshots', 'Fetches user-provided URLs on request'],
    resourceUsage: 'Bursts during analysis and generation',
    core: false,
  },
];

export interface RoleTemplate {
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    role: 'planner',
    name: 'Planner',
    description: 'Breaks work into concrete tasks and defines acceptance criteria.',
    systemPrompt:
      'You are the Planner agent. Decompose the requested engineering work into clear, verifiable steps. State assumptions explicitly and identify risks. Do not modify files.',
    tools: ['project_structure', 'search_symbols', 'search_files', 'read_file', 'dependency_graph', 'impact_analysis'],
  },
  {
    role: 'architect',
    name: 'Architect',
    description: 'Designs solutions grounded in the actual project structure.',
    systemPrompt:
      'You are the Architect agent. Propose designs that fit the existing codebase. Reference real files and symbols when justifying decisions. Flag uncertainty instead of guessing.',
    tools: ['project_structure', 'search_symbols', 'read_file', 'dependency_graph', 'impact_analysis', 'project_summary'],
  },
  {
    role: 'implementer',
    name: 'Implementer',
    description: 'Produces concrete code changes and reports exactly what changed.',
    systemPrompt:
      'You are the Implementer agent. Produce precise code changes as file operations. Every claim must match content you actually read or wrote. Report changed paths and symbols.',
    tools: ['project_structure', 'search_symbols', 'read_file', 'write_file', 'project_summary'],
  },
  {
    role: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews outputs for correctness, risk and consistency with the project.',
    systemPrompt:
      'You are the Reviewer agent. Evaluate the provided work against the project context. List concrete findings with file references. Separate verified facts from opinions.',
    tools: ['project_structure', 'search_symbols', 'read_file', 'dependency_graph', 'impact_analysis'],
  },
  {
    role: 'tester',
    name: 'Tester',
    description: 'Designs and runs verification steps, reporting objective results.',
    systemPrompt:
      'You are the Tester agent. Define and execute verification steps. Report only observed results and clearly mark anything not executed.',
    tools: ['project_structure', 'search_symbols', 'read_file', 'run_command', 'project_summary'],
  },
  {
    role: 'documentation',
    name: 'Documentation Agent',
    description: 'Produces documentation grounded in source content.',
    systemPrompt:
      'You are the Documentation agent. Write documentation that reflects the real source. Quote actual symbols and paths; never invent APIs.',
    tools: ['project_structure', 'search_symbols', 'read_file', 'project_summary'],
  },
  {
    role: 'custom',
    name: 'Custom',
    description: 'Free-form role with a fully custom prompt and tool set.',
    systemPrompt: 'You are a specialized engineering agent. Follow the assigned task and report verified outcomes only.',
    tools: ['project_structure', 'search_symbols', 'read_file'],
  },
];
