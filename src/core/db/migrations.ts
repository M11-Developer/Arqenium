export interface Migration {
  id: string;
  up: string;
}

/**
 * Sequential schema migrations. Each id is applied at most once inside a
 * transaction and recorded in schema_migrations.
 */
export const MIGRATIONS: Migration[] = [
  {
    id: '001_initial_schema',
    up: `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL,
  last_indexed_at TEXT,
  index_state TEXT NOT NULL DEFAULT 'idle',
  index_stats TEXT NOT NULL DEFAULT '{}',
  exclusions TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE indexed_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  language TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  mtime_ms INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'indexed',
  parse_quality TEXT NOT NULL DEFAULT 'none',
  error TEXT,
  symbol_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, path)
);
CREATE INDEX idx_files_project ON indexed_files(project_id);

CREATE TABLE symbols (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES indexed_files(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  line INTEGER NOT NULL,
  end_line INTEGER NOT NULL DEFAULT 0,
  signature TEXT NOT NULL DEFAULT '',
  container TEXT,
  exported INTEGER NOT NULL DEFAULT 0,
  quality TEXT NOT NULL DEFAULT 'parsed'
);
CREATE INDEX idx_symbols_project_name ON symbols(project_id, name);
CREATE INDEX idx_symbols_project_path ON symbols(project_id, path);
CREATE INDEX idx_symbols_kind ON symbols(project_id, kind);

CREATE TABLE file_edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_path TEXT NOT NULL,
  to_path TEXT,
  external INTEGER NOT NULL DEFAULT 0,
  module_spec TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'import',
  resolved INTEGER NOT NULL DEFAULT 0,
  line INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, from_path, module_spec, kind, line)
);
CREATE INDEX idx_edges_from ON file_edges(project_id, from_path);
CREATE INDEX idx_edges_to ON file_edges(project_id, to_path);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  model_ref TEXT,
  tools TEXT NOT NULL DEFAULT '[]',
  permissions TEXT NOT NULL DEFAULT '{}',
  max_iterations INTEGER NOT NULL DEFAULT 8,
  timeout_ms INTEGER NOT NULL DEFAULT 120000,
  max_retries INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_agents_project ON agents(project_id);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'orchestration',
  mode TEXT NOT NULL DEFAULT 'live',
  trigger TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'pending',
  labels TEXT NOT NULL DEFAULT '[]',
  budget TEXT NOT NULL DEFAULT '{}',
  stats TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  canceled_at TEXT
);
CREATE INDEX idx_runs_project ON runs(project_id, created_at);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  pipeline TEXT NOT NULL DEFAULT '[]',
  depends_on TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 50,
  input TEXT NOT NULL DEFAULT '',
  output TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX idx_tasks_run ON tasks(run_id);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  project_id TEXT,
  run_id TEXT,
  task_id TEXT,
  agent_id TEXT,
  correlation_id TEXT,
  source TEXT NOT NULL DEFAULT 'app',
  message TEXT NOT NULL DEFAULT '',
  data TEXT,
  duration_ms INTEGER
);
CREATE INDEX idx_events_ts ON events(ts DESC);
CREATE INDEX idx_events_run ON events(run_id, ts);
CREATE INDEX idx_events_project ON events(project_id, ts DESC);
CREATE INDEX idx_events_type ON events(type, ts DESC);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  task_id TEXT,
  server TEXT NOT NULL DEFAULT 'internal',
  tool TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'agent',
  input TEXT,
  output TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  error TEXT,
  approval_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER
);
CREATE INDEX idx_toolcalls_run ON tool_calls(run_id, started_at);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  task_id TEXT,
  project_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  risk TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decision_reason TEXT,
  decided_by TEXT
);
CREATE INDEX idx_approvals_status ON approvals(status, created_at DESC);

CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  transport TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  permissions TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'disabled',
  last_error TEXT,
  last_connected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE mcp_capabilities (
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  schema TEXT NOT NULL DEFAULT '{}',
  discovered_at TEXT NOT NULL,
  PRIMARY KEY (server_id, kind, name)
);

CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT,
  default_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  credential_ref TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE credentials (
  scope TEXT NOT NULL,
  ref TEXT NOT NULL,
  algo TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, ref)
);

CREATE TABLE eval_suites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'deterministic',
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE eval_cases (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES eval_suites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'deterministic',
  config TEXT NOT NULL DEFAULT '{}',
  criteria TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_cases_suite ON eval_cases(suite_id, order_index);

CREATE TABLE eval_runs (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  suite_name TEXT NOT NULL DEFAULT '',
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  mode TEXT NOT NULL DEFAULT 'demo',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  stats TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_evalruns_suite ON eval_runs(suite_id, started_at DESC);

CREATE TABLE eval_results (
  id TEXT PRIMARY KEY,
  eval_run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  case_name TEXT NOT NULL DEFAULT '',
  agent_id TEXT,
  status TEXT NOT NULL,
  score REAL,
  metrics TEXT NOT NULL DEFAULT '{}',
  objective TEXT NOT NULL DEFAULT '',
  subjective TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  run_id TEXT
);
CREATE INDEX idx_evalresults_run ON eval_results(eval_run_id);

CREATE TABLE context_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'user',
  include_in_prompt INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, key)
);

CREATE TABLE terminal_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'session',
  cwd TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE terminal_commands (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  argv TEXT NOT NULL,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  signal TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  stdout TEXT NOT NULL DEFAULT '',
  stderr TEXT NOT NULL DEFAULT '',
  approval_id TEXT,
  risk TEXT NOT NULL DEFAULT 'low',
  risk_reasons TEXT NOT NULL DEFAULT '[]',
  agent_initiated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_terminal_project ON terminal_commands(project_id, created_at DESC);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  run_id TEXT,
  kind TEXT NOT NULL,
  path TEXT,
  name TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_artifacts_project ON artifacts(project_id, created_at DESC);

CREATE TABLE rebuild_captures (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  path TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE rebuild_analyses (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL REFERENCES rebuild_captures(id) ON DELETE CASCADE,
  project_id TEXT,
  extracted TEXT NOT NULL DEFAULT '{}',
  inferred TEXT NOT NULL DEFAULT '{}',
  warnings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE rebuild_exports (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  target_dir TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
`,
  },
  {
    id: '002_event_retention_setting',
    up: `
INSERT INTO settings (key, value, updated_at)
VALUES ('tracex.retentionDays', '30', datetime('now'))
ON CONFLICT(key) DO NOTHING;
`,
  },
];
