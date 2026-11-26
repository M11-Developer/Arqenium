import { useCallback, useEffect, useState } from 'react';
import {
  IconDatabase,
  IconDownload,
  IconKey,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconShieldLock,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { request } from '../lib/bridge';
import {
  Banner,
  Button,
  Checkbox,
  EmptyState,
  Field,
  KeyValue,
  Loading,
  Modal,
  Select,
  Switch,
  Tag,
  TextArea,
  TextInput,
  formatDateTime,
  timeAgo,
} from '../components/ui';
import type { AppInfo, ContextEntry, ModelInfo, ProviderConfig, ProviderHealth } from '../lib/types';

interface CredentialRow {
  scope: string;
  ref: string;
  hint: string;
  updatedAt: string;
}

const PROVIDER_KINDS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compatible', label: 'OpenAI-compatible endpoint' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'ollama', label: 'Ollama / local model server' },
] as const;

type Section = 'providers' | 'context' | 'credentials' | 'runtime' | 'data';

export function Settings() {
  const { providers, refreshProviders, currentProjectId, projects, toast, info, theme, setTheme } = useApp();
  const [section, setSection] = useState<Section>('providers');
  const [showProvider, setShowProvider] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [health, setHealth] = useState<Record<string, ProviderHealth | 'testing'>>({});
  const [models, setModels] = useState<Record<string, ModelInfo[]>>({});
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [context, setContext] = useState<ContextEntry[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(info);
  const [settingsList, setSettingsList] = useState<Array<{ key: string; value: unknown }>>([]);
  const [loading, setLoading] = useState(false);

  const project = projects.find((p) => p.id === currentProjectId) ?? null;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, i] = await Promise.all([
        request('credentials.list', {}) as Promise<CredentialRow[]>,
        request('settings.list', {}) as Promise<Array<{ key: string; value: unknown }>>,
        request('app.info', {}) as Promise<AppInfo>,
      ]);
      setCredentials(c);
      setSettingsList(s);
      setAppInfo(i);
      if (currentProjectId) {
        setContext((await request('context.list', { projectId: currentProjectId })) as ContextEntry[]);
      }
    } catch (err) {
      toast('err', 'Could not load settings', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function testProvider(id: string) {
    setHealth((h) => ({ ...h, [id]: 'testing' }));
    try {
      const res = (await request('providers.test', { id })) as ProviderHealth;
      setHealth((h) => ({ ...h, [id]: res }));
      toast(res.ok ? 'ok' : 'err', res.ok ? 'Provider reachable' : 'Provider check failed', res.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHealth((h) => ({ ...h, [id]: { ok: false, message, latencyMs: null } }));
      toast('err', 'Provider check failed', message);
    }
  }

  async function loadModels(id: string) {
    try {
      const list = (await request('providers.models', { id })) as ModelInfo[];
      setModels((m) => ({ ...m, [id]: list }));
      toast(list.length ? 'ok' : 'info', `${list.length} model(s) available`);
    } catch (err) {
      toast('err', 'Model discovery failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteProvider(id: string) {
    if (!confirm('Delete this provider configuration? Stored credentials for it are removed too.')) return;
    try {
      await request('providers.delete', { id });
      await refreshProviders();
      toast('info', 'Provider removed');
    } catch (err) {
      toast('err', 'Delete failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function removeCredential(scope: string, ref: string) {
    if (!confirm(`Delete credential ${scope}/${ref}?`)) return;
    try {
      await request('credentials.delete', { scope, ref });
      await loadAll();
      toast('info', 'Credential deleted');
    } catch (err) {
      toast('err', 'Delete failed', err instanceof Error ? err.message : String(err));
    }
  }

  const sections: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
    { id: 'providers', label: 'AI providers', icon: <IconSettings size={14} /> },
    { id: 'context', label: 'Project context', icon: <IconUsers size={14} /> },
    { id: 'credentials', label: 'Credentials', icon: <IconKey size={14} /> },
    { id: 'runtime', label: 'Runtime', icon: <IconShieldLock size={14} /> },
    { id: 'data', label: 'Data & storage', icon: <IconDatabase size={14} /> },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Providers, credentials, project context and local data controls. Nothing here sends project content
            anywhere until you start a run or a health check against a provider you configured.
          </p>
        </div>
      </div>

      <div className="split">
        <div className="panel" style={{ position: 'sticky', top: 0 }}>
          <div className="panel-head">
            <span className="panel-title">Sections</span>
          </div>
          <div className="list">
            {sections.map((s) => (
              <button key={s.id} className={`list-item ${section === s.id ? 'selected' : ''}`} onClick={() => setSection(s.id)}>
                {s.icon}
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.label}</span>
              </button>
            ))}
          </div>
          <div className="panel-foot">
            <span className="muted" style={{ fontSize: 11 }}>
              {appInfo ? `${appInfo.name} v${appInfo.version} · ${appInfo.runtime}` : 'Loading'}
            </span>
          </div>
        </div>

        <div className="stack">
          {loading ? <Loading label="Loading settings" /> : null}

          {section === 'providers' ? (
            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">AI providers</span>
                <span className="spacer" />
                <Button size="sm" onClick={() => { setEditingProvider(null); setShowProvider(true); }} icon={<IconPlus size={13} />}>
                  Add provider
                </Button>
              </div>
              {providers.length === 0 ? (
                <EmptyState icon={<IconSettings size={20} />} title="No providers" text="Add an OpenAI-compatible endpoint, Anthropic, Gemini or a local Ollama server." />
              ) : (
                <div>
                  {providers.map((p) => {
                    const h = health[p.id];
                    return (
                      <div key={p.id} className="integration-row">
                        <div style={{ minWidth: 0 }}>
                          <div className="integration-name">
                            {p.name}
                            <Tag tone={p.kind === 'demo' ? 'warn' : p.enabled ? 'ok' : 'neutral'}>{p.kind}</Tag>
                            {p.kind === 'demo' ? <Tag tone="info">built-in</Tag> : null}
                          </div>
                          <div className="integration-meta">
                            <span className="mono">{p.baseUrl ?? 'default endpoint'}</span>
                            <span>model: {p.defaultModel ?? 'not set'}</span>
                            <span>credential: {p.credentialRef ? 'stored' : 'none'}</span>
                            {h && h !== 'testing' ? (
                              <Tag tone={h.ok ? 'ok' : 'err'} title={h.message}>
                                {h.ok ? `reachable ${h.latencyMs ?? '?'}ms` : 'unreachable'}
                              </Tag>
                            ) : null}
                            {h === 'testing' ? <Tag tone="info">checking</Tag> : null}
                          </div>
                          {h && h !== 'testing' && !h.ok ? (
                            <div className="mono" style={{ fontSize: 11, color: 'var(--err)', marginTop: 4, maxWidth: 560 }}>
                              {h.message}
                            </div>
                          ) : null}
                          {models[p.id]?.length ? (
                            <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                              {models[p.id].slice(0, 12).map((m) => (
                                <span key={m.id} className="tool-chip">
                                  {m.id}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="row">
                          {p.kind !== 'demo' ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => void testProvider(p.id)} loading={h === 'testing'} icon={<IconRefresh size={13} />}>
                                Test
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => void loadModels(p.id)}>
                                Models
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingProvider(p); setShowProvider(true); }}>
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => void deleteProvider(p.id)} icon={<IconTrash size={13} />} title="Delete provider" />
                            </>
                          ) : (
                            <span className="muted" style={{ fontSize: 11.5, maxWidth: 260, textAlign: 'right' }}>
                              Deterministic local adapter used when no live model is configured. Runs are labelled demo.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="panel-foot">
                <Banner tone="info">
                  API keys are stored with AES-256-GCM in the local database, keyed by a machine-local key file with
                  mode 0600. Keys are never written to logs, traces or the renderer after saving.
                </Banner>
              </div>
            </div>
          ) : null}

          {section === 'context' ? (
            <ContextSection projectId={currentProjectId} entries={context} onChange={loadAll} />
          ) : null}

          {section === 'credentials' ? (
            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">Stored credentials</span>
                <span className="spacer" />
                <span className="mono dim">{credentials.length}</span>
              </div>
              {credentials.length === 0 ? (
                <EmptyState icon={<IconKey size={20} />} title="No credentials stored" text="Provider keys are stored when you save a provider. MCP header credentials can be added per server." />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Scope</th>
                        <th>Reference</th>
                        <th>Hint</th>
                        <th>Updated</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {credentials.map((c) => (
                        <tr key={`${c.scope}/${c.ref}`}>
                          <td>
                            <Tag>{c.scope}</Tag>
                          </td>
                          <td className="mono">{c.ref}</td>
                          <td className="mono dim">{c.hint}</td>
                          <td className="mono dim">{timeAgo(c.updatedAt)}</td>
                          <td className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => void removeCredential(c.scope, c.ref)} icon={<IconTrash size={13} />} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="panel-foot">
                <span className="muted" style={{ fontSize: 11.5 }}>
                  Only masked hints are shown. Full values are decrypted in the main process when a request needs them.
                </span>
              </div>
            </div>
          ) : null}

          {section === 'runtime' ? (
            <div className="stack">
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Runtime</span>
                </div>
                <div className="panel-body">
                  {appInfo ? (
                    <KeyValue
                      items={[
                        { key: 'Product', value: `${appInfo.name} v${appInfo.version}` },
                        { key: 'Runtime', value: appInfo.runtime === 'electron' ? 'Electron desktop' : 'Web preview (HTTP API)' },
                        { key: 'Node', value: appInfo.node },
                        { key: 'Platform', value: appInfo.platform },
                        { key: 'Data directory', value: <span className="mono">{appInfo.dataDir}</span> },
                        { key: 'Telemetry', value: <Tag tone="ok">disabled (not implemented)</Tag> },
                        { key: 'Theme', value: theme === 'dark' ? 'Dark (default)' : 'Light' },
                      ]}
                    />
                  ) : null}
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-label">Interface theme</div>
                    <div className="settings-row-desc">Dark-first design with a complete light theme. The choice is stored locally.</div>
                  </div>
                  <Switch checked={theme === 'light'} onChange={(v) => setTheme(v ? 'light' : 'dark')} label="Light theme" />
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Advanced settings</span>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settingsList.map((s) => (
                        <tr key={s.key}>
                          <td className="mono">{s.key}</td>
                          <td className="mono dim">{JSON.stringify(s.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel-foot">
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    Settings are persisted in the local SQLite database and read by services at call time.
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {section === 'data' ? (
            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">Local data</span>
              </div>
              <div className="panel-body stack">
                <Banner tone="ok" title="Everything stays local by default">
                  The project index, traces, evaluations, captures and credentials live in a single SQLite database inside
                  your data directory. ARQENIUM collects no analytics and has no telemetry endpoint.
                </Banner>
                <KeyValue
                  items={[
                    { key: 'Database', value: <span className="mono">{appInfo?.dataDir}/arqenium.db</span> },
                    { key: 'Indexed projects', value: String(projects.length) },
                    { key: 'Active project', value: project ? `${project.name} (${project.indexStats.filesIndexed} files)` : 'none' },
                    { key: 'Trace retention', value: String(settingsList.find((s) => s.key === 'tracex.retentionDays')?.value ?? 30) + ' days' },
                  ]}
                />
                <div className="row">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<IconDownload size={13} />}
                    onClick={() => {
                      void request('trace.events', { limit: 1000, offset: 0 }).then((res) => {
                        const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'arqenium-traces.json';
                        a.click();
                        URL.revokeObjectURL(url);
                      });
                    }}
                  >
                    Export recent traces
                  </Button>
                </div>
                <Banner tone="warn" title="Removing a project deletes its index">
                  Use Projects &gt; Remove to delete a project's index, symbols and edges. Files on disk are never
                  modified by ARQENIUM.
                </Banner>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {showProvider ? (
        <ProviderModal
          existing={editingProvider}
          onClose={() => setShowProvider(false)}
          onSaved={async () => {
            setShowProvider(false);
            await refreshProviders();
            await loadAll();
            toast('ok', editingProvider ? 'Provider updated' : 'Provider added');
          }}
          onError={(m) => toast('err', 'Could not save the provider', m)}
        />
      ) : null}
    </div>
  );
}

function ContextSection({
  projectId,
  entries,
  onChange,
}: {
  projectId: string | null;
  entries: ContextEntry[];
  onChange: () => Promise<void>;
}) {
  const { toast } = useApp();
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<ContextEntry['kind']>('note');
  const [content, setContent] = useState('');
  const [includeInPrompt, setIncludeInPrompt] = useState(true);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!projectId) return;
    setBusy(true);
    try {
      await request('context.upsert', {
        projectId,
        key: key.trim(),
        kind,
        content: content.trim(),
        tags: [],
        includeInPrompt,
      });
      setKey('');
      setContent('');
      await onChange();
      toast('ok', 'Context saved');
    } catch (err) {
      toast('err', 'Could not save context', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!projectId) return;
    try {
      await request('context.delete', { projectId, id });
      await onChange();
    } catch (err) {
      toast('err', 'Delete failed', err instanceof Error ? err.message : String(err));
    }
  }

  if (!projectId) {
    return (
      <div className="panel">
        <EmptyState icon={<IconUsers size={20} />} title="No project selected" text="Project context is stored per project." />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Add project context</span>
        </div>
        <div className="panel-body stack">
          <p className="page-sub">
            Context entries are authoritative notes passed to agents with the run brief. They are trusted user input,
            unlike file contents or tool output.
          </p>
          <div className="grid-2">
            <Field label="Key" hint="Short identifier, e.g. auth-strategy">
              <TextInput value={key} onChange={setKey} placeholder="convention-naming" />
            </Field>
            <Field label="Kind">
              <Select
                value={kind}
                onChange={(v) => setKind(v as ContextEntry['kind'])}
                options={[
                  { value: 'decision', label: 'Architectural decision' },
                  { value: 'convention', label: 'Convention' },
                  { value: 'note', label: 'Note' },
                  { value: 'outcome', label: 'Task outcome' },
                ]}
              />
            </Field>
          </div>
          <Field label="Content">
            <TextArea value={content} onChange={setContent} rows={3} placeholder="Describe the decision, convention or note." />
          </Field>
          <div className="row">
            <Checkbox checked={includeInPrompt} onChange={setIncludeInPrompt} label="Include in agent prompts" />
            <span className="spacer" />
            <Button variant="primary" size="sm" onClick={() => void save()} loading={busy} disabled={!key.trim() || !content.trim()}>
              Save context
            </Button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Stored context</span>
          <span className="spacer" />
          <span className="mono dim">{entries.length}</span>
        </div>
        {entries.length === 0 ? (
          <EmptyState icon={<IconUsers size={20} />} title="No context stored" text="Add architectural decisions or conventions so agents follow them." />
        ) : (
          <div className="list">
            {entries.map((e) => (
              <div key={e.id} className="list-item list-item-static">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <Tag tone="accent">{e.kind}</Tag>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>
                      {e.key}
                    </span>
                    {e.includeInPrompt ? <Tag tone="ok">in prompts</Tag> : <Tag tone="neutral">stored only</Tag>}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3, whiteSpace: 'pre-wrap' }}>
                    {e.content}
                  </div>
                  <div className="mono dim" style={{ fontSize: 10.5, marginTop: 3 }}>
                    {formatDateTime(e.updatedAt)}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void remove(e.id)} icon={<IconTrash size={13} />} title="Delete" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderModal({
  existing,
  onClose,
  onSaved,
  onError,
}: {
  existing: ProviderConfig | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [kind, setKind] = useState<(typeof PROVIDER_KINDS)[number]['value']>((existing?.kind as any) ?? 'openai');
  const [name, setName] = useState(existing?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '');
  const [defaultModel, setDefaultModel] = useState(existing?.defaultModel ?? '');
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultNames: Record<string, string> = {
    openai: 'OpenAI',
    'openai-compatible': 'Custom endpoint',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
    ollama: 'Local Ollama',
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const trimmedName = (name.trim() || defaultNames[kind] || kind).slice(0, 120);
      if (existing) {
        await request('providers.update', {
          id: existing.id,
          patch: {
            name: trimmedName,
            baseUrl: baseUrl.trim() || null,
            defaultModel: defaultModel.trim() || null,
            enabled,
          },
          apiKey: apiKey.trim() || undefined,
        });
      } else {
        await request('providers.create', {
          kind,
          name: trimmedName,
          baseUrl: baseUrl.trim() || null,
          defaultModel: defaultModel.trim() || null,
          apiKey: apiKey.trim() || undefined,
          config: {},
        });
      }
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
      title={existing ? `Edit ${existing.name}` : 'Add an AI provider'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            {existing ? 'Save changes' : 'Add provider'}
          </Button>
        </>
      }
    >
      {error ? <Banner tone="err" title="Provider could not be saved">{error}</Banner> : null}
      <div className="grid-2">
        <Field label="Provider type" hint={existing ? 'The adapter type cannot be changed after creation.' : undefined}>
          <Select
            value={kind}
            onChange={(v) => {
              setKind(v as typeof kind);
              if (!existing) setName(defaultNames[v] ?? '');
            }}
            options={PROVIDER_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            disabled={!!existing}
          />
        </Field>
        <Field label="Display name">
          <TextInput value={name} onChange={setName} placeholder={defaultNames[kind]} />
        </Field>
      </div>
      <Field label="Base URL" hint="Leave empty to use the provider default. Ollama usually runs at http://127.0.0.1:11434.">
        <TextInput value={baseUrl ?? ''} onChange={setBaseUrl} placeholder="https://api.example.com/v1" mono />
      </Field>
      <Field label="Default model" hint="Model identifiers are never hardcoded - use Models to discover what your endpoint serves.">
        <TextInput value={defaultModel ?? ''} onChange={setDefaultModel} placeholder="gpt-4o-mini" mono />
      </Field>
      <Field label={existing ? 'Replace API key (optional)' : 'API key'} hint="Stored encrypted; never displayed again after saving.">
        <TextInput value={apiKey} onChange={setApiKey} placeholder={existing?.credentialRef ? 'stored - leave empty to keep' : 'sk-...'} />
      </Field>
      <Checkbox checked={enabled} onChange={setEnabled} label="Enable this provider for agents and the API" />
      {kind === 'ollama' ? (
        <Banner tone="info">Ollama does not use an API key. Make sure the server is running and that the model is pulled locally.</Banner>
      ) : null}
      <Banner tone="warn" title="Data transmitted to a provider">
        When a run targets this provider, ARQENIUM sends the agent's instructions, the task brief, selected project
        context and any tool output the agent requested (which may include file contents). TraceX records which provider
        and model received each request.
      </Banner>
    </Modal>
  );
}
