import { useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  IconActivity,
  IconAdjustments,
  IconBrandGithub,
  IconBox,
  IconChartHistogram,
  IconFolders,
  IconGauge,
  IconMoon,
  IconPlugConnected,
  IconRobot,
  IconSun,
  IconTerminal2,
  IconWindowMaximize,
} from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { request, subscribeEvents } from '../lib/bridge';
import { BrandMark, BrandWordmark } from './BrandMark';
import { Dot, Tag } from './ui';
import type { ModuleId, Project } from '../lib/types';

interface NavEntry {
  to: string;
  label: string;
  icon: React.ReactNode;
  module?: ModuleId;
  group: 'workspace' | 'system';
}

const NAV: NavEntry[] = [
  { to: '/', label: 'Overview', icon: <IconGauge size={16} />, group: 'workspace' },
  { to: '/projects', label: 'Projects', icon: <IconFolders size={16} />, module: 'project-intelligence', group: 'workspace' },
  { to: '/agents', label: 'Agents', icon: <IconRobot size={16} />, module: 'agent-control', group: 'workspace' },
  { to: '/runs', label: 'Runs', icon: <IconActivity size={16} />, module: 'agent-control', group: 'workspace' },
  { to: '/integrations', label: 'Integrations', icon: <IconPlugConnected size={16} />, module: 'openbridge', group: 'workspace' },
  { to: '/evaluation', label: 'Evaluation', icon: <IconChartHistogram size={16} />, module: 'evaluation', group: 'workspace' },
  { to: '/observability', label: 'Observability', icon: <IconChartHistogram size={16} />, module: 'tracex', group: 'workspace' },
  { to: '/terminal', label: 'Terminal', icon: <IconTerminal2 size={16} />, module: 'echoshell', group: 'workspace' },
  { to: '/rebuild', label: 'Rebuild Studio', icon: <IconWindowMaximize size={16} />, module: 'rebuild-studio', group: 'workspace' },
  { to: '/modules', label: 'Modules', icon: <IconBox size={16} />, group: 'system' },
  { to: '/settings', label: 'Settings', icon: <IconAdjustments size={16} />, group: 'system' },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/projects': 'Projects',
  '/agents': 'Agents',
  '/runs': 'Runs',
  '/integrations': 'Integrations',
  '/evaluation': 'Evaluation Lab',
  '/observability': 'Observability',
  '/terminal': 'EchoShell',
  '/rebuild': 'Rebuild Studio',
  '/modules': 'Modules',
  '/settings': 'Settings',
};

export function Shell({ children }: { children: React.ReactNode }) {
  const { modules, moduleEnabled, projects, currentProjectId, setProject, theme, toggleTheme, pushEvent, refreshApprovals, booted, pendingApprovals } =
    useApp();
  const location = useLocation();
  const eventState = useApp((s) => s.eventState);
  const setEventState = useApp.setState;

  useEffect(() => {
    const off = subscribeEvents(
      (e) => {
        pushEvent(e);
        if (e.type.startsWith('approval.')) void refreshApprovals();
      },
      (state) => setEventState({ eventState: state }),
    );
    return off;
  }, [pushEvent, refreshApprovals, setEventState]);

  // Poll pending approvals as a fallback when the stream drops.
  useEffect(() => {
    const t = setInterval(() => void refreshApprovals(), 8000);
    return () => clearInterval(t);
  }, [refreshApprovals]);

  const visible = useMemo(() => NAV.filter((n) => !n.module || moduleEnabled(n.module)), [modules, moduleEnabled]);
  const groups: Array<{ key: 'workspace' | 'system'; label: string }> = [
    { key: 'workspace', label: 'Workspace' },
    { key: 'system', label: 'System' },
  ];
  const current = projects.find((p: Project) => p.id === currentProjectId) ?? null;
  const title = PAGE_TITLES[location.pathname] ?? 'ARQENIUM';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span style={{ color: 'var(--accent)', display: 'flex' }}>
            <BrandMark size={24} />
          </span>
          <BrandWordmark />
        </div>

        <nav className="nav" aria-label="Main navigation">
          {groups.map((g) => {
            const entries = visible.filter((n) => n.group === g.key);
            if (!entries.length) return null;
            return (
              <div key={g.key}>
                <div className="nav-group">{g.label}</div>
                {entries.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === '/'}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    title={n.label}
                  >
                    {n.icon}
                    <span className="nav-label">{n.label}</span>
                    {n.to === '/runs' && pendingApprovals > 0 ? (
                      <span className="nav-badge warn" title={`${pendingApprovals} pending approval(s)`}>
                        {pendingApprovals}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="conn-state" title={eventState === 'live' ? 'Live event stream connected' : 'Reconnecting to the event stream'}>
            <Dot tone={eventState === 'live' ? 'live' : eventState === 'reconnecting' ? 'warn' : 'idle'} />
            <span className="conn-text">{eventState === 'live' ? 'Live stream' : eventState === 'reconnecting' ? 'Reconnecting' : 'Offline'}</span>
            <span className="spacer" />
            <button className="btn btn-ghost btn-icon btn-sm" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label="Toggle theme">
              {theme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <span>{title}</span>
            {current ? (
              <>
                <span className="topbar-sub">/</span>
                <span className="topbar-sub truncate" style={{ maxWidth: 260 }}>
                  {current.name}
                </span>
              </>
            ) : null}
          </div>
          <span className="spacer" />
          {projects.length > 0 ? (
            <div className="project-switch" title="Active project">
              <IconFolders size={13} style={{ color: 'var(--fg-4)' }} />
              <select value={currentProjectId ?? ''} onChange={(e) => setProject(e.target.value || null)} aria-label="Active project">
                {projects.map((p: Project) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {current && current.indexState === 'indexing' ? <Tag tone="info">Indexing</Tag> : null}
          {current && current.indexState === 'error' ? <Tag tone="err">Index error</Tag> : null}
          {!booted ? <Tag tone="warn">Starting</Tag> : null}
          <button
            className="btn btn-ghost btn-icon btn-sm"
            title="Open the ARQENIUM repository"
            aria-label="Open the ARQENIUM repository"
            onClick={() => {
              void request('app.health', {}).catch(() => undefined);
              window.open('https://github.com/M11-Developer/Arqenium', '_blank', 'noopener,noreferrer');
            }}
          >
            <IconBrandGithub size={15} />
          </button>
        </header>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'err' ? 'toast-err' : t.kind === 'ok' ? 'toast-ok' : ''}`}>
          <Dot tone={t.kind === 'err' ? 'err' : t.kind === 'ok' ? 'ok' : 'info'} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{t.title}</div>
            {t.body ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 2, overflowWrap: 'anywhere' }}>
                {t.body}
              </div>
            ) : null}
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
