import { create } from 'zustand';
import type { Agent, AppInfo, EventRecordLike, ModuleId, ModuleState, Project, ProviderConfig, Run } from './types';
import type { ArqeniumEvent } from './bridge';
import { request, runtime } from './bridge';

type Toast = { id: number; kind: 'ok' | 'err' | 'info'; title: string; body?: string };

interface AppState {
  booted: boolean;
  bootError: string | null;
  info: AppInfo | null;
  runtime: 'electron' | 'web';
  modules: ModuleState[];
  projects: Project[];
  currentProjectId: string | null;
  providers: ProviderConfig[];
  agents: Agent[];
  runs: Run[];
  events: ArqeniumEvent[];
  eventState: 'live' | 'reconnecting' | 'closed';
  pendingApprovals: number;
  theme: 'dark' | 'light';
  toasts: Toast[];
  sidebarOpen: boolean;

  boot: () => Promise<void>;
  refreshModules: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshProviders: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  refreshRuns: () => Promise<void>;
  refreshApprovals: () => Promise<void>;
  setProject: (id: string | null) => void;
  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
  moduleEnabled: (id: ModuleId) => boolean;
  pushEvent: (e: ArqeniumEvent) => void;
  toast: (kind: Toast['kind'], title: string, body?: string) => void;
  dismissToast: (id: number) => void;
}

const THEME_KEY = 'arqenium.theme';
const PROJECT_KEY = 'arqenium.project';

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  bootError: null,
  info: null,
  runtime: runtime,
  modules: [],
  projects: [],
  currentProjectId: null,
  providers: [],
  agents: [],
  runs: [],
  events: [],
  eventState: 'reconnecting',
  pendingApprovals: 0,
  theme: 'dark',
  toasts: [],
  sidebarOpen: false,

  async boot() {
    try {
      const [info, modules, projects, providers] = await Promise.all([
        request('app.info', {}) as Promise<AppInfo>,
        request('modules.list', {}) as Promise<ModuleState[]>,
        request('projects.list', {}) as Promise<Project[]>,
        request('providers.list', {}) as Promise<ProviderConfig[]>,
      ]);
      const stored = localStorage.getItem(PROJECT_KEY);
      const valid = projects.find((p) => p.id === stored) ?? projects[0] ?? null;
      const theme = (localStorage.getItem(THEME_KEY) as 'dark' | 'light' | null) ?? 'dark';
      document.documentElement.dataset.theme = theme;
      set({
        booted: true,
        info,
        modules,
        projects,
        providers,
        currentProjectId: valid ? valid.id : null,
        theme,
        runtime: info.runtime,
        bootError: null,
      });
      const approvalCount = (await request('approvals.list', { status: 'pending', limit: 1 }).catch(() => [])) as unknown[];
      set({ pendingApprovals: approvalCount.length });
      if (valid) {
        const [agents, runs] = await Promise.all([
          request('agents.list', { projectId: valid.id }).catch(() => []) as Promise<Agent[]>,
          request('runs.list', { projectId: valid.id, limit: 50 }).catch(() => []) as Promise<Run[]>,
        ]);
        set({ agents, runs });
      }
    } catch (err) {
      set({ booted: false, bootError: err instanceof Error ? err.message : String(err) });
    }
  },

  async refreshModules() {
    const modules = (await request('modules.list', {})) as ModuleState[];
    set({ modules });
  },

  async refreshProjects() {
    const projects = (await request('projects.list', {})) as Project[];
    const current = get().currentProjectId;
    const stillThere = projects.find((p) => p.id === current);
    set({ projects, currentProjectId: stillThere ? current : (projects[0]?.id ?? null) });
  },

  async refreshProviders() {
    const providers = (await request('providers.list', {})) as ProviderConfig[];
    set({ providers });
  },

  async refreshAgents() {
    const projectId = get().currentProjectId;
    const agents = (await request('agents.list', projectId ? { projectId } : {}).catch(() => [])) as Agent[];
    set({ agents });
  },

  async refreshRuns() {
    const projectId = get().currentProjectId;
    const runs = (await request('runs.list', projectId ? { projectId, limit: 100 } : { limit: 100 }).catch(() => [])) as Run[];
    set({ runs });
  },

  async refreshApprovals() {
    const rows = (await request('approvals.list', { status: 'pending', limit: 99 }).catch(() => [])) as unknown[];
    set({ pendingApprovals: rows.length });
  },

  setProject(id) {
    if (id) localStorage.setItem(PROJECT_KEY, id);
    else localStorage.removeItem(PROJECT_KEY);
    set({ currentProjectId: id, agents: [], runs: [] });
    void get().refreshAgents();
    void get().refreshRuns();
  },

  setTheme(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem(THEME_KEY, t);
    set({ theme: t });
  },

  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },

  moduleEnabled(id) {
    const m = get().modules.find((x) => x.id === id);
    return m ? m.enabled : false;
  },

  pushEvent(e) {
    // Keep a bounded ring buffer; TraceX queries the persisted log for history.
    const next = [e, ...get().events];
    if (next.length > 400) next.length = 400;
    set({ events: next });
  },

  toast(kind, title, body) {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, kind, title, body }] });
    setTimeout(() => get().dismissToast(id), kind === 'err' ? 9000 : 4200);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export type { EventRecordLike };
