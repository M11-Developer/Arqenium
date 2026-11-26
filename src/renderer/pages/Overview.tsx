import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconChartHistogram,
  IconChecklist,
  IconCircleCheck,
  IconFolders,
  IconPlugConnected,
  IconPlus,
  IconRobot,
  IconShieldCheck,
} from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { request, canPickNative, pickDirectory } from '../lib/bridge';
import { Banner, Button, Dot, EmptyState, Loading, Stat, Tag, timeAgo } from '../components/ui';
import type { Approval, Project, Run } from '../lib/types';
import { RunWizard } from './runs/RunWizard';

interface Health {
  ok: boolean;
  version: string;
  uptimeSec: number;
  projects: number;
  mcpServers: number;
  traceEvents: number;
  providers: Array<{ id: string; kind: string; enabled: boolean; model: string | null }>;
  pendingApprovals: number;
  languages: Array<{ id: string; displayName: string; available: boolean }>;
  modules: Array<{ id: string; enabled: boolean }>;
}

export function Overview() {
  const { projects, currentProjectId, providers, agents, runs, refreshProjects, refreshRuns, moduleEnabled, toast, setProject } = useApp();
  const [health, setHealth] = useState<Health | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [busy, setBusy] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const navigate = useNavigate();

  const project = projects.find((p) => p.id === currentProjectId) ?? null;

  const load = useCallback(async () => {
    const [h, a] = await Promise.all([
      request('app.health', {}).catch(() => null) as Promise<Health | null>,
      request('approvals.list', { status: 'pending', limit: 5 }).catch(() => []) as Promise<Approval[]>,
    ]);
    setHealth(h);
    setApprovals(a);
  }, []);

  useEffect(() => {
    void load();
  }, [load, currentProjectId]);

  // Refresh health while a project is indexing so progress is visible.
  useEffect(() => {
    if (!project || project.indexState !== 'indexing') return;
    const t = setInterval(() => {
      void refreshProjects();
      void load();
    }, 2500);
    return () => clearInterval(t);
  }, [project, refreshProjects, load]);

  async function addProject() {
    const path = pathInput.trim();
    if (!path) {
      toast('err', 'Enter a project folder path');
      return;
    }
    setBusy(true);
    try {
      const created = (await request('projects.add', { path })) as Project;
      await refreshProjects();
      setProject(created.id);
      setShowAdd(false);
      setPathInput('');
      toast('ok', `Project added: ${created.name}`, 'Indexing started in the background.');
      void load();
    } catch (err) {
      toast('err', 'Could not add the project', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function chooseFolder() {
    const dir = await pickDirectory();
    if (dir) setPathInput(dir);
  }

  const liveProviders = providers.filter((p) => p.enabled && p.kind !== 'demo');
  const demoProvider = providers.find((p) => p.kind === 'demo');
  const noProvider = liveProviders.length === 0;
  const recentRuns = runs.slice(0, 6);
  const piEnabled = moduleEnabled('project-intelligence');

  return (
    <div className="page">
      <div className="hero">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <Tag tone="accent">Engineering control plane</Tag>
            {health ? <span className="mono dim">v{health.version}</span> : null}
            <span className="mono dim">uptime {health ? Math.round(health.uptimeSec / 60) : 0}m</span>
          </div>
          <h1 className="hero-title">One workspace. Connected agents. Complete engineering visibility.</h1>
          <p className="hero-body">
            ARQENIUM indexes your repository locally, runs multi-agent engineering tasks against it through
            approval-gated tools, records every step in TraceX, and lets you evaluate the result - without sending
            your source code anywhere unless you configure a provider.
          </p>
        </div>
        <div className="hero-actions">
          <Button variant="primary" icon={<IconBolt size={14} />} onClick={() => setShowWizard(true)} disabled={!project || agents.length === 0}>
            New engineering run
          </Button>
          <Button icon={<IconPlus size={14} />} onClick={() => setShowAdd(true)}>
            Add project
          </Button>
          <Button variant="ghost" icon={<IconFolders size={14} />} onClick={() => navigate('/projects')}>
            Open Project Intelligence
          </Button>
        </div>
      </div>

      {!piEnabled ? (
        <Banner tone="warn" title="Project Intelligence is disabled">
          The indexing engine is off, so repository analysis, search and impact analysis are unavailable. Re-enable it
          in Modules.
        </Banner>
      ) : null}

      {noProvider ? (
        <Banner
          tone="info"
          title="No AI provider configured - demo mode is active"
          action={
            <Button size="sm" onClick={() => navigate('/settings')}>
              Configure provider
            </Button>
          }
        >
          Everything except live agent execution works offline: indexing, symbol search, dependency graphs, impact
          analysis, TraceX, evaluations and the internal MCP server. Runs you start now execute against the{' '}
          <strong>demo provider</strong> and are labelled <span className="mono">mode=demo</span> throughout the UI and
          TraceX. Demo outputs are deterministic samples, not real model output.
          {demoProvider ? null : ' The demo provider record is missing; restart the app.'}
        </Banner>
      ) : null}

      {approvals.length > 0 ? (
        <Banner tone="warn" title={`${approvals.length} operation(s) waiting for your approval`}>
          <div className="stack-2" style={{ marginTop: 6 }}>
            {approvals.map((a) => (
              <div key={a.id} className="row" style={{ gap: 8 }}>
                <Tag tone={a.risk === 'high' ? 'err' : 'warn'}>{a.risk}</Tag>
                <span className="truncate" style={{ flex: 1 }}>
                  {a.title}
                </span>
                <Button size="sm" onClick={() => navigate('/runs')}>
                  Review
                </Button>
              </div>
            ))}
          </div>
        </Banner>
      ) : null}

      <div className="grid-4">
        <Stat
          label="Projects"
          value={health?.projects ?? projects.length}
          hint={project ? `${project.indexStats.filesIndexed} files indexed` : 'No project yet'}
          icon={<IconFolders size={13} />}
        />
        <Stat
          label="Symbols indexed"
          value={project ? project.indexStats.symbols.toLocaleString() : 0}
          hint={project ? `${project.indexStats.edges} import edges` : 'Add a project to start'}
          icon={<IconChecklist size={13} />}
        />
        <Stat label="Agents" value={agents.length} hint={agents.length ? 'Configured for this project' : 'Create one in Agents'} icon={<IconRobot size={13} />} />
        <Stat label="Runs" value={runs.length} hint={recentRuns[0] ? `Last ${timeAgo(recentRuns[0].createdAt)}` : 'No runs yet'} icon={<IconActivity size={13} />} />
        <Stat
          label="Trace events"
          value={(health?.traceEvents ?? 0).toLocaleString()}
          hint="Persisted locally in SQLite"
          icon={<IconChartHistogram size={13} />}
        />
        <Stat
          label="MCP servers"
          value={health?.mcpServers ?? 0}
          hint={health?.mcpServers ? 'Registered in OpenBridge' : 'None registered'}
          icon={<IconPlugConnected size={13} />}
        />
      </div>

      <div className="split-wide">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Recent runs</span>
            <span className="spacer" />
            <Button size="sm" variant="ghost" onClick={() => navigate('/runs')} icon={<IconArrowRight size={13} />}>
              All runs
            </Button>
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState
              icon={<IconActivity size={20} />}
              title="No runs yet"
              text="Create a run to send an engineering task through your agent pipeline. Every task, tool call and approval is recorded in TraceX."
              action={
                <Button variant="primary" size="sm" onClick={() => setShowWizard(true)} disabled={!project || !agents.length}>
                  Create a run
                </Button>
              }
            />
          ) : (
            <div className="list">
              {recentRuns.map((r) => (
                <button key={r.id} className="list-item" onClick={() => navigate(`/runs?run=${r.id}`)}>
                  <RunStatus run={r} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>
                      {r.labels.length ? r.labels.join(' · ') : `${r.kind} run`}
                    </div>
                    <div className="mono dim" style={{ fontSize: 10.5 }}>
                      {r.id} · {timeAgo(r.createdAt)}
                    </div>
                  </div>
                  <span className="mono dim" style={{ fontSize: 11 }}>
                    {r.stats.tasksCompleted}/{r.stats.tasksCompleted + r.stats.tasksFailed} tasks
                  </span>
                  {r.mode === 'demo' ? <Tag tone="warn">demo</Tag> : <Tag tone="ok">live</Tag>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Capability status</span>
            </div>
            <div className="panel-body stack-2">
              <CapRow
                label="Project index"
                ok={!!project && project.indexState === 'ready'}
                text={
                  !project
                    ? 'No project registered'
                    : project.indexState === 'indexing'
                      ? 'Indexing in progress'
                      : project.indexState === 'error'
                        ? 'Last index failed'
                        : `${project.indexStats.filesIndexed} files, ${project.indexStats.symbols} symbols`
                }
                onClick={() => navigate('/projects')}
              />
              <CapRow
                label="AI provider"
                ok={liveProviders.length > 0}
                text={liveProviders.length ? liveProviders.map((p) => `${p.kind}${p.defaultModel ? `:${p.defaultModel}` : ''}`).join(', ') : 'Demo provider only'}
                onClick={() => navigate('/settings')}
              />
              <CapRow
                label="Agents"
                ok={agents.length > 0}
                text={agents.length ? `${agents.length} configured` : 'None configured'}
                onClick={() => navigate('/agents')}
              />
              <CapRow
                label="OpenBridge MCP"
                ok={(health?.mcpServers ?? 0) > 0}
                text={health?.mcpServers ? `${health.mcpServers} server(s) registered` : 'No external servers'}
                onClick={() => navigate('/integrations')}
              />
              <CapRow
                label="Language adapters"
                ok={(health?.languages ?? []).some((l) => l.available)}
                text={
                  (health?.languages ?? [])
                    .map((l) => `${l.displayName}${l.available ? '' : ' (interpreter missing)'}`)
                    .join(' · ') || 'Probing'
                }
                onClick={() => navigate('/projects')}
              />
              <CapRow
                label="EchoShell"
                ok={moduleEnabled('echoshell')}
                text={moduleEnabled('echoshell') ? 'Enabled - approval gated' : 'Disabled (optional module)'}
                onClick={() => navigate('/modules')}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Workflow</span>
            </div>
            <div className="pipeline-strip" style={{ border: 'none', borderRadius: 0 }}>
              <WorkflowStep index="01" label="Add project" state={project ? 'done' : 'next'} onClick={() => setShowAdd(true)} />
              <WorkflowStep index="02" label="Index & inspect" state={project?.indexState === 'ready' ? 'done' : 'next'} onClick={() => navigate('/projects')} />
              <WorkflowStep index="03" label="Configure agents" state={agents.length ? 'done' : 'next'} onClick={() => navigate('/agents')} />
              <WorkflowStep index="04" label="Run & review" state={runs.length ? 'done' : 'next'} onClick={() => navigate('/runs')} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Privacy</span>
              <span className="spacer" />
              <IconShieldCheck size={14} style={{ color: 'var(--ok)' }} />
            </div>
            <div className="panel-body" style={{ fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.6 }}>
              Telemetry is <strong>off</strong> and not implemented. The index, traces and credentials stay in a local
              SQLite database. Project context is only sent to a provider when you start a run against a live model -
              and TraceX logs exactly which provider and model received it.
            </div>
          </div>
        </div>
      </div>

      {showAdd ? (
        <AddProjectModal
          path={pathInput}
          busy={busy}
          canBrowse={canPickNative()}
          onChange={setPathInput}
          onBrowse={() => void chooseFolder()}
          onCancel={() => setShowAdd(false)}
          onConfirm={() => void addProject()}
        />
      ) : null}

      {showWizard ? <RunWizard onClose={() => { setShowWizard(false); void refreshRuns(); void load(); }} /> : null}
    </div>
  );
}

function RunStatus({ run }: { run: Run }) {
  const tone =
    run.status === 'completed' ? 'ok' : run.status === 'failed' ? 'err' : run.status === 'running' ? 'live' : run.status === 'canceled' ? 'warn' : 'idle';
  return (
    <span className="run-row-status" style={{ minWidth: 92 }}>
      <Dot tone={tone as 'ok' | 'err' | 'live' | 'warn' | 'idle'} />
      <span className="muted" style={{ fontSize: 11.5 }}>
        {run.status}
      </span>
    </span>
  );
}

function CapRow({ label, ok, text, onClick }: { label: string; ok: boolean; text: string; onClick: () => void }) {
  return (
    <button className="list-item list-item-static" style={{ padding: '4px 0', cursor: 'pointer', gap: 8 }} onClick={onClick}>
      {ok ? <IconCircleCheck size={14} style={{ color: 'var(--ok)', flex: 'none' }} /> : <IconAlertTriangle size={14} style={{ color: 'var(--warn)', flex: 'none' }} />}
      <span style={{ fontSize: 12.5, fontWeight: 500, minWidth: 108 }}>{label}</span>
      <span className="truncate muted" style={{ fontSize: 11.5, flex: 1, textAlign: 'right' }}>
        {text}
      </span>
    </button>
  );
}

function WorkflowStep({ index, label, state, onClick }: { index: string; label: string; state: 'done' | 'next'; onClick: () => void }) {
  return (
    <button className="pipeline-step" onClick={onClick}>
      <span className="pipeline-step-num">{index}</span>
      <span className="pipeline-step-label">{label}</span>
      <span className="pipeline-step-state">{state === 'done' ? 'Ready' : 'Action needed'}</span>
    </button>
  );
}

function AddProjectModal({
  path,
  busy,
  canBrowse,
  onChange,
  onBrowse,
  onCancel,
  onConfirm,
}: {
  path: string;
  busy: boolean;
  canBrowse: boolean;
  onChange: (v: string) => void;
  onBrowse: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add project">
        <div className="modal-head">
          <span className="modal-title">Add a local project</span>
        </div>
        <div className="modal-body">
          <p className="page-sub">
            ARQENIUM reads the folder directly on this machine. It respects your ignore rules, skips dependency
            directories and build output, and never indexes files matching sensitive patterns such as{' '}
            <span className="mono">.env</span> or private keys.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="project-path">
              Absolute folder path
            </label>
            <div className="row">
              <input
                id="project-path"
                className="input mono-input"
                value={path}
                onChange={(e) => onChange(e.target.value)}
                placeholder="/home/you/code/my-project"
                onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
                spellCheck={false}
              />
              {canBrowse ? (
                <Button onClick={onBrowse} icon={<IconFolders size={14} />}>
                  Browse
                </Button>
              ) : null}
            </div>
            {!canBrowse ? (
              <span className="field-hint">
                Native folder pickers are only available in the desktop build. Paste the absolute path here instead.
              </span>
            ) : null}
          </div>
          {busy ? <Loading label="Scanning the folder and starting the index" /> : null}
        </div>
        <div className="modal-foot">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={busy} disabled={!path.trim()} icon={<IconPlus size={14} />}>
            Add and index
          </Button>
        </div>
      </div>
    </div>
  );
}

