import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconDownload, IconFilter, IconClock, IconPlayerPlay, IconRefresh, IconSearch } from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { request } from '../lib/bridge';
import { Banner, Button, EmptyState, Loading, Select, Stat, Tag, formatDateTime, formatDuration, formatTime } from '../components/ui';
import type { ToolCallRecord } from '../lib/types';
import type { ArqeniumEvent } from '../lib/bridge';

interface Summary {
  events: number;
  errors: number;
  warnings: number;
  failures: Array<{ type: string; message: string; ts: string; taskId: string | null }>;
  avgTaskMs: number | null;
  toolCalls: number;
  durationMs: number | null;
}

export function Observability() {
  const { events: liveEvents, currentProjectId, moduleEnabled, toast } = useApp();
  const [events, setEvents] = useState<ArqeniumEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<Array<{ type: string; count: number }>>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [severity, setSeverity] = useState<'' | 'debug' | 'info' | 'warn' | 'error'>('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ArqeniumEvent | null>(null);
  const [tab, setTab] = useState<'events' | 'tools'>('events');
  const seen = useRef(0);

  const load = useCallback(async () => {
    try {
      const [res, t, tc, s] = await Promise.all([
        request('trace.events', {
          severity: severity || undefined,
          type: type || undefined,
          search: search || undefined,
          limit: 400,
          offset: 0,
        }) as Promise<{ items: ArqeniumEvent[]; total: number }>,
        request('trace.eventTypes', {}) as Promise<Array<{ type: string; count: number }>>,
        request('trace.toolCalls', { limit: 200 }) as Promise<ToolCallRecord[]>,
        request('trace.summary', {}) as Promise<Summary>,
      ]);
      setEvents(res.items);
      setTotal(res.total);
      setTypes(t);
      setToolCalls(tc);
      setSummary(s);
    } catch (err) {
      toast('err', 'Could not load traces', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [severity, type, search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Merge live events into the head of the list unless paused or a filter hides them.
  useEffect(() => {
    if (paused) return;
    const latest = liveEvents[0];
    if (!latest) return;
    if (seen.current === 0) {
      seen.current = 1;
      return;
    }
    if (severity && latest.severity !== severity) return;
    if (type && latest.type !== type) return;
    if (search && !`${latest.message} ${latest.type}`.toLowerCase().includes(search.toLowerCase())) return;
    setEvents((prev) => {
      if (prev.some((e) => e.id === latest.id)) return prev;
      const next = [latest, ...prev];
      if (next.length > 500) next.length = 500;
      return next;
    });
    setTotal((t) => t + 1);
  }, [liveEvents, paused, severity, type, search]);

  const stats = useMemo(() => {
    const errors = events.filter((e) => e.severity === 'error').length;
    const warns = events.filter((e) => e.severity === 'warn').length;
    return { errors, warns };
  }, [events]);

  function exportJson() {
    const payload = { exportedAt: new Date().toISOString(), total, events };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arqenium-traces-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!moduleEnabled('tracex')) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Observability</h1>
          </div>
        </div>
        <Banner tone="warn" title="TraceX disabled">
          Enable the TraceX module to record and inspect execution events.
        </Banner>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Observability</h1>
          <p className="page-sub">
            TraceX is the local execution log for the whole product: agent runs, task transitions, provider requests,
            tool calls, MCP traffic, approvals and module changes. Values matching secret patterns are redacted before
            they are persisted.
          </p>
        </div>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => setPaused((p) => !p)} icon={paused ? <IconPlayerPlay size={13} /> : <IconClock size={13} />}>
            {paused ? 'Resume stream' : 'Pause stream'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load()} icon={<IconRefresh size={13} />}>
            Refresh
          </Button>
          <Button size="sm" onClick={exportJson} icon={<IconDownload size={13} />}>
            Export
          </Button>
        </div>
      </div>

      <div className="grid-4">
        <Stat label="Events (filtered)" value={events.length.toLocaleString()} hint={`${total.toLocaleString()} total recorded`} />
        <Stat label="Errors" value={stats.errors} hint={summary ? `${summary.errors} all-time` : ''} />
        <Stat label="Warnings" value={stats.warns} hint={summary ? `${summary.warnings} all-time` : ''} />
        <Stat label="Tool calls" value={summary?.toolCalls ?? 0} hint="recorded invocations" />
      </div>

      {summary && summary.failures.length ? (
        <Banner tone="err" title={`${summary.failures.length} recent failure(s)`}>
          <div className="stack-2" style={{ marginTop: 4 }}>
            {summary.failures.slice(0, 3).map((f, i) => (
              <div key={i} className="mono" style={{ fontSize: 11.5 }}>
                {formatTime(f.ts)} · {f.type} · {f.message.slice(0, 180)}
              </div>
            ))}
          </div>
        </Banner>
      ) : null}

      <div className="panel">
        <div className="row" style={{ padding: 12, gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line-1)' }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
            <IconSearch size={14} />
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages and event types" />
          </div>
          <div style={{ width: 150 }}>
            <Select
              value={severity}
              onChange={(v) => setSeverity(v as typeof severity)}
              options={[
                { value: '', label: 'All severities' },
                { value: 'debug', label: 'Debug' },
                { value: 'info', label: 'Info' },
                { value: 'warn', label: 'Warning' },
                { value: 'error', label: 'Error' },
              ]}
            />
          </div>
          <div style={{ width: 220 }}>
            <Select
              value={type}
              onChange={setType}
              options={[{ value: '', label: 'All event types' }, ...types.map((t) => ({ value: t.type, label: `${t.type} (${t.count})` }))]}
            />
          </div>
          <IconFilter size={14} style={{ color: 'var(--fg-4)' }} />
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'events' ? 'active' : ''}`} onClick={() => setTab('events')}>
            Events <span className="count">{events.length}</span>
          </button>
          <button className={`tab ${tab === 'tools' ? 'active' : ''}`} onClick={() => setTab('tools')}>
            Tool calls <span className="count">{toolCalls.length}</span>
          </button>
        </div>

        {loading ? (
          <Loading label="Loading traces" />
        ) : tab === 'events' ? (
          events.length === 0 ? (
            <EmptyState icon={<IconSearch size={20} />} title="No events match" text="Clear the filters or perform an action in the app to generate events." />
          ) : (
            <div className="split-wide" style={{ padding: 12 }}>
              <div className="log-view">
                {events.map((e) => (
                  <div
                    key={e.id}
                    className="log-line"
                    onClick={() => setSelected(e)}
                    style={{ cursor: 'pointer', background: selected?.id === e.id ? 'var(--bg-4)' : undefined }}
                  >
                    <span className="log-time">{new Date(e.ts).toLocaleTimeString([], { hour12: false })}</span>
                    <span className={`log-sev sev-${e.severity}`}>{e.severity}</span>
                    <span style={{ color: 'var(--fg-2)' }} className="truncate">
                      <span className="mono" style={{ color: 'var(--fg-4)', marginRight: 6 }}>
                        {e.type}
                      </span>
                      {e.message}
                    </span>
                  </div>
                ))}
              </div>
              <div className="panel" style={{ position: 'sticky', top: 12 }}>
                <div className="panel-head">
                  <span className="panel-title">Event detail</span>
                </div>
                {!selected ? (
                  <div className="panel-body muted" style={{ fontSize: 12 }}>
                    Select an event to inspect its structured payload, correlation ids and timing.
                  </div>
                ) : (
                  <div className="panel-body stack-2">
                    <dl className="kv">
                      <dt>Type</dt>
                      <dd className="mono">{selected.type}</dd>
                      <dt>Severity</dt>
                      <dd>
                        <Tag tone={selected.severity === 'error' ? 'err' : selected.severity === 'warn' ? 'warn' : 'info'}>{selected.severity}</Tag>
                      </dd>
                      <dt>Time</dt>
                      <dd className="mono">{formatDateTime(selected.ts)}</dd>
                      <dt>Source</dt>
                      <dd>{selected.source}</dd>
                      <dt>Run</dt>
                      <dd className="mono truncate">{selected.runId ?? '-'}</dd>
                      <dt>Task</dt>
                      <dd className="mono truncate">{selected.taskId ?? '-'}</dd>
                      <dt>Agent</dt>
                      <dd className="mono truncate">{selected.agentId ?? '-'}</dd>
                      <dt>Correlation</dt>
                      <dd className="mono truncate">{selected.correlationId ?? '-'}</dd>
                      <dt>Duration</dt>
                      <dd className="mono">{formatDuration(selected.durationMs)}</dd>
                    </dl>
                    <div>
                      <div className="section-label">Message</div>
                      <div style={{ fontSize: 12.5 }}>{selected.message}</div>
                    </div>
                    <div>
                      <div className="section-label">Payload</div>
                      <pre className="code-block" style={{ maxHeight: 280 }}>
                        {JSON.stringify(selected.data, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        ) : toolCalls.length === 0 ? (
          <EmptyState icon={<IconSearch size={20} />} title="No tool calls recorded" text="Tool calls appear here once an agent or an MCP server invokes a tool." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>Duration</th>
                  <th>Started</th>
                  <th>Input</th>
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
                    <td className="mono dim">{tc.approvalId ? tc.approvalId.slice(0, 12) : '-'}</td>
                    <td className="mono dim">{formatDuration(tc.durationMs)}</td>
                    <td className="mono dim">{formatDateTime(tc.startedAt)}</td>
                    <td className="mono dim truncate" style={{ maxWidth: 260, fontSize: 11 }}>
                      {JSON.stringify(tc.input)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="muted" style={{ fontSize: 11.5 }}>
        Retention is configurable in Settings (default 30 days). Events are stored locally and never uploaded.
        {currentProjectId ? ' Events are correlated across the active project.' : ''}
      </div>
    </div>
  );
}
