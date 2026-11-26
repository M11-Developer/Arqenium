/**
 * Hosted (read-only) preview bridge.
 *
 * When the renderer is served from a host that cannot run the Node core — the
 * Vercel deployment — there is no `/api/invoke` endpoint. Instead of showing a
 * broken screen, `index.html` loads this file *before* the app bundle; it
 * installs a `window.arqenium` shim so the UI renders against an in-browser
 * demo dataset.
 *
 * What this is: an explicit, labelled demo of the interface.
 * What this is not: the real core. Parsing, indexing, approvals, TraceX and
 * MCP do not run here — install the desktop app for that.
 *
 * The real app always wins: this file no-ops if a bridge already exists, and it
 * verifies that a core is reachable before installing itself.
 */
(function () {
  'use strict';

  if (window.arqenium) return;

  var now = function () {
    return new Date().toISOString();
  };
  var id = function (prefix, n) {
    return prefix + '_demo' + String(n).padStart(4, '0');
  };

  // ---------------------------------------------------------------- dataset
  var PROJECT_ID = 'prj_preview';
  var project = {
    id: PROJECT_ID,
    name: 'sample-app',
    rootPath: 'C:\\Users\\you\\code\\sample-app',
    status: 'ready',
    createdAt: '2026-11-20T09:12:00.000Z',
    lastIndexedAt: now(),
    indexState: 'ready',
    indexStats: {
      filesDiscovered: 7,
      filesIndexed: 7,
      filesSkipped: 0,
      filesFailed: 0,
      symbols: 18,
      edges: 5,
      languages: { typescript: 4, python: 1, markdown: 1, json: 1 },
      durationMs: 73,
    },
    exclusions: { ignorePatterns: ['node_modules/', 'dist/'], allowPatterns: [], maxFileBytes: 1048576 },
  };

  var files = {
    'src/index.ts': [
      "import { createRouter } from './lib/router';",
      "import { formatBytes } from './lib/format';",
      '',
      'export interface AppConfig {',
      '  port: number;',
      '  routes: string[];',
      '}',
      '',
      'export function boot(config: AppConfig) {',
      '  const router = createRouter(config.routes);',
      '  return {',
      '    port: config.port,',
      '    match: (p: string) => router.match(p),',
      '    describe: () => `listening on ${config.port}`,',
      '    size: formatBytes(1024),',
      '  };',
      '}',
    ].join('\n'),
    'src/lib/router.ts': [
      "import { formatPath } from './format';",
      '',
      'export interface Route { path: string; handler: string }',
      '',
      'export interface Router {',
      '  match(path: string): Route | null;',
      '}',
      '',
      'export function createRouter(routes: string[]): Router {',
      '  const table = new Map(routes.map((r) => [formatPath(r), { path: r, handler: r }]));',
      '  return { match: (p) => table.get(formatPath(p)) ?? null };',
      '}',
    ].join('\n'),
    'src/lib/format.ts': [
      'export function formatPath(p: string): string {',
      "  return p.replace(/\\/+/g, '/').replace(/\\/$/, '') || '/';",
      '}',
      '',
      'export function formatBytes(n: number): string {',
      "  if (n < 1024) return `${n} B`;",
      "  return `${(n / 1024).toFixed(1)} KB`;",
      '}',
    ].join('\n'),
    'src/service.py': [
      'from dataclasses import dataclass',
      '',
      '@dataclass',
      'class Record:',
      '    key: str',
      '    value: int',
      '',
      'def parse_records(lines):',
      '    out = []',
      '    for line in lines:',
      "        key, _, raw = line.partition('=')",
      '        out.append(Record(key.strip(), int(raw or 0)))',
      '    return out',
    ].join('\n'),
  };

  function symbol(n, path, name, kind, line, exported) {
    return {
      id: id('sym', n),
      projectId: PROJECT_ID,
      path: path,
      name: name,
      kind: kind,
      line: line,
      endLine: line + 4,
      signature: 'export ' + kind + ' ' + name,
      container: null,
      exported: exported !== false,
      quality: 'parsed',
    };
  }

  var symbols = [
    symbol(1, 'src/index.ts', 'AppConfig', 'interface', 4),
    symbol(2, 'src/index.ts', 'boot', 'function', 9),
    symbol(3, 'src/lib/router.ts', 'Route', 'interface', 3),
    symbol(4, 'src/lib/router.ts', 'Router', 'interface', 5),
    symbol(5, 'src/lib/router.ts', 'createRouter', 'function', 9),
    symbol(6, 'src/lib/format.ts', 'formatPath', 'function', 1),
    symbol(7, 'src/lib/format.ts', 'formatBytes', 'function', 5),
    symbol(8, 'src/service.py', 'Record', 'class', 3),
    symbol(9, 'src/service.py', 'parse_records', 'function', 8),
  ];

  var graph = {
    nodes: [
      { path: 'src/index.ts', kind: 'file' },
      { path: 'src/lib/router.ts', kind: 'file' },
      { path: 'src/lib/format.ts', kind: 'file' },
      { path: 'tests/router.test.ts', kind: 'file' },
    ],
    edges: [
      { from: 'src/index.ts', to: 'src/lib/router.ts', kind: 'import' },
      { from: 'src/index.ts', to: 'src/lib/format.ts', kind: 'import' },
      { from: 'src/lib/router.ts', to: 'src/lib/format.ts', kind: 'import' },
      { from: 'tests/router.test.ts', to: 'src/lib/router.ts', kind: 'import' },
    ],
  };

  var modules = [
    'project-intelligence',
    'agent-control',
    'openbridge',
    'tracex',
    'evaluation',
    'providers',
    'shared-context',
  ].map(function (m) {
    return { id: m, enabled: true, core: true, config: {}, updatedAt: now() };
  });
  modules.push({ id: 'echoshell', enabled: true, core: false, config: {}, updatedAt: now() });
  modules.push({ id: 'rebuild-studio', enabled: true, core: false, config: {}, updatedAt: now() });

  var demoProvider = {
    id: 'prv_demo',
    kind: 'demo',
    name: 'Demo (built in)',
    baseUrl: null,
    defaultModel: 'demo-deterministic',
    enabled: true,
    createdAt: '2026-11-20T09:00:00.000Z',
    updatedAt: '2026-11-20T09:00:00.000Z',
    hasCredential: false,
  };

  var agents = [
    {
      id: 'agt_planner',
      projectId: PROJECT_ID,
      name: 'Planner',
      role: 'planner',
      description: 'Breaks work into concrete tasks and defines acceptance criteria.',
      systemPrompt: 'You are the Planner agent.',
      modelRef: null,
      tools: ['project_structure', 'search_symbols', 'read_file', 'impact_analysis'],
      permissions: { canReadFiles: true, canWriteFiles: false, canRunCommands: false, autoApprove: [] },
      maxIterations: 8,
      timeoutMs: 120000,
      maxRetries: 1,
      createdAt: '2026-11-20T09:20:00.000Z',
      updatedAt: '2026-11-20T09:20:00.000Z',
    },
    {
      id: 'agt_impl',
      projectId: PROJECT_ID,
      name: 'Implementer',
      role: 'implementer',
      description: 'Produces concrete code changes and reports exactly what changed.',
      systemPrompt: 'You are the Implementer agent.',
      modelRef: null,
      tools: ['project_structure', 'read_file', 'write_file'],
      permissions: { canReadFiles: true, canWriteFiles: true, canRunCommands: false, autoApprove: [] },
      maxIterations: 8,
      timeoutMs: 120000,
      maxRetries: 1,
      createdAt: '2026-11-20T09:21:00.000Z',
      updatedAt: '2026-11-20T09:21:00.000Z',
    },
    {
      id: 'agt_reviewer',
      projectId: PROJECT_ID,
      name: 'Reviewer',
      role: 'reviewer',
      description: 'Reviews outputs for correctness, risk and consistency.',
      systemPrompt: 'You are the Reviewer agent.',
      modelRef: null,
      tools: ['project_structure', 'search_symbols', 'read_file'],
      permissions: { canReadFiles: true, canWriteFiles: false, canRunCommands: false, autoApprove: [] },
      maxIterations: 8,
      timeoutMs: 120000,
      maxRetries: 1,
      createdAt: '2026-11-20T09:22:00.000Z',
      updatedAt: '2026-11-20T09:22:00.000Z',
    },
  ];

  var runs = [
    {
      id: 'run_preview01',
      projectId: PROJECT_ID,
      title: 'Release check',
      kind: 'orchestration',
      mode: 'demo',
      status: 'completed',
      budget: { maxDurationMs: 600000, maxToolCalls: 60, maxTokens: 400000, maxTasks: 100 },
      stats: {
        toolCalls: 2,
        tokensIn: 0,
        tokensOut: 0,
        tasksCompleted: 2,
        tasksFailed: 0,
        providerRequests: 4,
        estimatedCost: 0,
      },
      createdAt: '2026-11-25T12:03:58.000Z',
      startedAt: '2026-11-25T12:03:58.000Z',
      finishedAt: '2026-11-25T12:04:11.000Z',
      error: null,
    },
  ];

  var tasks = [
    { id: 'tsk_1', runId: 'run_preview01', title: 'Plan the change', status: 'completed', attempts: 1, output: 'Demo agent output (sample data — not generated by a real model).' },
    { id: 'tsk_2', runId: 'run_preview01', title: 'Implement the change', status: 'completed', attempts: 1, output: 'Demo agent output (sample data — not generated by a real model).' },
  ];

  var approvals = [
    {
      id: 'apr_preview01',
      projectId: PROJECT_ID,
      runId: 'run_preview01',
      taskId: 'tsk_2',
      kind: 'file-write',
      risk: 'medium',
      title: 'write_file src/lib/router.ts',
      detail: 'The Implementer agent wants to write src/lib/router.ts',
      payload: { path: 'src/lib/router.ts', bytes: 412 },
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      expiresAt: '2026-11-25T12:14:11.000Z',
      createdAt: '2026-11-25T12:04:02.000Z',
    },
  ];

  var eventTypes = [
    ['run.started', 'info', 'Run Release check started in demo mode'],
    ['task.started', 'info', 'Task Plan the change started'],
    ['tool.call', 'info', 'search_symbols · 12 results · 34 ms'],
    ['approval.requested', 'warn', 'write_file src/lib/router.ts requires approval'],
    ['approval.approved', 'warn', 'write_file src/lib/router.ts approved by you'],
    ['task.completed', 'info', 'Reviewer finished review of router.ts'],
    ['project.indexed', 'info', '7 files · 18 symbols · 5 edges'],
    ['eval.passed', 'info', 'Fixture project integrity 3/3'],
    ['run.completed', 'info', 'Run Release check completed — 2/2 tasks'],
  ];
  var events = eventTypes.map(function (e, i) {
    return {
      id: id('evt', i + 1),
      ts: '2026-11-25T12:04:' + String(59 - i).padStart(2, '0') + '.000Z',
      type: e[0],
      severity: e[1],
      projectId: PROJECT_ID,
      runId: 'run_preview01',
      taskId: null,
      agentId: null,
      correlationId: 'cor_preview',
      source: 'preview',
      message: e[2],
      data: {},
      durationMs: 4 + i * 3,
    };
  });

  var suites = [
    {
      id: 'suite-fixture-integrity',
      name: 'Fixture project integrity',
      description: 'Deterministic checks against the bundled fixture repository. Runs without a provider.',
      kind: 'deterministic',
      cases: [
        { id: 'case_1', name: 'Fixture app entrypoint declares routes', kind: 'deterministic', criteria: 'Fixture content check.' },
        { id: 'case_2', name: 'Fixture service exports parser', kind: 'deterministic', criteria: 'Fixture content check.' },
        { id: 'case_3', name: 'Operation log contains no secrets', kind: 'deterministic', criteria: 'Redaction check.' },
      ],
    },
    {
      id: 'suite-project-index',
      name: 'Project intelligence checks',
      description: 'Validates the live index: file and symbol counts plus symbol search.',
      kind: 'deterministic',
      cases: [
        { id: 'case_4', name: 'Index has parsed files and symbols', kind: 'deterministic', criteria: 'Index completeness check.' },
        { id: 'case_5', name: 'Symbol search returns results', kind: 'deterministic', criteria: 'Search check.' },
      ],
    },
  ];

  var evalRun = {
    id: 'evr_preview01',
    suiteId: 'suite-fixture-integrity',
    mode: 'demo',
    status: 'completed',
    passed: 3,
    failed: 0,
    errors: 0,
    durationMs: 0,
    startedAt: '2026-11-25T12:03:58.000Z',
    finishedAt: '2026-11-25T12:03:58.000Z',
  };
  var evalResults = [
    { id: 'ers_1', evalRunId: 'evr_preview01', name: 'Entrypoint declares routes', status: 'pass', objective: true, detail: 'all 3 markers · 44 lines', durationMs: 0 },
    { id: 'ers_2', evalRunId: 'evr_preview01', name: 'Service exports parser', status: 'pass', objective: true, detail: 'all 3 markers · 38 lines', durationMs: 0 },
    { id: 'ers_3', evalRunId: 'evr_preview01', name: 'Operation log has no secrets', status: 'pass', objective: true, detail: '28 events, 0 leaks', durationMs: 1 },
  ];

  var mcpServers = [
    {
      id: 'mcp_internal',
      name: 'ARQENIUM internal',
      transport: 'http',
      url: 'http://127.0.0.1:4321/mcp',
      command: null,
      args: [],
      status: 'connected',
      permissions: { allowedTools: ['*'], deniedTools: ['evaluation_run'], autoApprovedTools: ['search_symbols'], resultCap: 20000 },
      lastError: null,
      lastConnectedAt: now(),
      createdAt: '2026-11-20T09:00:00.000Z',
    },
    {
      id: 'mcp_fs',
      name: 'filesystem',
      transport: 'stdio',
      url: null,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      status: 'disconnected',
      permissions: { allowedTools: ['read_*', 'list_*'], deniedTools: ['write_*'], autoApprovedTools: [], resultCap: 20000 },
      lastError: null,
      lastConnectedAt: null,
      createdAt: '2026-11-20T09:00:00.000Z',
    },
  ];

  // -------------------------------------------------------------- responses
  var known = {
    'app.info': function () {
      return {
        name: 'ARQENIUM',
        version: '1.0.0',
        runtime: 'web',
        dataDir: '(hosted preview — in-browser demo data)',
        node: 'n/a',
        platform: 'browser',
        telemetryEnabled: false,
        channels: [],
        capabilities: { streaming: false, nativeDialogs: false, demoMode: true },
        modules: modules,
      };
    },
    'app.health': function () {
      return {
        ok: true,
        version: '1.0.0',
        uptimeSec: Math.round(performance.now() / 1000),
        projects: 1,
        traceEvents: events.length,
        mcpServers: mcpServers.length,
        pendingApprovals: approvals.filter(function (a) { return a.status === 'pending'; }).length,
      };
    },
    'modules.list': function () { return modules; },
    'modules.set': function (input) {
      modules = modules.map(function (m) {
        return m.id === input.id ? Object.assign({}, m, { enabled: m.core ? true : !!input.enabled }) : m;
      });
      return modules.find(function (m) { return m.id === input.id; });
    },
    'projects.list': function () { return [project]; },
    'projects.get': function () { return project; },
    'projects.add': function () {
      throw err('not_permitted', 'The hosted preview is read-only. Install the desktop app to index a local folder.');
    },
    'projects.reindex': function () {
      project.lastIndexedAt = now();
      return project.indexStats;
    },
    'projects.tree': function (input) {
      var base = (input && input.base) || '';
      var levels = {
        '': [
          { name: 'src', path: 'src', type: 'directory', children: 3, language: null },
          { name: 'service.py', path: 'src/service.py', type: 'file', children: 0, language: 'python' },
          { name: 'tests', path: 'tests', type: 'directory', children: 1, language: null },
          { name: 'README.md', path: 'README.md', type: 'file', children: 0, language: 'markdown' },
          { name: 'package.json', path: 'package.json', type: 'file', children: 0, language: 'json' },
        ],
        src: [
          { name: 'index.ts', path: 'src/index.ts', type: 'file', children: 0, language: 'typescript' },
          { name: 'lib', path: 'src/lib', type: 'directory', children: 3, language: null },
          { name: 'service.py', path: 'src/service.py', type: 'file', children: 0, language: 'python' },
        ],
        'src/lib': [
          { name: 'format.ts', path: 'src/lib/format.ts', type: 'file', children: 0, language: 'typescript' },
          { name: 'router.ts', path: 'src/lib/router.ts', type: 'file', children: 0, language: 'typescript' },
        ],
        tests: [{ name: 'router.test.ts', path: 'tests/router.test.ts', type: 'file', children: 0, language: 'typescript' }],
      };
      return levels[base] || [];
    },
    'projects.file': function (input) {
      var content = files[input.path] || '# ' + input.path + '\n\nThis file is part of the preview dataset.\n';
      return {
        path: input.path,
        content: content,
        bytes: content.length,
        lines: content.split('\n').length,
        language: input.path.endsWith('.py') ? 'python' : 'typescript',
        truncated: false,
        binary: false,
        parseQuality: 'parsed',
        summary: 'Preview dataset file.',
        indexedAt: now(),
      };
    },
    'projects.symbols': function () {
      return { items: symbols, total: symbols.length };
    },
    'projects.search': function (input) {
      var q = String((input && input.query) || '').toLowerCase();
      var items = symbols.filter(function (s) { return s.name.toLowerCase().indexOf(q) !== -1; });
      return { items: items, total: items.length };
    },
    'projects.graph': function () {
      return { nodes: graph.nodes, edges: graph.edges, truncated: false };
    },
    'projects.impact': function (input) {
      return {
        root: (input && input.path) || 'src/lib/format.ts',
        parsed: [
          { path: 'src/lib/router.ts', depth: 1, confidence: 'parsed', reason: 'imports src/lib/format.ts', via: 'import' },
          { path: 'src/index.ts', depth: 2, confidence: 'parsed', reason: 'imports src/lib/router.ts', via: 'import' },
        ],
        heuristic: [
          { path: 'tests/router.test.ts', depth: 2, confidence: 'heuristic', reason: 'test name matches router', via: 'name-convention' },
        ],
        affectedTests: ['tests/router.test.ts'],
      };
    },
    'projects.summary': function () { return { summary: 'Small TypeScript + Python sample project.', highlights: ['4 TypeScript files', '1 Python module', '5 import edges'] }; },
    'projects.changes': function () { return { available: true, branch: 'main', changes: [] }; },
    'projects.remove': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'projects.stats': function () { return project.indexStats; },
    'agents.list': function () { return agents; },
    'agents.get': function (input) { return agents.find(function (a) { return a.id === input.agentId; }) || agents[0]; },
    'agents.templates': function () {
      return [
        { role: 'planner', name: 'Planner', description: 'Breaks work into concrete tasks.', systemPrompt: 'You are the Planner agent.', tools: ['project_structure', 'search_symbols', 'read_file'] },
        { role: 'implementer', name: 'Implementer', description: 'Produces code changes.', systemPrompt: 'You are the Implementer agent.', tools: ['read_file', 'write_file'] },
        { role: 'reviewer', name: 'Reviewer', description: 'Reviews outputs.', systemPrompt: 'You are the Reviewer agent.', tools: ['read_file', 'search_symbols'] },
      ];
    },
    'agents.create': function () { throw err('not_permitted', 'The hosted preview is read-only. Install the desktop app to create agents.'); },
    'agents.update': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'agents.delete': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'runs.list': function () { return runs; },
    'runs.get': function (input) {
      return { run: runs[0], tasks: tasks, toolCalls: [], approvals: approvals };
    },
    'runs.events': function () { return events; },
    'runs.create': function () { throw err('not_permitted', 'The hosted preview cannot execute runs. Install the desktop app for live orchestration.'); },
    'runs.cancel': function () { throw err('not_permitted', 'The hosted preview cannot execute runs.'); },
    'tasks.get': function (input) { return tasks.find(function (t) { return t.id === input.taskId; }) || tasks[0]; },
    'approvals.list': function (input) {
      var status = input && input.status;
      return approvals.filter(function (a) { return !status || a.status === status; });
    },
    'approvals.decide': function (input) {
      approvals = approvals.map(function (a) {
        return a.id === input.approvalId
          ? Object.assign({}, a, { status: input.approved ? 'approved' : 'denied', decidedBy: 'you (preview)', decidedAt: now() })
          : a;
      });
      return approvals.find(function (a) { return a.id === input.approvalId; });
    },
    'providers.list': function () { return [demoProvider]; },
    'providers.test': function () { return { ok: true, latencyMs: 1, message: 'Demo provider is always healthy (no network)' }; },
    'providers.models': function () { return [{ id: 'demo-deterministic', name: 'demo-deterministic' }]; },
    'providers.create': function () { throw err('not_permitted', 'The hosted preview is read-only. Install the desktop app to add providers.'); },
    'providers.update': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'providers.delete': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'providers.chat': function () { throw err('not_permitted', 'The hosted preview cannot call a model.'); },
    'trace.events': function (input) {
      var sev = input && input.severity;
      var type = input && input.type;
      return { items: events.filter(function (e) { return (!sev || e.severity === sev) && (!type || e.type === type); }) };
    },
    'trace.toolCalls': function () { return { items: [] }; },
    'trace.summary': function () { return { total: events.length, bySeverity: { info: events.length - 2, warn: 2, error: 0, debug: 0 }, byType: {} }; },
    'trace.eventTypes': function () {
      return eventTypes.map(function (e) { return { type: e[0], count: 1 }; });
    },
    'evals.suites': function () { return suites; },
    'evals.runs': function () { return [evalRun]; },
    'evals.results': function () { return { run: evalRun, results: evalResults }; },
    'evals.run': function () {
      return { evalRun: evalRun, results: evalResults };
    },
    'evals.rerun': function () { return { evalRun: evalRun, results: evalResults }; },
    'evals.export': function () { return { format: 'json', data: { run: evalRun, results: evalResults } }; },
    'evals.suiteCreate': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'evals.suiteDelete': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'mcp.list': function () { return mcpServers; },
    'mcp.capabilities': function (input) {
      var server = mcpServers.find(function (s) { return s.id === input.serverId; }) || mcpServers[0];
      return [
        { id: 'cap_1', serverId: server.id, kind: 'tool', name: 'project_structure', description: 'List the indexed file tree', inputSchema: { type: 'object', properties: {} } },
        { id: 'cap_2', serverId: server.id, kind: 'tool', name: 'search_symbols', description: 'Search parsed symbols by name', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
        { id: 'cap_3', serverId: server.id, kind: 'tool', name: 'read_file', description: 'Read a file inside the project root', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
      ];
    },
    'mcp.directory': function () { return { tools: [], resources: [], prompts: [] }; },
    'mcp.call': function () {
      return { ok: true, isError: false, durationMs: 4, content: [{ total: 2, symbols: symbols.slice(0, 2).map(function (s) { return { name: s.name, path: s.path, line: s.line }; }) }] };
    },
    'mcp.internal.status': function () {
      return { enabled: true, running: false, port: 4321, url: 'http://127.0.0.1:4321/mcp', toolCount: 6, lastError: 'Not started in the hosted preview' };
    },
    'mcp.internal.set': function (input) {
      return { enabled: !!(input && input.enabled), running: false, port: 4321, url: 'http://127.0.0.1:4321/mcp', toolCount: 6, lastError: 'Not started in the hosted preview' };
    },
    'mcp.add': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'mcp.update': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'mcp.remove': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'mcp.connect': function () { throw err('not_permitted', 'The hosted preview cannot open MCP transports.'); },
    'mcp.disconnect': function () { throw err('not_permitted', 'The hosted preview cannot open MCP transports.'); },
    'mcp.status': function () { return { servers: mcpServers.map(function (s) { return { id: s.id, status: s.status }; }) }; },
    'terminal.sessions': function () { return [{ id: 'trm_1', projectId: PROJECT_ID, cwd: '', createdAt: now(), lastUsedAt: now(), commandCount: 2 }]; },
    'terminal.history': function () { return { items: [] }; },
    'terminal.explain': function (input) {
      return { command: input.command || 'ls -la src', argv: String(input.command || 'ls -la src').split(' '), explanation: 'Runs a directory listing. Risk signals: none. Overall risk: low. A human approval is required before this command runs.', risk: 'low', riskReasons: [], blocked: false };
    },
    'terminal.preview': function () {
      throw err('not_permitted', 'EchoShell cannot execute commands in the hosted preview. Install the desktop app.');
    },
    'terminal.sessionCreate': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'terminal.sessionDelete': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'terminal.execute': function () { throw err('not_permitted', 'The hosted preview cannot execute commands.'); },
    'rebuild.captures': function () { return []; },
    'rebuild.captureScreenshot': function () { throw err('not_permitted', 'Rebuild Studio needs the desktop app to store captures.'); },
    'rebuild.captureUrl': function () { throw err('not_permitted', 'The hosted preview cannot fetch pages.'); },
    'rebuild.captureDelete': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'rebuild.analyze': function () { throw err('not_permitted', 'Rebuild Studio needs the desktop app.'); },
    'rebuild.generate': function () { throw err('not_permitted', 'Rebuild Studio needs the desktop app.'); },
    'rebuild.preview': function () { throw err('not_permitted', 'Rebuild Studio needs the desktop app.'); },
    'rebuild.exportPreview': function () { throw err('not_permitted', 'Rebuild Studio needs the desktop app.'); },
    'rebuild.exportCommit': function () { throw err('not_permitted', 'Rebuild Studio needs the desktop app.'); },
    'context.list': function () { return []; },
    'context.upsert': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'context.delete': function () { throw err('not_permitted', 'The hosted preview is read-only.'); },
    'credentials.list': function () { return []; },
    'credentials.has': function () { return false; },
    'credentials.set': function () { throw err('not_permitted', 'The hosted preview never stores credentials.'); },
    'credentials.delete': function () { throw err('not_permitted', 'The hosted preview never stores credentials.'); },
    'settings.get': function () { return null; },
    'settings.list': function () {
      return [
        { key: 'ui.theme', value: 'dark', updatedAt: now() },
        { key: 'tracex.retentionDays', value: 30, updatedAt: now() },
      ];
    },
    'settings.set': function (input) { return { key: input.key, value: input.value, updatedAt: now() }; },
    'artifacts.list': function () { return []; },
  };

  function err(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  var listeners = [];
  function emit(event) {
    listeners.forEach(function (fn) {
      try {
        fn(event);
      } catch (e) {
        /* a broken listener must not break the bridge */
      }
    });
  }

  var n = 0;
  function invoke(channel, input) {
    var handler = known[channel];
    if (!handler) {
      return Promise.resolve({
        ok: false,
        error: { code: 'not_permitted', message: channel + ' is not available in the hosted preview.' },
      });
    }
    try {
      return Promise.resolve({ ok: true, result: handler(input || {}) });
    } catch (e) {
      return Promise.resolve({ ok: false, error: { code: e.code || 'request_failed', message: e.message } });
    }
  }

  var bridge = {
    runtime: 'electron',
    preview: true,
    invoke: invoke,
    pickDirectory: function () { return Promise.resolve(null); },
    pickFile: function () { return Promise.resolve(null); },
    openExternal: function (url) {
      if (!/^https?:\/\//.test(url)) return Promise.resolve(false);
      window.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve(true);
    },
    onEvent: function (listener) {
      if (typeof listener !== 'function') return function () {};
      listeners.push(listener);
      n += 1;
      if (n === 1) {
        // One synthetic frame so the UI's stream indicator shows "live".
        setTimeout(function () {
          emit({
            id: id('evt', 99),
            ts: now(),
            type: 'app.started',
            severity: 'info',
            projectId: PROJECT_ID,
            runId: null,
            taskId: null,
            agentId: null,
            correlationId: null,
            source: 'preview',
            message: 'Hosted preview bridge connected',
            data: {},
            durationMs: null,
          });
        }, 50);
      }
      return function () {
        listeners = listeners.filter(function (f) { return f !== listener; });
      };
    },
  };

  /**
   * Only install the shim when no core answers. A local `npm run dev` serves the
   * same index.html, and there the real API must win.
   */
  var installed = false;
  function install() {
    if (installed) return;
    installed = true;
    window.arqenium = bridge;
    console.info('[arqenium] hosted preview bridge active — demo data, read-only.');
  }

  fetch('/api/info', { method: 'GET', headers: { accept: 'application/json' } })
    .then(function (res) {
      var type = res.headers.get('content-type') || '';
      // A static host answers the SPA fallback here; only real JSON means a core.
      if (!res.ok || type.indexOf('application/json') === -1) install();
    })
    .catch(install);

  // If the probe is still in flight, don't block the app; the store retries on
  // failure and this shim is in place by then.
  setTimeout(function () {
    if (!window.arqenium) install();
  }, 1200);
})();
