import { useMemo, useState } from 'react';
import { IconChevronDown, IconPlus, IconTrash, IconBolt } from '@tabler/icons-react';
import { useApp } from '../../lib/store';
import { request } from '../../lib/bridge';
import { Banner, Button, Checkbox, Field, Modal, Select, Tag, TextArea, TextInput } from '../../components/ui';
import type { Agent, Run } from '../../lib/types';

interface TaskDraft {
  key: number;
  title: string;
  description: string;
  pipeline: string[];
  dependsOn: number[];
  input: string;
  priority: number;
  maxAttempts: number;
}

let counter = 1;

/**
 * Run composer: builds an ordered agent pipeline per task with explicit
 * dependency indices, then hands the graph to the orchestrator.
 */
export function RunWizard({ onClose }: { onClose: () => void }) {
  const { agents, currentProjectId, providers, toast } = useApp();
  const liveModels = useMemo(() => agents.filter((a) => !!a.modelRef), [agents]);
  const [mode, setMode] = useState<'live' | 'demo'>(liveModels.length ? 'live' : 'demo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxToolCalls, setMaxToolCalls] = useState(60);
  const [maxDurationMin, setMaxDurationMin] = useState(10);
  const [tasks, setTasks] = useState<TaskDraft[]>([
    {
      key: counter++,
      title: 'Analyse the project and summarise its architecture',
      description: 'Inspect the indexed project and describe its structure, entry points and main modules.',
      pipeline: agents.slice(0, 1).map((a) => a.id),
      dependsOn: [],
      input: '',
      priority: 50,
      maxAttempts: 1,
    },
  ]);

  const projectAgents = agents;
  const demoAvailable = providers.some((p) => p.kind === 'demo');
  const hasLiveProvider = providers.some((p) => p.enabled && p.kind !== 'demo');

  function patchTask(key: number, patch: Partial<TaskDraft>) {
    setTasks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  function addTask() {
    setTasks((prev) => [
      ...prev,
      {
        key: counter++,
        title: '',
        description: '',
        pipeline: agents.slice(0, 1).map((a) => a.id),
        dependsOn: prev.length ? [prev.length - 1] : [],
        input: '',
        priority: 40,
        maxAttempts: 1,
      },
    ]);
  }

  function removeTask(key: number) {
    setTasks((prev) => prev.filter((t) => t.key !== key));
  }

  const invalid = useMemo(() => {
    if (!currentProjectId) return 'No project selected.';
    if (!tasks.length) return 'Add at least one task.';
    for (const [i, t] of tasks.entries()) {
      if (!t.title.trim()) return `Task ${i + 1} needs a title.`;
      if (!t.pipeline.length) return `Task ${i + 1} needs at least one agent.`;
      if (t.dependsOn.some((d) => d >= i)) return `Task ${i + 1} cannot depend on itself or a later task.`;
    }
    if (mode === 'live' && !liveModels.length) return 'No agent has a live model configured. Choose demo mode or set an agent model.';
    return null;
  }, [currentProjectId, tasks, mode, liveModels]);

  async function submit() {
    if (invalid || !currentProjectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = (await request('runs.create', {
        projectId: currentProjectId,
        mode,
        labels: tasks.map((t) => t.title.slice(0, 40)).slice(0, 3),
        budget: {
          maxDurationMs: maxDurationMin * 60_000,
          maxToolCalls,
          maxTokens: 400_000,
          maxTasks: 100,
        },
        tasks: tasks.map((t) => ({
          title: t.title,
          description: t.description,
          pipeline: t.pipeline,
          dependsOn: t.dependsOn,
          input: t.input,
          priority: t.priority,
          maxAttempts: t.maxAttempts,
        })),
      })) as { run: Run };
      toast('ok', 'Run started', `Run ${res.run.id} is executing in ${res.run.mode} mode.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const agentName = (id: string) => agents.find((a: Agent) => a.id === id)?.name ?? id;

  return (
    <Modal
      title="New engineering run"
      onClose={onClose}
      wide
      footer={
        <>
          {invalid ? <span className="muted" style={{ fontSize: 12, marginRight: 'auto' }}>{invalid}</span> : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={!!invalid} icon={<IconBolt size={14} />}>
            Start run
          </Button>
        </>
      }
    >
      {error ? <Banner tone="err" title="Run could not be created">{error}</Banner> : null}

      {!projectAgents.length ? (
        <Banner tone="warn" title="No agents configured">
          Create at least one agent in the Agents page first. Agents define the role, prompt, tools and permissions used
          for each task.
        </Banner>
      ) : null}

      <div className="grid-2">
        <Field label="Execution mode" hint="Live mode calls a configured provider. Demo mode uses the deterministic local demo adapter and is labelled as such.">
          <Select
            value={mode}
            onChange={setMode}
            options={[
              { value: 'live', label: `Live ${liveModels.length ? '' : '(no agent model configured)'}` },
              { value: 'demo', label: 'Demo (sample data, no network)' },
            ]}
          />
        </Field>
        <Field label="Tool-call budget" hint={`Maximum tool calls for the whole run. Demo provider only emits one tool call per stage.`}>
          <TextInput value={String(maxToolCalls)} onChange={(v) => setMaxToolCalls(Math.max(0, Math.min(1000, Number(v) || 0)))} />
        </Field>
        <Field label="Time budget (minutes)" hint="The run is cancelled when this wall-clock limit is exceeded.">
          <TextInput value={String(maxDurationMin)} onChange={(v) => setMaxDurationMin(Math.max(1, Math.min(60, Number(v) || 1)))} />
        </Field>
        <Field label="Providers available">
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {providers.map((p) => (
              <Tag key={p.id} tone={p.kind === 'demo' ? 'warn' : p.enabled ? 'ok' : 'neutral'}>
                {p.kind}
                {p.defaultModel ? `:${p.defaultModel}` : ''}
              </Tag>
            ))}
            {!demoAvailable ? <Tag tone="err">demo provider missing</Tag> : null}
            {!hasLiveProvider ? <span className="muted" style={{ fontSize: 11.5 }}>Live providers appear once you add one in Settings.</span> : null}
          </div>
        </Field>
      </div>

      <div className="stack">
        <div className="row">
          <span className="section-label" style={{ paddingBottom: 0 }}>
            Tasks ({tasks.length})
          </span>
          <span className="spacer" />
          <Button size="sm" onClick={addTask} icon={<IconPlus size={13} />} disabled={!agents.length}>
            Add task
          </Button>
        </div>

        {tasks.map((t, idx) => (
          <div key={t.key} className="task-card">
            <div className="task-card-head">
              <span className="mono dim" style={{ fontSize: 11 }}>
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>Task {idx + 1}</span>
              <span className="spacer" />
              {tasks.length > 1 ? (
                <Button size="sm" variant="ghost" onClick={() => removeTask(t.key)} icon={<IconTrash size={13} />} title="Remove task">
                  Remove
                </Button>
              ) : null}
            </div>
            <Field label="Title">
              <TextInput value={t.title} onChange={(v) => patchTask(t.key, { title: v })} placeholder="What must this task accomplish?" />
            </Field>
            <Field label="Description / verification criteria" hint="Passed to the agent as part of the task brief.">
              <TextArea value={t.description} onChange={(v) => patchTask(t.key, { description: v })} rows={2} />
            </Field>

            <div className="grid-2">
              <Field label="Agent pipeline (ordered)" hint="Each agent receives the previous agent's output. Click to add, drag not required - order is the click order.">
                <div className="stack-2">
                  {t.pipeline.length ? (
                    <div className="task-pipeline">
                      {t.pipeline.map((id, i) => (
                        <span key={`${id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {i > 0 ? <span className="pipeline-arrow">&#8594;</span> : null}
                          <Tag tone="accent">{agentName(id)}</Tag>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="field-hint">No agent selected.</span>
                  )}
                  <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                    {agents.map((a: Agent) => {
                      const inPipeline = t.pipeline.includes(a.id);
                      return (
                        <Button
                          key={a.id}
                          size="sm"
                          variant={inPipeline ? 'default' : 'ghost'}
                          title={inPipeline ? `Remove ${a.name} from the pipeline` : `Append ${a.name} to the pipeline`}
                          onClick={() =>
                            patchTask(t.key, {
                              pipeline: inPipeline ? t.pipeline.filter((x) => x !== a.id) : [...t.pipeline, a.id],
                            })
                          }
                        >
                          {a.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </Field>

              <div className="stack-2">
                <Field label="Depends on" hint="A task only starts after all selected tasks complete successfully.">
                  <div className="stack-2">
                    {idx === 0 ? (
                      <span className="field-hint">The first task has no upstream dependency.</span>
                    ) : (
                      tasks.slice(0, idx).map((dep, di) => (
                        <Checkbox
                          key={dep.key}
                          checked={t.dependsOn.includes(di)}
                          onChange={(checked) =>
                            patchTask(t.key, {
                              dependsOn: checked ? [...t.dependsOn, di] : t.dependsOn.filter((d) => d !== di),
                            })
                          }
                          label={`Task ${di + 1}: ${dep.title || '(untitled)'}`}
                        />
                      ))
                    )}
                  </div>
                </Field>
                <div className="row" style={{ gap: 8 }}>
                  <Field label="Priority">
                    <TextInput value={String(t.priority)} onChange={(v) => patchTask(t.key, { priority: Math.max(0, Math.min(100, Number(v) || 0)) })} />
                  </Field>
                  <Field label="Max attempts">
                    <TextInput
                      value={String(t.maxAttempts)}
                      onChange={(v) => patchTask(t.key, { maxAttempts: Math.max(1, Math.min(5, Number(v) || 1)) })}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <Field label="Task input (data passed to the agent)" hint="Optional extra material. Treated as untrusted data, never as instructions.">
              <TextArea value={t.input} onChange={(v) => patchTask(t.key, { input: v })} rows={2} mono />
            </Field>
          </div>
        ))}
      </div>

      <Banner tone="info">
        Sensitive tool calls (file writes and commands) pause the run and appear as pending approvals. Nothing is
        written or executed until you approve it. Every step is recorded in TraceX with a correlation id.
      </Banner>
      <div className="row" style={{ gap: 6 }}>
        <IconChevronDown size={13} style={{ color: 'var(--fg-4)' }} />
        <span className="muted" style={{ fontSize: 11.5 }}>
          Concurrency and approval timeouts are configurable in Settings.
        </span>
      </div>
    </Modal>
  );
}
