import { useEffect, useMemo, useState } from 'react';
import {
  IconCode,
  IconFileText,
  IconFlask,
  IconPencil,
  IconPlus,
  IconRobot,
  IconRulerMeasure,
  IconSparkles,
  IconTrash,
  IconUserCheck,
} from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { request } from '../lib/bridge';
import { Banner, Button, Checkbox, EmptyState, Field, Loading, Modal, Select, Tag, TextArea, TextInput } from '../components/ui';
import type { Agent, AgentRole } from '../lib/types';
import { AGENT_ROLES } from '../../shared/types';
import { ROLE_TEMPLATES } from '../../shared/catalog';

const ROLE_ICONS: Record<string, React.ReactNode> = {
  planner: <IconRulerMeasure size={15} />,
  architect: <IconSparkles size={15} />,
  implementer: <IconCode size={15} />,
  reviewer: <IconUserCheck size={15} />,
  tester: <IconFlask size={15} />,
  documentation: <IconFileText size={15} />,
  custom: <IconRobot size={15} />,
};

export const AVAILABLE_TOOLS: Array<{ name: string; description: string; sensitive: boolean }> = [
  { name: 'project_structure', description: 'List the indexed file tree', sensitive: false },
  { name: 'search_symbols', description: 'Search parsed symbols', sensitive: false },
  { name: 'search_files', description: 'Search file paths', sensitive: false },
  { name: 'read_file', description: 'Read a project file (sensitive paths blocked)', sensitive: false },
  { name: 'project_summary', description: 'Deterministic file or project summary', sensitive: false },
  { name: 'dependency_graph', description: 'Import graph for a file or the project', sensitive: false },
  { name: 'impact_analysis', description: 'Reverse dependency impact analysis', sensitive: false },
  { name: 'write_file', description: 'Write a file inside the project (always requires approval)', sensitive: true },
  { name: 'run_command', description: 'Run a command via EchoShell (requires approval + module)', sensitive: true },
];

export function Agents() {
  const { agents, currentProjectId, refreshAgents, providers, toast, moduleEnabled } = useApp();
  const [editing, setEditing] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentProjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refreshAgents().finally(() => setLoading(false));
  }, [currentProjectId, refreshAgents]);

  const modelOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [{ value: '', label: 'Demo provider (no model)' }];
    for (const p of providers) {
      if (!p.enabled) continue;
      if (p.kind === 'demo') continue;
      opts.push({ value: `${p.id}:${p.defaultModel ?? ''}`, label: `${p.name}${p.defaultModel ? ` · ${p.defaultModel}` : ' · (set default model)'}` });
    }
    return opts;
  }, [providers]);

  async function remove(a: Agent) {
    if (!confirm(`Delete agent "${a.name}"? Runs that reference it will keep their recorded history.`)) return;
    try {
      await request('agents.delete', { id: a.id });
      await refreshAgents();
      toast('info', 'Agent deleted');
    } catch (err) {
      toast('err', 'Delete failed', err instanceof Error ? err.message : String(err));
    }
  }

  if (!moduleEnabled('agent-control')) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Agents</h1>
          </div>
        </div>
        <Banner tone="warn" title="Module disabled">
          The Agent Control Plane is disabled. Enable it in Modules.
        </Banner>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Agents</h1>
          <p className="page-sub">
            Each agent is an explicit configuration: role, instructions, tool grants, permissions and execution limits.
            An agent can only call tools it has been granted, and sensitive tools always pause for your approval.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={!currentProjectId} icon={<IconPlus size={14} />}>
          New agent
        </Button>
      </div>

      {!currentProjectId ? (
        <Banner tone="info" title="Select a project first">
          Agents are scoped to a project so their tools operate on the right repository.
        </Banner>
      ) : null}

      {loading ? (
        <Loading label="Loading agents" />
      ) : agents.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<IconRobot size={20} />}
            title="No agents configured"
            text="Start from a role template - Planner, Architect, Implementer, Reviewer, Tester or Documentation - then adjust its tools, permissions and limits."
            action={
              <Button variant="primary" size="sm" onClick={() => setCreating(true)} disabled={!currentProjectId}>
                Create the first agent
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid-3">
          {agents.map((a) => (
            <div key={a.id} className="agent-card">
              <div className="row">
                <div className="module-icon" style={{ width: 28, height: 28 }}>
                  {ROLE_ICONS[a.role] ?? <IconRobot size={15} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }} className="truncate">
                    {a.name}
                  </div>
                  <div className="role-chip">{a.role}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(a)} icon={<IconPencil size={13} />} title="Edit agent" />
                <Button size="sm" variant="ghost" onClick={() => void remove(a)} icon={<IconTrash size={13} />} title="Delete agent" />
              </div>
              <p className="module-desc" style={{ minHeight: 34 }}>
                {a.description || 'No description provided.'}
              </p>
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>
                  Tools
                </div>
                <div className="tool-list">
                  {a.tools.length ? a.tools.map((t) => <span key={t} className="tool-chip">{t}</span>) : <span className="dim">none granted</span>}
                </div>
              </div>
              <div className="module-meta">
                <span>{a.modelRef ? 'live model' : 'demo mode'}</span>
                <span>iter {a.maxIterations}</span>
                <span>{(a.timeoutMs / 1000).toFixed(0)}s timeout</span>
                <span>{a.maxRetries} retries</span>
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                {a.permissions.canReadFiles ? <Tag tone="ok">read</Tag> : null}
                {a.permissions.canWriteFiles ? <Tag tone="warn">write</Tag> : null}
                {a.permissions.canRunCommands ? <Tag tone="err">commands</Tag> : null}
                {a.permissions.autoApprove.length ? <Tag tone="warn">auto: {a.permissions.autoApprove.join(', ')}</Tag> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && currentProjectId ? (
        <AgentEditor
          projectId={currentProjectId}
          modelOptions={modelOptions}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await refreshAgents();
            toast('ok', 'Agent created');
          }}
          onError={(m) => toast('err', 'Could not save the agent', m)}
        />
      ) : null}

      {editing ? (
        <AgentEditor
          projectId={currentProjectId ?? ''}
          existing={editing}
          modelOptions={modelOptions}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refreshAgents();
            toast('ok', 'Agent updated');
          }}
          onError={(m) => toast('err', 'Could not save the agent', m)}
        />
      ) : null}
    </div>
  );
}

function AgentEditor({
  projectId,
  existing,
  modelOptions,
  onClose,
  onSaved,
  onError,
}: {
  projectId: string;
  existing?: Agent;
  modelOptions: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [role, setRole] = useState<AgentRole>(existing?.role ?? 'planner');
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt ?? '');
  const [modelRef, setModelRef] = useState(existing?.modelRef ?? '');
  const [tools, setTools] = useState<string[]>(existing?.tools ?? ROLE_TEMPLATES.find((t) => t.role === 'planner')?.tools ?? []);
  const [canRead, setCanRead] = useState(existing?.permissions.canReadFiles ?? true);
  const [canWrite, setCanWrite] = useState(existing?.permissions.canWriteFiles ?? false);
  const [canRun, setCanRun] = useState(existing?.permissions.canRunCommands ?? false);
  const [autoApprove, setAutoApprove] = useState<string[]>(existing?.permissions.autoApprove ?? []);
  const [maxIterations, setMaxIterations] = useState(existing?.maxIterations ?? 8);
  const [timeoutMs, setTimeoutMs] = useState(existing?.timeoutMs ?? 120_000);
  const [maxRetries, setMaxRetries] = useState(existing?.maxRetries ?? 1);
  const [busy, setBusy] = useState(false);

  const template = ROLE_TEMPLATES.find((t) => t.role === role);

  function applyTemplate(r: AgentRole) {
    setRole(r);
    const t = ROLE_TEMPLATES.find((x) => x.role === r);
    if (!t) return;
    if (!existing) {
      setName(t.name);
      setDescription(t.description);
      setSystemPrompt(t.systemPrompt);
      setTools(t.tools);
      setCanWrite(r === 'implementer');
      setCanRun(r === 'tester');
    }
  }

  async function save() {
    setBusy(true);
    const payload = {
      name: name.trim(),
      role,
      description,
      systemPrompt,
      modelRef: modelRef || null,
      tools,
      permissions: { canReadFiles: canRead, canWriteFiles: canWrite, canRunCommands: canRun, autoApprove },
      maxIterations,
      timeoutMs,
      maxRetries,
    };
    try {
      if (existing) {
        await request('agents.update', { id: existing.id, patch: payload });
      } else {
        await request('agents.create', { projectId, ...payload });
      }
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const valid = name.trim().length > 0 && tools.length > 0;

  return (
    <Modal
      title={existing ? `Edit agent · ${existing.name}` : 'New agent'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!valid}>
            {existing ? 'Save changes' : 'Create agent'}
          </Button>
        </>
      }
    >
      <Field label="Role template" hint="Selecting a role prefills the name, instructions and tool grants. Everything stays editable.">
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
          {AGENT_ROLES.map((r) => (
            <Button key={r} size="sm" variant={role === r ? 'primary' : 'default'} onClick={() => applyTemplate(r)}>
              {r}
            </Button>
          ))}
        </div>
      </Field>

      {template ? <Banner tone="info">{template.description}</Banner> : null}

      <div className="grid-2">
        <Field label="Agent name">
          <TextInput value={name} onChange={setName} placeholder="e.g. Repository Planner" />
        </Field>
        <Field label="Model" hint="Agents without a live model force their runs into labelled demo mode.">
          <Select value={modelRef} onChange={setModelRef} options={modelOptions} />
        </Field>
      </div>

      <Field label="Description">
        <TextInput value={description} onChange={setDescription} placeholder="What is this agent responsible for?" />
      </Field>

      <Field label="System instructions" hint="These are trusted operational instructions. Retrieved project content is always passed as data, never as instructions.">
        <TextArea value={systemPrompt} onChange={setSystemPrompt} rows={5} mono />
      </Field>

      <div>
        <div className="section-label">Tool grants</div>
        <div className="stack-2">
          {AVAILABLE_TOOLS.map((t) => (
            <div key={t.name} className="row" style={{ gap: 8 }}>
              <Checkbox
                checked={tools.includes(t.name)}
                onChange={(c) => setTools(c ? [...tools, t.name] : tools.filter((x) => x !== t.name))}
                label={
                  <span>
                    <span className="mono" style={{ fontSize: 12 }}>
                      {t.name}
                    </span>{' '}
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {t.description}
                    </span>
                  </span>
                }
              />
              {t.sensitive ? <Tag tone="warn">approval</Tag> : null}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="section-label">Permissions</div>
        <div className="stack-2">
          <Checkbox checked={canRead} onChange={setCanRead} label="Read project files (sensitive paths remain blocked)" />
          <Checkbox checked={canWrite} onChange={setCanWrite} label="Write project files (each write still needs approval unless auto-approved below)" />
          <Checkbox checked={canRun} onChange={setCanRun} label="Run commands through EchoShell (requires the module to be enabled)" />
        </div>
      </div>

      <div>
        <div className="section-label">Auto-approved tools</div>
        <p className="field-hint" style={{ marginBottom: 6 }}>
          Leave empty for the safest behaviour. Auto-approving a write or command tool removes the human gate for this
          agent - only do this for trusted, narrow workflows.
        </p>
        <div className="stack-2">
          {tools.filter((t) => AVAILABLE_TOOLS.find((x) => x.name === t)?.sensitive).map((t) => (
            <Checkbox
              key={t}
              checked={autoApprove.includes(t)}
              onChange={(c) => setAutoApprove(c ? [...autoApprove, t] : autoApprove.filter((x) => x !== t))}
              label={<span className="mono">{t}</span>}
            />
          ))}
          {!tools.some((t) => AVAILABLE_TOOLS.find((x) => x.name === t)?.sensitive) ? (
            <span className="field-hint">No sensitive tools are granted, so there is nothing to auto-approve.</span>
          ) : null}
        </div>
      </div>

      <div className="grid-3">
        <Field label="Max iterations" hint="Tool loop limit per stage.">
          <TextInput value={String(maxIterations)} onChange={(v) => setMaxIterations(Math.max(1, Math.min(50, Number(v) || 8)))} />
        </Field>
        <Field label="Stage timeout (seconds)">
          <TextInput value={String(Math.round(timeoutMs / 1000))} onChange={(v) => setTimeoutMs(Math.max(5, Math.min(1800, Number(v) || 120)) * 1000)} />
        </Field>
        <Field label="Retries" hint="Task attempts after a provider failure.">
          <TextInput value={String(maxRetries)} onChange={(v) => setMaxRetries(Math.max(0, Math.min(5, Number(v) || 0)))} />
        </Field>
      </div>
    </Modal>
  );
}
