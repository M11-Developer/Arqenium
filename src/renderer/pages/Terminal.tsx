import { useCallback, useEffect, useState } from 'react';
import { IconBook, IconHistory, IconPlayerPlay, IconShieldCheck, IconTerminal2, IconTrash, IconX } from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { request } from '../lib/bridge';
import {
  Banner,
  Button,
  EmptyState,
  Field,
  Loading,
  Modal,
  Tag,
  formatDuration,
  timeAgo,
} from '../components/ui';
import type { TerminalCommandResult, TerminalSession } from '../lib/types';

interface Preview {
  approvalId: string;
  argv: string[];
  cwd: string;
  risk: 'low' | 'medium' | 'high';
  riskReasons: string[];
  blocked: boolean;
  explanation: string;
}

interface Explanation {
  command: string;
  argv: string[];
  explanation: string;
  risk: 'low' | 'medium' | 'high';
  riskReasons: string[];
  blocked: boolean;
}

export function Terminal() {
  const { currentProjectId, moduleEnabled, toast, projects } = useApp();
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [history, setHistory] = useState<TerminalCommandResult[]>([]);
  const [command, setCommand] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const project = projects.find((p) => p.id === currentProjectId) ?? null;

  const load = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    try {
      let list = (await request('terminal.sessions', { projectId: currentProjectId })) as TerminalSession[];
      if (!list.length) {
        const created = (await request('terminal.sessionCreate', { projectId: currentProjectId, name: 'default' })) as TerminalSession;
        list = [created];
      }
      setSessions(list);
      setSessionId((cur) => cur ?? list[0]?.id ?? null);
      setHistory((await request('terminal.history', { projectId: currentProjectId, limit: 100 })) as TerminalCommandResult[]);
    } catch (err) {
      toast('err', 'EchoShell unavailable', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function doPreview() {
    if (!currentProjectId || !command.trim()) return;
    try {
      const res = (await request('terminal.preview', {
        projectId: currentProjectId,
        sessionId: sessionId ?? undefined,
        command: command.trim(),
      })) as Preview;
      setPreview(res);
      setExplanation(null);
    } catch (err) {
      toast('err', 'Command cannot be prepared', err instanceof Error ? err.message : String(err));
    }
  }

  async function explain() {
    if (!command.trim()) return;
    try {
      setExplanation((await request('terminal.explain', { command: command.trim() })) as Explanation);
    } catch (err) {
      toast('err', 'Could not explain the command', err instanceof Error ? err.message : String(err));
    }
  }

  async function approveAndRun() {
    if (!preview) return;
    setRunning(true);
    try {
      await request('approvals.decide', { id: preview.approvalId, approved: true, decidedBy: 'user', reason: 'approved in EchoShell' });
      const res = (await request('terminal.execute', { approvalId: preview.approvalId })) as TerminalCommandResult;
      setPreview(null);
      setCommand('');
      await load();
      toast(res.status === 'ok' ? 'ok' : 'err', `Command ${res.status}`, `exit ${res.exitCode ?? 'n/a'} in ${formatDuration(res.durationMs)}`);
    } catch (err) {
      toast('err', 'Execution failed', err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function deny() {
    if (!preview) return;
    try {
      await request('approvals.decide', { id: preview.approvalId, approved: false, decidedBy: 'user', reason: 'denied in EchoShell' });
      setPreview(null);
      toast('info', 'Command denied');
    } catch (err) {
      toast('err', 'Could not record the decision', err instanceof Error ? err.message : String(err));
    }
  }

  async function addSession() {
    if (!currentProjectId) return;
    try {
      const s = (await request('terminal.sessionCreate', { projectId: currentProjectId })) as TerminalSession;
      setSessions((prev) => [...prev, s]);
      setSessionId(s.id);
    } catch (err) {
      toast('err', 'Could not create a session', err instanceof Error ? err.message : String(err));
    }
  }

  async function removeSession(id: string) {
    try {
      await request('terminal.sessionDelete', { id });
      const next = sessions.filter((s) => s.id !== id);
      setSessions(next);
      if (sessionId === id) setSessionId(next[0]?.id ?? null);
    } catch (err) {
      toast('err', 'Could not delete the session', err instanceof Error ? err.message : String(err));
    }
  }

  if (!moduleEnabled('echoshell')) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">EchoShell</h1>
            <p className="page-sub">Contextual terminal execution for this project. Optional and disabled by default.</p>
          </div>
        </div>
        <Banner tone="warn" title="EchoShell is disabled">
          Command execution is an optional capability. Enable it in Modules if you want a project-scoped terminal with
          mandatory approval for every command, filtered environment and process timeouts. No command can run from this
          app while the module is off.
        </Banner>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">EchoShell</h1>
          <p className="page-sub">
            Every command is shown with its working directory and a static risk assessment, then waits for your approval
            before it executes. Commands run without a shell, inside the project folder, with a filtered environment and
            a hard timeout.
          </p>
        </div>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => void addSession()} icon={<IconTerminal2 size={13} />}>
            New session
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load()} icon={<IconHistory size={13} />}>
            Reload history
          </Button>
        </div>
      </div>

      {!project ? (
        <Banner tone="info" title="Select a project">
          EchoShell sessions are bound to a project directory and cannot leave it.
        </Banner>
      ) : null}

      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Sessions</span>
          </div>
          {loading ? (
            <Loading label="Loading sessions" />
          ) : sessions.length === 0 ? (
            <EmptyState icon={<IconTerminal2 size={20} />} title="No sessions" text="Create a session to start." />
          ) : (
            <div className="list">
              {sessions.map((s) => (
                <div key={s.id} className={`list-item list-item-static ${sessionId === s.id ? 'selected' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setSessionId(s.id)}>
                  <IconTerminal2 size={13} style={{ color: 'var(--fg-3)' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>
                      {s.name}
                    </div>
                    <div className="mono dim truncate" style={{ fontSize: 10.5 }}>
                      {s.cwd || '.'}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeSession(s.id);
                    }}
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="panel-foot">
            <span className="muted" style={{ fontSize: 11 }}>
              Root: <span className="mono">{project?.rootPath ?? '-'}</span>
            </span>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Command</span>
              <span className="spacer" />
              <Tag tone="warn">approval required</Tag>
            </div>
            <div className="panel-body stack">
              <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="Command line" hint="No shell syntax: pipes, redirection and command chaining are rejected.">
                    <input
                      className="input mono-input"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="npm run typecheck"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void doPreview();
                      }}
                      spellCheck={false}
                    />
                  </Field>
                </div>
                <Button onClick={() => void explain()} icon={<IconBook size={14} />} disabled={!command.trim()}>
                  Explain
                </Button>
                <Button variant="primary" onClick={() => void doPreview()} disabled={!command.trim() || !project} icon={<IconShieldCheck size={14} />}>
                  Review
                </Button>
              </div>

              {explanation ? (
                <div className="panel" style={{ background: 'var(--bg-1)' }}>
                  <div className="panel-body stack-2">
                    <div className="row">
                      <Tag tone={explanation.risk === 'high' ? 'err' : explanation.risk === 'medium' ? 'warn' : 'neutral'}>{explanation.risk} risk</Tag>
                      {explanation.blocked ? <Tag tone="err">blocked by policy</Tag> : null}
                      <span className="mono dim" style={{ fontSize: 11 }}>
                        {explanation.argv.join(' ')}
                      </span>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.6 }}>{explanation.explanation}</p>
                    <span className="muted" style={{ fontSize: 11 }}>
                      Generated locally from a static policy table - no model is involved, so it cannot invent behaviour.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">History</span>
              <span className="spacer" />
              <span className="mono dim">{history.length}</span>
            </div>
            {history.length === 0 ? (
              <EmptyState icon={<IconHistory size={20} />} title="No commands yet" text="Approved commands and their output are recorded here." />
            ) : (
              <div style={{ maxHeight: 520, overflow: 'auto', padding: 12 }} className="stack">
                {history.map((h) => (
                  <div key={h.id} className="task-card">
                    <div className="task-card-head">
                      <Tag tone={h.status === 'ok' ? 'ok' : h.status === 'timeout' ? 'warn' : 'err'}>{h.status}</Tag>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>
                        {h.argv.join(' ')}
                      </span>
                      <span className="spacer" />
                      <span className="mono dim" style={{ fontSize: 10.5 }}>
                        exit {h.exitCode ?? 'n/a'} · {formatDuration(h.durationMs)} · {timeAgo(h.id ? '' : '')}
                      </span>
                    </div>
                    <div className="mono dim" style={{ fontSize: 10.5 }}>
                      {h.cwd}
                    </div>
                    {(h.stdout || h.stderr) ? (
                      <div className="term-output" style={{ maxHeight: 220 }}>
                        {h.stdout ? <span>{h.stdout}</span> : null}
                        {h.stderr ? <span style={{ color: 'var(--err)' }}>{h.stderr}</span> : null}
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        No output captured.
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {preview ? (
        <Modal
          title="Approve command execution"
          onClose={() => setPreview(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => void deny()} icon={<IconX size={14} />}>
                Deny
              </Button>
              <Button variant="primary" onClick={() => void approveAndRun()} loading={running} disabled={preview.blocked} icon={<IconPlayerPlay size={14} />}>
                Approve and run
              </Button>
            </>
          }
        >
          {preview.blocked ? (
            <Banner tone="err" title="Blocked by the safety policy">
              {preview.riskReasons.join('; ')}. No approval can override a blocked command.
            </Banner>
          ) : (
            <Banner tone={preview.risk === 'high' ? 'err' : preview.risk === 'medium' ? 'warn' : 'info'} title={`${preview.risk} risk`}>
              {preview.riskReasons.length ? preview.riskReasons.join('; ') : 'No elevated risk signals were detected by the static policy.'}
            </Banner>
          )}
          <dl className="kv">
            <dt>Command</dt>
            <dd className="mono">{preview.argv.join(' ')}</dd>
            <dt>Working directory</dt>
            <dd className="mono" style={{ fontSize: 11.5 }}>
              {preview.cwd}
            </dd>
            <dt>Project</dt>
            <dd>{project?.name}</dd>
            <dt>Approval id</dt>
            <dd className="mono">{preview.approvalId}</dd>
          </dl>
          <p className="muted" style={{ fontSize: 11.5 }}>
            Approving records your decision in TraceX and then executes the command. Output is captured and capped; the
            process is killed on timeout.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
