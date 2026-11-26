import os from 'node:os';
import path from 'node:path';
import { openDb, type Db } from './db/database';
import { EventBus } from './events/bus';
import { SettingsService } from './settings';
import { ModuleService } from './modules';
import { CredentialStore } from './credentials';
import { ApprovalService } from './approvals';
import { TraceService } from './traces/service';
import { ContextService } from './context/service';
import { ProviderRegistry } from './providers/registry';
import { ProjectService } from './projects/service';
import { LanguageRegistry } from './projects/lang/registry';
import { AgentService } from './agents/service';
import { ToolRouter } from './orchestration/tools';
import { Orchestrator } from './orchestration/engine';
import { McpClientManager } from './mcp/client';
import { InternalMcpServer } from './mcp/internal-server';
import { EvalService } from './evals/service';
import { TerminalService } from './terminal/service';
import { RebuildService } from './rebuild/service';
import { VERSION } from './dispatcher';

export interface CoreOptions {
  dataDir?: string;
  dbFile?: string;
  /** ':memory:' for tests. */
  inMemory?: boolean;
}

export interface Core {
  /** Application version, shared by the API, the UI and the desktop shell. */
  version: string;
  dataDir: string;
  dbFile: string;
  db: Db;
  events: EventBus;
  settings: SettingsService;
  modules: ModuleService;
  credentials: CredentialStore;
  approvals: ApprovalService;
  traces: TraceService;
  context: ContextService;
  providers: ProviderRegistry;
  projects: ProjectService;
  agents: AgentService;
  tools: ToolRouter;
  orchestrator: Orchestrator;
  mcp: McpClientManager;
  internalMcp: InternalMcpServer;
  evals: EvalService;
  languages: LanguageRegistry;
  terminal: TerminalService;
  rebuild: RebuildService;
  dispose(): Promise<void>;
}

export function resolveDataDir(): string {
  const fromEnv = process.env.ARQ_DATA_DIR;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim());
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Arqenium');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Arqenium');
  }
  return path.join(process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'), 'arqenium');
}

/**
 * Composition root. Every service is constructed once, wired explicitly, and
 * shares the same SQLite handle, event bus and capability registry - this is
 * what makes the modules one product rather than a bundle of tools.
 */
export function createCore(opts: CoreOptions = {}): Core {
  const dataDir = opts.dataDir ?? (opts.inMemory ? path.join(os.tmpdir(), 'arqenium-test') : resolveDataDir());
  const dbFile = opts.inMemory ? ':memory:' : opts.dbFile ?? path.join(dataDir, 'arqenium.db');
  const db = openDb({ file: dbFile });

  const events = new EventBus();
  const settings = new SettingsService(db);
  const modules = new ModuleService(db, events);
  const credentials = new CredentialStore(db, events, dataDir);
  const approvals = new ApprovalService(db, events);
  const traces = new TraceService(db, events);
  const context = new ContextService(db, events);

  // The registry self-registers the built-in adapters and seeds the demo provider.
  const providers = new ProviderRegistry(db, events, credentials);
  const languages = new LanguageRegistry();
  // Probe interpreters without blocking startup; the registry reports false until known.
  void languages.hydrate();
  const projects = new ProjectService(db, events, modules, languages);
  const agents = new AgentService(db, events, (id) => {
    try {
      projects.get(id);
      return true;
    } catch {
      return false;
    }
  });
  const tools = new ToolRouter(approvals, traces, modules, projects);
  const orchestrator = new Orchestrator(
    db,
    events,
    approvals,
    traces,
    modules,
    projects,
    agents,
    providers,
    context,
    settings,
    tools,
  );
  const mcp = new McpClientManager(db, events, modules, credentials);
  const evals = new EvalService(db, events, modules, projects, orchestrator, agents);
  const internalMcp = new InternalMcpServer({ db, events, projects, orchestrator, traces, modules, evals });
  const terminal = new TerminalService(db, events, approvals, modules, projects);
  const rebuild = new RebuildService(db, events, modules, approvals, projects, dataDir);

  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    orchestrator.dispose();
    approvals.dispose();
    projects.dispose();
    await mcp.disconnectAll().catch(() => undefined);
    await internalMcp.stop().catch(() => undefined);
    try {
      db.close();
    } catch {
      // already closed
    }
  };

  return {
    version: VERSION,
    dataDir,
    dbFile,
    db,
    events,
    settings,
    modules,
    credentials,
    approvals,
    traces,
    context,
    providers,
    projects,
    agents,
    tools,
    orchestrator,
    mcp,
    internalMcp,
    evals,
    languages,
    terminal,
    rebuild,
    dispose,
  };
}
