import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconActivity,
  IconBan,
  IconBolt,
  IconCheck,
  IconClock,
  IconRefresh,
  IconShieldCheck,
  IconTerminal2,
  IconX,
} from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { request } from '../lib/bridge';
import {
  Banner,
  Button,
  Dot,
  EmptyState,
  Loading,
  Tag,
  formatDateTime,
  formatDuration,
  timeAgo,
} from '../components/ui';
import type { Approval, Run, Task, ToolCallRecord } from '../lib/types';
import { RunWizard } from './runs/RunWizard';

interface RunEvent {
  id: string;
  ts: string;
  type: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data: unknown;
  taskId: string | null;
  agentId: string | null;
  correlationId: string | null;
  durationMs: number | null;
}

export function Runs() {
  const { runs, agents, currentProjectId, refreshRuns, toast } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ run: Run; tasks: Task[] } | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [tab, setTab] = useState<'timeline' | 'tasks' | 'tools' | 'approvals'>('timeline');
  const [params] = useSearchParams();

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns, currentProjectId]);

  const queryRun = params.get('run');
  useEffect(() => {
    if (queryRun) setSelected(queryRun);
  }, [queryRun]);

  const loadDetail = useCallback(
    async (runId: string) => {
      setLoading(true);
      try {
        const [d, e, tc, ap] = await Promise.all([
          request('runs.get', { runId }) as Promise<{ run: Run; tasks: Task[] }>,
          request('runs.events', { runId, limit: 2000 }) as Promise<RunEvent[]>,
          request('trace.toolCalls', { runId, limit: 300 }) as Promise<ToolCallRecord[]>,
          request('approvals.list', { runId, limit: 200 }) as Promise<Approval[]>,
        ]);
        setDetail(d);
        setEvents(e);
        setToolCalls(tc);
        setApprovals(ap);
      } catch (err) {
        toast('err', 'Could not load the run', err instanceof Error ? err.message : String(err));
        setDetail(null);
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    void loadDetail(selected);
  }, [selected, loadDetail]);

  // Live updates: re-fetch when an event for the selected run arrives.
  const eventState = useApp((s) => s.events);
  useEffect(() => {
    if (!selected) return;
    const latest = eventState[0];
    if (!latest) return;
    if (latest.runId === selected) {
      const t = setTimeout(() => void loadDetail(selected), 350);
      void refreshRuns();
      return () => clearTimeout(t);
    }
  }, [eventState, selected, loadDetail, refreshRuns]);

  const pending = useMemo(() => approvals.filter((a) => a.status === 'pending'), [approvals]);
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id.slice(0, 12);

  async function decide(id: string, approved: boolean) {
    try {
      await request('approvals.decide', { id, approved, decidedBy: 'user', reason: approved ? 'approved in Runs console' : 'denied in Runs console' });
      toast(approved ? 'ok' : 'info', approved ? 'Approved' : 'Denied', approved ? 'The operation will continue.' : 'The agent was told the action was denied.');
      if (selected) await loadDetail(selected);
    } catch (err) {
      toast('err', 'Decision failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function cancel(runId: string) {
    try {
      await request('runs.cancel', { runId });
      toast('info', 'Cancellation requested', 'Running tasks are being stopped.');
      await refreshRuns();
      if (selected === runId) await loadDetail(runId);
    } catch (err) {
      toast('err', 'Cancel failed', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Runs</h1>
          <p className="page-sub">
            Every orchestration run with its task graph, agent pipeline, tool calls and approvals. Records here come
            from actual execution - a task is only marked complete after its agent returned a validated result.
          </p>
        </div>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => void refreshRuns()} icon={<IconRefresh size={13} />}>
            Refresh
          </Button>
          <Button variant="primary" onClick={() => setShowWizard(true)} disabled={!currentProjectId || !agents.length} icon={<IconBolt size={14} />}>
            New run
          </Button>
        </div>
      </div>

      {!agents.length ? (
        <Banner tone="info" title="No agents yet">
          Runs need at least one agent. Create an agent with a role, tools and permissions first - the run composer will
          then let you build a multi-agent pipeline per task.
        </Banner>
      ) : null}

      <div className="split">
        <div className="panel" style={{ maxHeight: 'calc(100vh - 240px)', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-head">
            <span className="panel-title">Run history</span>
            <span className="spacer" />
            <span className="mono dim" style={{ fontSize: 11 }}>
              {runs.length}
            </span>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {runs.length === 0 ? (
              <EmptyState icon={<IconActivity size={20} />} title="No runs recorded" text="Start a run to see the full execution timeline here." />
            ) : (
              <div className="list">
                {runs.map((r) => (
                  <button key={r.id} className={`list-item ${selected === r.id ? 'selected' : ''}`} onClick={() => setSelected(r.id)}>
                    <Dot
                      tone={
                        r.status === 'completed' ? 'ok' : r.status === 'failed' ? 'err' : r.status === 'running' ? 'live' : r.status === 'canceled' ? 'warn' : 'idle'
                      }
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>
                        {r.labels.length ? r.labels[0] : `${r.kind} run`}
                      </div>
                      <div className="mono dim truncate" style={{ fontSize: 10.5 }}>
                        {r.status} · {timeAgo(r.createdAt)}
                      </div>
                    </div>
                    {r.mode === 'demo' ? <Tag tone="warn">demo</Tag> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          {!selected ? (
            <div className="panel">
              <EmptyState
                icon={<IconActivity size={20} />}
                title="Select a run"
                text="Choose a run on the left to inspect its task graph, live event timeline, tool calls and approvals."
              />
            </div>
          ) : loading && !detail ? (
            <div className="panel">
              <Loading label="Loading run detail" />
            </div>
          ) : detail ? (
            <>
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title mono" style={{ fontSize: 12 }}>
                    {detail.run.id}
                  </span>
                  <Tag
                    tone={
                      detail.run.status === 'completed'
                        ? 'ok'
                        : detail.run.status === 'failed'
                          ? 'err'
                          : detail.run.status === 'running'
                            ? 'info'
                            : 'warn'
                    }
                  >
                    {detail.run.status}
                  </Tag>
                  {detail.run.mode === 'demo' ? <Tag tone="warn">demo mode</Tag> : <Tag tone="ok">live model</Tag>}
                  <span className="spacer" />
                  {detail.run.status === 'running' || detail.run.status === 'pending' ? (
                    <Button size="sm" variant="danger" onClick={() => void cancel(detail.run.id)} icon={<IconBan size={13} />}>
                      Cancel run
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => void loadDetail(detail.run.id)} icon={<IconRefresh size={13} />}>
                      Reload
                    </Button>
                  )}
                </div>
                <div className="panel-body">
                  <div className="grid-4">
                    <MiniStat label="Tasks" value={`${detail.run.stats.tasksCompleted}/${detail.tasks.length}`} sub="completed" />
                    <MiniStat label="Tool calls" value={detail.run.stats.toolCalls} sub={`limit ${detail.run.budget.maxToolCalls}`} />
                    <MiniStat
                      label="Tokens"
                      value={detail.run.stats.tokensIn + detail.run.stats.tokensOut || '-'}
                      sub={detail.run.stats.tokensIn + detail.run.stats.tokensOut ? `${detail.run.stats.tokensIn} in / ${detail.run.stats.tokensOut} out` : 'not reported'}
                    />
                    <MiniStat label="Provider calls" value={detail.run.stats.providerRequests} sub="recorded requests" />
                    <MiniStat
                      label="Duration"
                      value={
                        detail.run.startedAt
                          ? formatDuration(
                              (detail.run.finishedAt ? new Date(detail.run.finishedAt).getTime() : Date.now()) -
                                new Date(detail.run.startedAt).getTime(),
                            )
                          : '-'
                      }
                      sub={detail.run.startedAt ? formatDateTime(detail.run.startedAt) : 'not started'}
                    />
                  </div>
                  {detail.run.error ? (
                    <div style={{ marginTop: 12 }}>
                      <Banner tone="err" title="Run error">
                        {detail.run.error}
                      </Banner>
                    </div>
                  ) : null}
                  {detail.run.mode === 'demo' ? (
                    <div style={{ marginTop: 12 }}>
                      <Banner tone="warn" title="Demo mode">
                        This run used the local demo provider. Task outputs are deterministic sample text produced by
                        ARQENIUM's demo adapter - they are not the output of a real language model and no network
                        request was made.
                      </Banner>
                    </div>
                  ) : null}
                </div>
              </div>

              {pending.length > 0 ? (
                <div className="panel">
                  <div className="panel-head">
                    <IconShieldCheck size={15} style={{ color: 'var(--warn)' }} />
                    <span className="panel-title">Waiting for approval ({pending.length})</span>
                  </div>
                  <div className="stack" style={{ padding: 12 }}>
                    {pending.map((a) => (
                      <ApprovalCard key={a.id} approval={a} onDecide={decide} />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="panel">
                <div className="tabs">
                  <button className={`tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>
                    Timeline <span className="count">{events.length}</span>
                  </button>
                  <button className={`tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
                    Tasks <span className="count">{detail.tasks.length}</span>
                  </button>
                  <button className={`tab ${tab === 'tools' ? 'active' : ''}`} onClick={() => setTab('tools')}>
                    Tool calls <span className="count">{toolCalls.length}</span>
                  </button>
                  <button className={`tab ${tab === 'approvals' ? 'active' : ''}`} onClick={() => setTab('approvals')}>
                    Approvals <span className="count">{approvals.length}</span>
                  </button>
                </div>

                {tab === 'timeline' ? (
                  events.length === 0 ? (
                    <EmptyState icon={<IconClock size={20} />} title="No events yet" text="TraceX records an event for every task transition, tool call and provider request." />
                  ) : (
                    <div style={{ maxHeight: 460, overflow: 'auto', padding: '12px 16px' }}>
                      <div className="timeline">
                        {events
                          .slice()
                          .reverse()
                          .map((e) => (
                            <div key={e.id} className="timeline-item">
                              <span
                                className={`timeline-dot ${e.severity === 'error' ? 'err' : e.severity === 'warn' ? 'warn' : e.type.includes('completed') ? 'ok' : 'info'}`}
                              />
                              <div className="timeline-body">
                                <div className="timeline-msg">{e.message || e.type}</div>
                                <div className="timeline-meta">
                                  <span className="mono">{e.type}</span>
                                  <span>{new Date(e.ts).toLocaleTimeString([], { hour12: false })}</span>
                                  {e.durationMs != null ? <span>{formatDuration(e.durationMs)}</span> : null}
                                  {e.taskId ? <span className="mono">{e.taskId.slice(0, 12)}</span> : null}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )
                ) : null}

                {tab === 'tasks' ? (
                  <div className="stack" style={{ padding: 12 }}>
                    {detail.tasks.map((t, i) => (
                      <div key={t.id} className="task-card">
                        <div className="task-card-head">
                          <span className="mono dim">{String(i + 1).padStart(2, '0')}</span>
                          <span style={{ fontWeight: 600, fontSize: 12.5 }}>{t.title}</span>
                          <span className="spacer" />
                          <TaskStatusTag status={t.status} />
                          <span className="mono dim" style={{ fontSize: 10.5 }}>
                            {t.attempts}/{t.maxAttempts} attempts
                          </span>
                        </div>
                        <div className="task-pipeline">
                          {t.pipeline.map((id, pi) => (
                            <span key={`${id}-${pi}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {pi > 0 ? <span className="pipeline-arrow">&#8594;</span> : null}
                              <Tag tone="accent">{agentName(id)}</Tag>
                            </span>
                          ))}
                          {t.dependsOn.length ? (
                            <span className="dim" style={{ marginLeft: 8 }}>
                              after {t.dependsOn.length} task(s)
                            </span>
                          ) : null}
                        </div>
                        {t.error ? <div className="mono" style={{ color: 'var(--err)', fontSize: 11.5 }}>{t.error}</div> : null}
                        {t.output ? (
                          <details>
                            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--fg-3)' }}>
                              Output ({t.output.length} chars)
                            </summary>
                            <pre className="code-block" style={{ marginTop: 8, maxHeight: 320 }}>
                              {t.output}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {tab === 'tools' ? (
                  <div className="table-wrap">
                    {toolCalls.length === 0 ? (
                      <EmptyState icon={<IconTerminal2 size={20} />} title="No tool calls" text="This run did not invoke any tools." />
                    ) : (
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Tool</th>
                            <th>Source</th>
                            <th>Status</th>
                            <th>Duration</th>
                            <th>Started</th>
                          </tr>
                        </thead>
                        <tbody>
                          {toolCalls.map((tc) => (
                            <tr key={tc.id}>
                              <td className="mono">{tc.tool}</td>
                              <td>
                                <Tag>{tc.source}</Tag>
                              </td>
                              <td>
                                <Tag tone={tc.status === 'ok' ? 'ok' : tc.status === 'denied' ? 'warn' : tc.status === 'error' ? 'err' : 'neutral'}>{tc.status}</Tag>
                              </td>
                              <td className="mono dim">{formatDuration(tc.durationMs)}</td>
                              <td className="mono dim">{new Date(tc.startedAt).toLocaleTimeString([], { hour12: false })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : null}

                {tab === 'approvals' ? (
                  <div className="stack" style={{ padding: 12 }}>
                    {approvals.length === 0 ? (
                      <EmptyState
                        icon={<IconShieldCheck size={20} />}
                        title="No approvals for this run"
                        text="Approvals appear here whenever an agent requests a sensitive operation such as a file write or a command."
                      />
                    ) : (
                      approvals.map((a) => <ApprovalCard key={a.id} approval={a} onDecide={decide} />)
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {showWizard ? (
        <RunWizard
          onClose={() => {
            setShowWizard(false);
            void refreshRuns();
          }}
        />
      ) : null}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub ? (
        <div className="dim" style={{ fontSize: 11 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function TaskStatusTag({ status }: { status: Task['status'] }) {
  const tone =
    status === 'completed'
      ? 'ok'
      : status === 'failed' || status === 'timeout'
        ? 'err'
        : status === 'running'
          ? 'info'
          : status === 'blocked'
            ? 'warn'
            : 'neutral';
  return <Tag tone={tone as 'ok' | 'err' | 'info' | 'warn' | 'neutral'}>{status}</Tag>;
}

function ApprovalCard({ approval, onDecide }: { approval: Approval; onDecide: (id: string, approved: boolean) => void }) {
  const [showPayload, setShowPayload] = useState(false);
  const pending = approval.status === 'pending';
  return (
    <div className="task-card" style={{ borderColor: pending ? 'color-mix(in srgb, var(--warn) 40%, transparent)' : undefined }}>
      <div className="task-card-head">
        <Tag tone={approval.risk === 'high' ? 'err' : approval.risk === 'medium' ? 'warn' : 'neutral'}>{approval.risk} risk</Tag>
        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{approval.title}</span>
        <span className="spacer" />
        <Tag tone={approval.status === 'approved' ? 'ok' : approval.status === 'denied' ? 'err' : approval.status === 'expired' || approval.status === 'canceled' ? 'neutral' : 'warn'}>
          {approval.status}
        </Tag>
      </div>
      <pre className="code-block" style={{ maxHeight: 160, fontSize: 11.5 }}>
        {approval.detail}
      </pre>
      <div className="row" style={{ gap: 6 }}>
        <span className="mono dim" style={{ fontSize: 10.5 }}>
          {approval.kind} · {approval.source} · {timeAgo(approval.createdAt)}
        </span>
        <span className="spacer" />
        <Button size="sm" variant="ghost" onClick={() => setShowPayload((v) => !v)}>
          {showPayload ? 'Hide' : 'Show'} payload
        </Button>
        {pending ? (
          <>
            <Button size="sm" variant="danger" onClick={() => onDecide(approval.id, false)} icon={<IconX size={13} />}>
              Deny
            </Button>
            <Button size="sm" variant="primary" onClick={() => onDecide(approval.id, true)} icon={<IconCheck size={13} />}>
              Approve
            </Button>
          </>
        ) : null}
      </div>
      {showPayload ? (
        <pre className="code-block" style={{ maxHeight: 240 }}>
          {JSON.stringify(approval.payload, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
