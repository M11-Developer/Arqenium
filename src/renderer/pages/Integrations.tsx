import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconBook,
  IconCheck,
  IconCirclePlus,
  IconExternalLink,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRefresh,
  IconSearch,
  IconServer,
  IconTerminal,
  IconTrash,
} from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { openExternal, request } from '../lib/bridge';
import {
  Banner,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Loading,
  Modal,
  Select,
  Tag,
  TextArea,
  TextInput,
  formatDateTime,
  timeAgo,
} from '../components/ui';
import type { McpCapability, McpServerConfig } from '../lib/types';

interface DirectoryEntry {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  category: string;
  template: boolean;
  notes?: string;
}

interface InternalStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string | null;
  toolCount: number;
  lastError: string | null;
}

interface CallResult {
  ok: boolean;
  content: unknown;
  isError: boolean;
  error?: string;
  durationMs: number;
}

export function Integrations() {
  const { toast, moduleEnabled } = useApp();
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<McpCapability[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [internal, setInternal] = useState<InternalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [prefill, setPrefill] = useState<DirectoryEntry | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'servers' | 'directory' | 'internal'>('servers');
  const [callTool, setCallTool] = useState<McpCapability | null>(null);
  const [lastCall, setLastCall] = useState<CallResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, d, i] = await Promise.all([
        request('mcp.list', {}) as Promise<McpServerConfig[]>,
        request('mcp.directory', {}) as Promise<DirectoryEntry[]>,
        request('mcp.internal.status', {}) as Promise<InternalStatus>,
      ]);
      setServers(s);
      setDirectory(d);
      setInternal(i);
      setSelected((cur) => cur ?? s[0]?.id ?? null);
    } catch (err) {
      toast('err', 'Could not load integrations', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = servers.find((s) => s.id === selected) ?? null;

  const loadCaps = useCallback(
    async (id: string) => {
      try {
        setCapabilities((await request('mcp.capabilities', { id })) as McpCapability[]);
      } catch {
        setCapabilities([]);
      }
    },
    [],
  );

  useEffect(() => {
    if (selected) void loadCaps(selected);
    else setCapabilities([]);
  }, [selected, loadCaps]);

  async function connect(id: string) {
    setBusy(id);
    try {
      const res = (await request('mcp.connect', { id })) as { status: string; capabilities: McpCapability[]; error: string | null };
      if (res.status === 'connected') toast('ok', 'Connected', `${res.capabilities.filter((c) => c.kind === 'tool').length} tool(s) discovered.`);
      else toast('err', 'Connection failed', res.error ?? 'Unknown error');
      await load();
      await loadCaps(id);
    } catch (err) {
      toast('err', 'Connection failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    setBusy(id);
    try {
      await request('mcp.disconnect', { id });
      await load();
    } catch (err) {
      toast('err', 'Disconnect failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this MCP server and its discovered capabilities?')) return;
    try {
      await request('mcp.remove', { id });
      setSelected(null);
      await load();
      toast('info', 'Server removed');
    } catch (err) {
      toast('err', 'Remove failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleInternal(enabled: boolean) {
    setBusy('internal');
    try {
      const res = (await request('mcp.internal.set', { enabled, port: internal?.port ?? 4321 })) as InternalStatus;
      setInternal(res);
      toast(res.running ? 'ok' : 'info', res.running ? 'Internal MCP server running' : 'Internal MCP server stopped', res.url ?? undefined);
    } catch (err) {
      toast('err', 'Could not change the internal server', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const filteredDirectory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter(
      (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.category.toLowerCase().includes(q),
    );
  }, [directory, search]);

  if (!moduleEnabled('openbridge')) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Integrations</h1>
          </div>
        </div>
        <Banner tone="warn" title="OpenBridge is disabled">
          Enable the OpenBridge module in Modules to register MCP servers.
        </Banner>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Integrations</h1>
          <p className="page-sub">
            OpenBridge speaks the Model Context Protocol over stdio and Streamable HTTP. Server tools are untrusted:
            every capability is listed with its declared schema, filtered by per-server permissions, and non
            auto-approved tools require explicit confirmation before they run.
          </p>
        </div>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => void load()} icon={<IconRefresh size={13} />}>
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setPrefill(null);
              setShowAdd(true);
            }}
            icon={<IconCirclePlus size={14} />}
          >
            Register server
          </Button>
        </div>
      </div>

      <div className="tabs" style={{ border: '1px solid var(--line-1)', borderRadius: 6 }}>
        <button className={`tab ${tab === 'servers' ? 'active' : ''}`} onClick={() => setTab('servers')}>
          <IconPlugConnected size={13} /> Servers <span className="count">{servers.length}</span>
        </button>
        <button className={`tab ${tab === 'directory' ? 'active' : ''}`} onClick={() => setTab('directory')}>
          <IconBook size={13} /> Directory
        </button>
        <button className={`tab ${tab === 'internal' ? 'active' : ''}`} onClick={() => setTab('internal')}>
          <IconServer size={13} /> Internal server
        </button>
      </div>

      {tab === 'servers' ? (
        loading ? (
          <Loading label="Loading servers" />
        ) : servers.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<IconPlugConnected size={20} />}
              title="No MCP servers registered"
              text="Register an MCP server to give agents and the UI access to its tools. Nothing connects until you press Connect, and every discovered tool is listed for review."
              action={
                <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
                  Register your first server
                </Button>
              }
            />
          </div>
        ) : (
          <div className="split">
            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">Registered servers</span>
              </div>
              <div className="list">
                {servers.map((s) => (
                  <button key={s.id} className={`list-item ${selected === s.id ? 'selected' : ''}`} onClick={() => setSelected(s.id)}>
                    <span
                      className={`dot ${s.status === 'connected' ? 'dot-ok' : s.status === 'error' ? 'dot-err' : s.status === 'connecting' ? 'dot-warn' : ''}`}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>
                        {s.name}
                      </div>
                      <div className="mono dim truncate" style={{ fontSize: 10.5 }}>
                        {s.transport} · {s.status}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="stack">
              {!current ? (
                <div className="panel">
                  <EmptyState icon={<IconPlugConnected size={20} />} title="Select a server" text="Choose a server to inspect its capabilities." />
                </div>
              ) : (
                <>
                  <div className="panel">
                    <div className="panel-head">
                      <span className="panel-title">{current.name}</span>
                      <Tag tone={current.transport === 'stdio' ? 'neutral' : 'info'}>{current.transport}</Tag>
                      <Tag tone={current.status === 'connected' ? 'ok' : current.status === 'error' ? 'err' : 'neutral'}>{current.status}</Tag>
                      <span className="spacer" />
                      {current.status === 'connected' ? (
                        <Button size="sm" onClick={() => void disconnect(current.id)} loading={busy === current.id} icon={<IconPlugConnectedX size={13} />}>
                          Disconnect
                        </Button>
                      ) : (
                        <Button size="sm" variant="primary" onClick={() => void connect(current.id)} loading={busy === current.id} icon={<IconPlugConnected size={13} />}>
                          Connect
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void remove(current.id)} icon={<IconTrash size={13} />} title="Remove server" />
                    </div>
                    <div className="panel-body">
                      <dl className="kv">
                        <dt>Endpoint</dt>
                        <dd className="mono" style={{ fontSize: 11.5 }}>
                          {current.transport === 'stdio' ? `${current.command ?? ''} ${(current.args ?? []).join(' ')}` : current.url}
                        </dd>
                        <dt>Last connected</dt>
                        <dd>{current.lastConnectedAt ? `${formatDateTime(current.lastConnectedAt)} (${timeAgo(current.lastConnectedAt)})` : 'never'}</dd>
                        <dt>Allowed tools</dt>
                        <dd className="mono" style={{ fontSize: 11.5 }}>{current.permissions.allowTools.join(', ') || 'none'}</dd>
                        <dt>Denied tools</dt>
                        <dd className="mono" style={{ fontSize: 11.5 }}>{current.permissions.denyTools.join(', ') || 'none'}</dd>
                        <dt>Auto-approved</dt>
                        <dd className="mono" style={{ fontSize: 11.5 }}>{current.permissions.autoApprove.join(', ') || 'none (every call needs confirmation)'}</dd>
                        <dt>Result cap</dt>
                        <dd>{current.permissions.maxResultBytes.toLocaleString()} bytes</dd>
                        {current.lastError ? (
                          <>
                            <dt>Last error</dt>
                            <dd style={{ color: 'var(--err)' }}>{current.lastError}</dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-head">
                      <span className="panel-title">Discovered capabilities</span>
                      <span className="spacer" />
                      <span className="mono dim">{capabilities.length}</span>
                    </div>
                    {capabilities.length === 0 ? (
                      <EmptyState
                        icon={<IconTerminal size={20} />}
                        title={current.status === 'connected' ? 'No capabilities reported' : 'Not connected'}
                        text={
                          current.status === 'connected'
                            ? 'This server did not advertise any tools, resources or prompts.'
                            : 'Connect the server to discover its capabilities.'
                        }
                      />
                    ) : (
                      <div className="table-wrap">
                        <table className="data">
                          <thead>
                            <tr>
                              <th>Kind</th>
                              <th>Name</th>
                              <th>Description</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {capabilities.map((c) => (
                              <tr key={`${c.kind}-${c.name}`}>
                                <td>
                                  <Tag tone={c.kind === 'tool' ? 'accent' : 'neutral'}>{c.kind}</Tag>
                                </td>
                                <td className="mono">{c.name}</td>
                                <td className="muted" style={{ fontSize: 12, maxWidth: 420 }}>
                                  {c.description || '-'}
                                </td>
                                <td className="text-right">
                                  {c.kind === 'tool' && current.status === 'connected' ? (
                                    <Button size="sm" variant="ghost" onClick={() => { setCallTool(c); setLastCall(null); }}>
                                      Call
                                    </Button>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      ) : null}

      {tab === 'directory' ? (
        <div className="stack">
          <Banner tone="warn" title="These are configuration templates, not verified live connections">
            ARQENIUM does not install, launch or endorse any third-party server. Review a server's source and
            permissions before you connect it. Packages referenced here must be installed in your environment first.
          </Banner>
          <div className="search-bar" style={{ maxWidth: 420 }}>
            <IconSearch size={14} />
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the directory" />
          </div>
          <div className="grid-2">
            {filteredDirectory.map((d) => (
              <div key={d.id} className="dir-card">
                <div className="row">
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                  <Tag tone={d.transport === 'stdio' ? 'neutral' : 'info'}>{d.transport}</Tag>
                  {d.template ? <Tag tone="accent">template</Tag> : null}
                  <span className="spacer" />
                  <span className="tag">{d.category}</span>
                </div>
                <p className="module-desc">{d.description}</p>
                <pre className="code-block" style={{ fontSize: 11, maxHeight: 84 }}>
                  {d.transport === 'stdio' ? `${d.command ?? ''} ${(d.args ?? []).join(' ')}` : d.url}
                </pre>
                {d.notes ? <p className="field-hint">{d.notes}</p> : null}
                <div className="row">
                  <Button
                    size="sm"
                    onClick={() => {
                      setPrefill(d);
                      setShowAdd(true);
                    }}
                  >
                    Use this configuration
                  </Button>
                  {d.id === 'arqenium-internal' ? (
                    <Button size="sm" variant="ghost" onClick={() => setTab('internal')}>
                      Open internal server
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'internal' ? (
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <IconServer size={15} style={{ color: 'var(--accent)' }} />
              <span className="panel-title">ARQENIUM internal MCP server</span>
              <span className="spacer" />
              <Tag tone={internal?.running ? 'ok' : 'neutral'}>{internal?.running ? 'running' : 'stopped'}</Tag>
            </div>
            <div className="panel-body stack">
              <p className="page-sub">
                Exposes ARQENIUM's read-only engineering intelligence to external MCP clients (Claude Desktop, other
                coding agents, your own scripts) over Streamable HTTP. It binds to the loopback interface only.
              </p>
              <dl className="kv">
                <dt>Endpoint</dt>
                <dd className="mono">{internal?.url ?? `http://127.0.0.1:${internal?.port ?? 4321}/mcp (stopped)`}</dd>
                <dt>Transport</dt>
                <dd>Streamable HTTP, stateful sessions</dd>
                <dt>Binding</dt>
                <dd>127.0.0.1 (not reachable from the network)</dd>
                <dt>Tools</dt>
                <dd>8 read-only intelligence tools plus evaluation execution</dd>
                {internal?.lastError ? (
                  <>
                    <dt>Last error</dt>
                    <dd style={{ color: 'var(--err)' }}>{internal.lastError}</dd>
                  </>
                ) : null}
              </dl>
              <div className="row">
                <Button
                  variant={internal?.running ? 'danger' : 'primary'}
                  size="sm"
                  loading={busy === 'internal'}
                  onClick={() => void toggleInternal(!internal?.running)}
                >
                  {internal?.running ? 'Stop server' : 'Start server'}
                </Button>
                {internal?.url ? (
                  <Button size="sm" variant="ghost" onClick={() => void openExternal('https://modelcontextprotocol.io')} icon={<IconExternalLink size={13} />}>
                    MCP specification
                  </Button>
                ) : null}
              </div>
              <div>
                <div className="section-label">Exposed tools</div>
                <div className="stack-2">
                  {['project_structure', 'search_symbols', 'search_files', 'dependency_graph', 'impact_analysis', 'run_history', 'trace_query', 'file_summary', 'evaluation_run'].map((t) => (
                    <div key={t} className="row" style={{ gap: 8 }}>
                      <IconCheck size={13} style={{ color: 'var(--ok)' }} />
                      <span className="mono" style={{ fontSize: 12 }}>
                        {t}
                      </span>
                      {t === 'evaluation_run' ? <Tag tone="warn">executes work</Tag> : <Tag tone="ok">read-only</Tag>}
                    </div>
                  ))}
                </div>
              </div>
              <Banner tone="info">
                External clients must be configured manually with this URL. ARQENIUM does not auto-register itself with
                other applications.
              </Banner>
            </div>
          </div>
        </div>
      ) : null}

      {showAdd ? (
        <AddServerModal
          prefill={prefill}
          onClose={() => {
            setShowAdd(false);
            setPrefill(null);
          }}
          onSaved={async () => {
            setShowAdd(false);
            setPrefill(null);
            await load();
            toast('ok', 'Server registered', 'Press Connect to discover its tools.');
          }}
          onError={(m) => toast('err', 'Could not register the server', m)}
        />
      ) : null}

      {callTool && current ? (
        <CallToolModal
          server={current}
          tool={callTool}
          result={lastCall}
          onResult={setLastCall}
          onClose={() => {
            setCallTool(null);
            setLastCall(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AddServerModal({
  prefill,
  onClose,
  onSaved,
  onError,
}: {
  prefill: DirectoryEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [transport, setTransport] = useState<'stdio' | 'http'>(prefill?.transport ?? 'stdio');
  const [command, setCommand] = useState(prefill?.command ?? '');
  const [argsText, setArgsText] = useState((prefill?.args ?? []).join('\n'));
  const [url, setUrl] = useState(prefill?.url ?? '');
  const [headers, setHeaders] = useState('{\n  "Authorization": "cred:mcp-token"\n}');
  const [allowTools, setAllowTools] = useState('*');
  const [denyTools, setDenyTools] = useState('');
  const [autoApprove, setAutoApprove] = useState('');
  const [connectNow, setConnectNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let parsedHeaders: Record<string, string> | undefined;
      if (transport === 'http' && headers.trim()) {
        try {
          parsedHeaders = JSON.parse(headers);
        } catch {
          throw new Error('Headers must be valid JSON');
        }
      }
      await request('mcp.add', {
        name: name.trim(),
        transport,
        command: transport === 'stdio' ? command.trim() : undefined,
        args: transport === 'stdio' ? argsText.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
        url: transport === 'http' ? url.trim() : undefined,
        headers: parsedHeaders,
        permissions: {
          allowTools: allowTools.split(',').map((s) => s.trim()).filter(Boolean),
          denyTools: denyTools.split(',').map((s) => s.trim()).filter(Boolean),
          autoApprove: autoApprove.split(',').map((s) => s.trim()).filter(Boolean),
          maxResultBytes: 64_000,
        },
        connect: connectNow,
      });
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Register an MCP server"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!name.trim() || (transport === 'stdio' ? !command.trim() : !url.trim())}>
            Register
          </Button>
        </>
      }
    >
      {error ? <Banner tone="err" title="Registration failed">{error}</Banner> : null}
      <Banner tone="warn" title="Only register servers you trust">
        A stdio server runs as a child process on this machine. An HTTP server receives your requests over the network.
        Both are treated as untrusted: results are capped, schemas are shown, and non-auto-approved tools are gated
        behind a confirmation dialog.
      </Banner>
      <div className="grid-2">
        <Field label="Display name">
          <TextInput value={name} onChange={setName} placeholder="e.g. Team knowledge base" />
        </Field>
        <Field label="Transport">
          <Select
            value={transport}
            onChange={(v) => setTransport(v as 'stdio' | 'http')}
            options={[
              { value: 'stdio', label: 'stdio (local child process)' },
              { value: 'http', label: 'Streamable HTTP (remote or local)' },
            ]}
          />
        </Field>
      </div>

      {transport === 'stdio' ? (
        <>
          <Field label="Command" hint="Executable resolved from PATH. No shell is involved.">
            <TextInput value={command} onChange={setCommand} placeholder="npx" mono />
          </Field>
          <Field label="Arguments (one per line)">
            <TextArea value={argsText} onChange={setArgsText} rows={3} mono placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir'} />
          </Field>
          <Banner tone="info">
            The child process receives a filtered environment - provider API keys are stripped before launch.
          </Banner>
        </>
      ) : (
        <>
          <Field label="URL" hint="Must be an absolute http(s) URL.">
            <TextInput value={url} onChange={setUrl} placeholder="http://127.0.0.1:4321/mcp" mono />
          </Field>
          <Field label="Headers (JSON)" hint='Values starting with "cred:" are resolved from the encrypted credential store at connect time.'>
            <TextArea value={headers} onChange={setHeaders} rows={3} mono />
          </Field>
        </>
      )}

      <div className="grid-3">
        <Field label="Allowed tools" hint="Comma separated, * for all, prefix* for wildcards.">
          <TextInput value={allowTools} onChange={setAllowTools} mono />
        </Field>
        <Field label="Denied tools" hint="Always blocked, evaluated before the allow list.">
          <TextInput value={denyTools} onChange={setDenyTools} mono placeholder="write_*, delete_*" />
        </Field>
        <Field label="Auto-approved tools" hint="Skip the confirmation dialog. Leave empty for maximum safety.">
          <TextInput value={autoApprove} onChange={setAutoApprove} mono placeholder="search, list_*" />
        </Field>
      </div>

      <Checkbox checked={connectNow} onChange={setConnectNow} label="Connect immediately after registering" />
    </Modal>
  );
}

function CallToolModal({
  server,
  tool,
  result,
  onResult,
  onClose,
}: {
  server: McpServerConfig;
  tool: McpCapability;
  result: CallResult | null;
  onResult: (r: CallResult) => void;
  onClose: () => void;
}) {
  const [argsText, setArgsText] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const needsApproval = !server.permissions.autoApprove.includes(tool.name) && !server.permissions.autoApprove.includes('*');

  async function invoke() {
    setBusy(true);
    setError(null);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(argsText || '{}');
      } catch {
        throw new Error('Arguments must be valid JSON');
      }
      const res = (await request('mcp.call', { id: server.id, tool: tool.name, arguments: parsed, approve: true })) as CallResult;
      onResult(res);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        title={`Call tool · ${tool.name}`}
        onClose={onClose}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => (needsApproval ? setConfirmOpen(true) : void invoke())}
              loading={busy}
            >
              {needsApproval ? 'Review and run' : 'Run tool'}
            </Button>
          </>
        }
      >
        <div className="row">
          <Tag tone="accent">{server.name}</Tag>
          <Tag>{tool.kind}</Tag>
          {needsApproval ? <Tag tone="warn">confirmation required</Tag> : <Tag tone="ok">auto-approved</Tag>}
        </div>
        <p className="page-sub">{tool.description || 'No description provided by the server.'}</p>
        <Field label="Declared input schema" hint="Provided by the server and treated as untrusted metadata.">
          <pre className="code-block" style={{ maxHeight: 200 }}>
            {JSON.stringify(tool.schema, null, 2)}
          </pre>
        </Field>
        <Field label="Arguments (JSON)">
          <TextArea value={argsText} onChange={setArgsText} rows={5} mono />
        </Field>
        {error ? <Banner tone="err" title="Call failed">{error}</Banner> : null}
        {result ? (
          <div className="stack-2">
            <div className="row">
              <Tag tone={result.ok ? 'ok' : 'err'}>{result.ok ? 'success' : 'error'}</Tag>
              <span className="mono dim">{result.durationMs}ms</span>
            </div>
            <pre className="code-block" style={{ maxHeight: 320 }}>
              {JSON.stringify(result.content ?? result.error, null, 2)}
            </pre>
          </div>
        ) : null}
      </Modal>

      {confirmOpen ? (
        <Modal
          title="Confirm tool execution"
          onClose={() => setConfirmOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void invoke()} loading={busy}>
                Approve and run
              </Button>
            </>
          }
        >
          <Banner tone="warn" title="This tool is not auto-approved">
            The call will be recorded as an approved action in TraceX with the arguments below.
          </Banner>
          <dl className="kv">
            <dt>Server</dt>
            <dd>{server.name}</dd>
            <dt>Tool</dt>
            <dd className="mono">{tool.name}</dd>
            <dt>Arguments</dt>
            <dd>
              <pre className="code-block" style={{ maxHeight: 200 }}>
                {argsText}
              </pre>
            </dd>
          </dl>
        </Modal>
      ) : null}
    </>
  );
}
