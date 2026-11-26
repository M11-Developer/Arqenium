import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconArrowsSplit,
  IconChevronRight,
  IconFileCode,
  IconFolder,
  IconFolderPlus,
  IconGitBranch,
  IconGraph,
  IconRefresh,
  IconSearch,
  IconStack2,
  IconTargetArrow,
  IconTrash,
} from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { canPickNative, pickDirectory, request } from '../lib/bridge';
import {
  Banner,
  Button,
  Dot,
  EmptyState,
  Field,
  Loading,
  Modal,
  Tag,
  TextInput,
  formatBytes,
  formatDuration,
  timeAgo,
} from '../components/ui';
import type { DependencyGraph, GitChange, GroundedSummary, ImpactResult, Project, SymbolRecord, TreeNode } from '../lib/types';
import { GraphView } from './projects/GraphView';

type Tab = 'files' | 'symbols' | 'graph' | 'impact';

export function Projects() {
  const { projects, currentProjectId, setProject, refreshProjects, toast, moduleEnabled } = useApp();
  const [tab, setTab] = useState<Tab>('files');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [summary, setSummary] = useState<GroundedSummary | null>(null);
  const [fileContent, setFileContent] = useState<{ content: string; truncated: boolean; language: string } | null>(null);
  const [query, setQuery] = useState('');
  const [symbols, setSymbols] = useState<SymbolRecord[]>([]);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [changes, setChanges] = useState<{ available: boolean; branch: string | null; changes: GitChange[]; message?: string } | null>(null);
  const [impactPaths, setImpactPaths] = useState<string[]>([]);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addPath, setAddPath] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const project = projects.find((p) => p.id === currentProjectId) ?? null;

  const loadTree = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const t = (await request('projects.tree', { projectId: currentProjectId })) as TreeNode[];
      setTree(t);
      setExpanded(new Set(t.filter((n) => n.type === 'dir').slice(0, 3).map((n) => n.path)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [currentProjectId]);

  const loadChanges = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      setChanges((await request('projects.changes', { projectId: currentProjectId })) as typeof changes);
    } catch {
      setChanges(null);
    }
  }, [currentProjectId]);

  useEffect(() => {
    void loadTree();
    void loadChanges();
    setSummary(null);
    setFileContent(null);
    setSelectedFile(null);
    setSymbols([]);
    setGraph(null);
    setImpact(null);
    void refreshProjects();
  }, [currentProjectId, loadTree, loadChanges, refreshProjects]);

  useEffect(() => {
    if (!currentProjectId) return;
    const t = setInterval(() => void refreshProjects(), 4000);
    return () => clearInterval(t);
  }, [currentProjectId, refreshProjects]);

  useEffect(() => {
    if (!currentProjectId) return;
    const run = async () => {
      try {
        const res = (await request('projects.symbols', {
          projectId: currentProjectId,
          query: query || undefined,
          limit: 200,
        })) as { items: SymbolRecord[]; total: number };
        setSymbols(res.items);
      } catch {
        setSymbols([]);
      }
    };
    const t = setTimeout(() => void run(), query ? 200 : 0);
    return () => clearTimeout(t);
  }, [currentProjectId, query]);

  const loadGraph = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      setGraph((await request('projects.graph', { projectId: currentProjectId })) as DependencyGraph);
    } catch (err) {
      toast('err', 'Graph unavailable', err instanceof Error ? err.message : String(err));
    }
  }, [currentProjectId, toast]);

  useEffect(() => {
    if (tab === 'graph' && !graph) void loadGraph();
  }, [tab, graph, loadGraph]);

  async function openFile(path: string) {
    if (!currentProjectId) return;
    setSelectedFile(path);
    setLoadingFile(true);
    try {
      const [s, f] = await Promise.all([
        request('projects.summary', { projectId: currentProjectId, path }) as Promise<GroundedSummary>,
        request('projects.file', { projectId: currentProjectId, path }) as Promise<{ content: string; truncated: boolean; language: string }>,
      ]);
      setSummary(s);
      setFileContent(f);
    } catch (err) {
      toast('err', 'Could not open the file', err instanceof Error ? err.message : String(err));
      setSummary(null);
      setFileContent(null);
    } finally {
      setLoadingFile(false);
    }
  }

  async function reindex() {
    if (!currentProjectId) return;
    setBusy(true);
    try {
      await request('projects.reindex', { projectId: currentProjectId });
      toast('ok', 'Re-index complete');
      await refreshProjects();
      await loadTree();
      await loadChanges();
      setGraph(null);
    } catch (err) {
      toast('err', 'Re-index failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addProject() {
    if (!addPath.trim()) return;
    setAddBusy(true);
    try {
      const created = (await request('projects.add', { path: addPath.trim() })) as Project;
      await refreshProjects();
      setProject(created.id);
      setShowAdd(false);
      setAddPath('');
      toast('ok', `Added ${created.name}`, 'Indexing started.');
    } catch (err) {
      toast('err', 'Could not add the project', err instanceof Error ? err.message : String(err));
    } finally {
      setAddBusy(false);
    }
  }

  async function removeProject(p: Project) {
    if (!confirm(`Remove "${p.name}" from ARQENIUM? The files on disk are not touched; only the local index is deleted.`)) return;
    try {
      await request('projects.remove', { projectId: p.id });
      await refreshProjects();
      toast('info', 'Project removed', 'The index was deleted. Your files are untouched.');
    } catch (err) {
      toast('err', 'Remove failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function runImpact(paths: string[]) {
    if (!currentProjectId || !paths.length) return;
    try {
      setImpact((await request('projects.impact', { projectId: currentProjectId, paths, depth: 3 })) as ImpactResult);
    } catch (err) {
      toast('err', 'Impact analysis failed', err instanceof Error ? err.message : String(err));
    }
  }

  if (!moduleEnabled('project-intelligence')) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Project Intelligence</h1>
          </div>
        </div>
        <Banner tone="warn" title="Module disabled">
          Project Intelligence is turned off. Enable it in Modules to scan and analyse repositories.
        </Banner>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Project Intelligence</h1>
          <p className="page-sub">
            Real AST-based indexing for TypeScript/JavaScript and Python: symbols, import edges, dependency graphs and
            reverse-dependency impact analysis. Hypotheses are labelled separately from parsed facts.
          </p>
        </div>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => setShowAdd(true)} icon={<IconFolderPlus size={13} />}>
            Add project
          </Button>
          <Button size="sm" onClick={() => void reindex()} loading={busy} disabled={!project} icon={<IconRefresh size={13} />}>
            Re-index
          </Button>
        </div>
      </div>

      {error ? (
        <Banner tone="err" title="Project error">
          {error}
        </Banner>
      ) : null}

      {!project ? (
        <div className="panel">
          <EmptyState
            icon={<IconFolderPlus size={20} />}
            title="No project registered"
            text="Point ARQENIUM at a local folder to build an index. Ignore rules, sensitive-file exclusions and binary detection are applied automatically."
            action={
              <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
                Add a project
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="panel">
            <div className="panel-head">
              <IconFolder size={15} style={{ color: 'var(--accent)' }} />
              <span className="panel-title">{project.name}</span>
              <span className="mono dim" style={{ fontSize: 11 }}>
                {project.rootPath}
              </span>
              <span className="spacer" />
              <Dot tone={project.indexState === 'ready' ? 'ok' : project.indexState === 'indexing' ? 'live' : project.indexState === 'error' ? 'err' : 'idle'} />
              <Tag tone={project.indexState === 'ready' ? 'ok' : project.indexState === 'indexing' ? 'info' : 'warn'}>{project.indexState}</Tag>
              {changes?.available ? (
                <Tag tone="info" title={changes.branch ? `Branch ${changes.branch}` : 'Git repository'}>
                  <IconGitBranch size={10} /> {changes.branch ?? 'git'}
                </Tag>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => void removeProject(project)} icon={<IconTrash size={13} />} title="Remove from ARQENIUM">
                Remove
              </Button>
            </div>
            <div className="panel-body">
              <div className="grid-4">
                <Meta label="Files indexed" value={project.indexStats.filesIndexed.toString()} sub={`${project.indexStats.filesDiscovered} discovered`} />
                <Meta label="Symbols" value={project.indexStats.symbols.toLocaleString()} sub="parsed declarations" />
                <Meta label="Import edges" value={project.indexStats.edges.toString()} sub="resolved + external" />
                <Meta label="Skipped" value={project.indexStats.filesSkipped.toString()} sub={`${project.indexStats.filesFailed} failed`} />
                <Meta label="Last indexed" value={timeAgo(project.lastIndexedAt)} sub={project.indexStats.durationMs ? formatDuration(project.indexStats.durationMs) : ''} />
              </div>
              <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(project.indexStats.languages).map(([lang, count]) => (
                  <Tag key={lang} tone="neutral">
                    {lang}: {count}
                  </Tag>
                ))}
                {changes?.available ? (
                  <Tag tone={changes.changes.length ? 'warn' : 'ok'}>
                    {changes.changes.length ? `${changes.changes.length} uncommitted change(s)` : 'working tree clean'}
                  </Tag>
                ) : (
                  <Tag tone="neutral">not a git repository</Tag>
                )}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="tabs">
              <button className={`tab ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')}>
                <IconFileCode size={13} /> Files & summaries
              </button>
              <button className={`tab ${tab === 'symbols' ? 'active' : ''}`} onClick={() => setTab('symbols')}>
                <IconSearch size={13} /> Symbols <span className="count">{symbols.length}</span>
              </button>
              <button className={`tab ${tab === 'graph' ? 'active' : ''}`} onClick={() => setTab('graph')}>
                <IconGraph size={13} /> Dependency graph
              </button>
              <button className={`tab ${tab === 'impact' ? 'active' : ''}`} onClick={() => setTab('impact')}>
                <IconTargetArrow size={13} /> Impact analysis
              </button>
            </div>

            {tab === 'files' ? (
              <div className="split" style={{ padding: 12 }}>
                <div style={{ maxHeight: 560, overflow: 'auto', border: '1px solid var(--line-1)', borderRadius: 6, background: 'var(--bg-1)' }}>
                  {tree.length === 0 ? (
                    <Loading label="Building the tree" />
                  ) : (
                    <TreeView nodes={tree} expanded={expanded} setExpanded={setExpanded} onOpen={openFile} selected={selectedFile} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  {!selectedFile ? (
                    <EmptyState icon={<IconFileCode size={20} />} title="Select a file" text="Choose a file from the tree to see its parsed symbols, imports and source." />
                  ) : loadingFile ? (
                    <Loading label="Reading file" />
                  ) : (
                    <div className="stack">
                      <div className="row">
                        <span className="mono" style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>
                          {selectedFile}
                        </span>
                        <span className="spacer" />
                        {summary ? <Tag tone={summary.quality === 'parsed' ? 'ok' : summary.quality === 'approximate' ? 'warn' : 'neutral'}>quality: {summary.quality}</Tag> : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<IconTargetArrow size={13} />}
                          onClick={() => {
                            setImpactPaths([selectedFile]);
                            void runImpact([selectedFile]);
                            setTab('impact');
                          }}
                        >
                          Analyse impact
                        </Button>
                      </div>
                      {summary ? (
                        <div className="grid-2">
                          <div className="panel" style={{ background: 'var(--bg-1)' }}>
                            <div className="panel-head">
                              <IconStack2 size={13} />
                              <span className="panel-title">Parsed symbols</span>
                              <span className="spacer" />
                              <span className="mono dim">{summary.symbolCount}</span>
                            </div>
                            <div style={{ maxHeight: 180, overflow: 'auto' }}>
                              {summary.symbols.length === 0 ? (
                                <div className="muted" style={{ padding: 12, fontSize: 12 }}>
                                  No symbols were extracted. {summary.notes.join(' ')}
                                </div>
                              ) : (
                                summary.symbols.map((s, i) => (
                                  <div key={i} className="list-item list-item-static" style={{ padding: '4px 12px', cursor: 'default' }}>
                                    <Tag>{s.kind}</Tag>
                                    <span className="mono" style={{ fontSize: 11.5 }}>
                                      {s.name}
                                    </span>
                                    <span className="spacer" />
                                    <span className="mono dim" style={{ fontSize: 10.5 }}>
                                      L{s.line}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="panel" style={{ background: 'var(--bg-1)' }}>
                            <div className="panel-head">
                              <IconArrowsSplit size={13} />
                              <span className="panel-title">Imports</span>
                              <span className="spacer" />
                              <span className="mono dim">{summary.importCount}</span>
                            </div>
                            <div style={{ maxHeight: 180, overflow: 'auto' }}>
                              {summary.imports.length === 0 ? (
                                <div className="muted" style={{ padding: 12, fontSize: 12 }}>
                                  No imports detected.
                                </div>
                              ) : (
                                summary.imports.map((im, i) => (
                                  <div key={i} className="list-item list-item-static" style={{ padding: '4px 12px', cursor: 'default' }}>
                                    <span className="mono truncate" style={{ fontSize: 11.5, flex: 1 }}>
                                      {im.moduleSpec}
                                    </span>
                                    {im.resolved ? <Tag tone="ok">resolved</Tag> : <Tag tone="neutral">external</Tag>}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {fileContent ? (
                        <div className="code-with-lines" style={{ maxHeight: 380 }}>
                          <div className="line-numbers">
                            {fileContent.content.split('\n').map((_, i) => (
                              <div key={i}>{i + 1}</div>
                            ))}
                          </div>
                          <div className="code-lines">{fileContent.content}</div>
                        </div>
                      ) : null}
                      {fileContent?.truncated ? (
                        <span className="muted" style={{ fontSize: 11.5 }}>
                          Preview truncated to the first portion of the file.
                        </span>
                      ) : null}
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {summary ? `${formatBytes(summary.bytes)} · ${summary.lines} lines · ${summary.language}` : ''}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {tab === 'symbols' ? (
              <div>
                <div style={{ padding: 12, borderBottom: '1px solid var(--line-1)' }}>
                  <div className="search-bar">
                    <IconSearch size={14} />
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search parsed symbols by name" />
                  </div>
                </div>
                {symbols.length === 0 ? (
                  <EmptyState icon={<IconSearch size={20} />} title="No matching symbols" text={query ? `Nothing matched "${query}".` : 'The index has no parsed symbols yet.'} />
                ) : (
                  <div className="table-wrap" style={{ maxHeight: 520 }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Kind</th>
                          <th>Container</th>
                          <th>File</th>
                          <th>Line</th>
                          <th>Exported</th>
                        </tr>
                      </thead>
                      <tbody>
                        {symbols.map((s) => (
                          <tr
                            key={s.id}
                            className="clickable"
                            onClick={() => {
                              void openFile(s.path);
                              setTab('files');
                            }}
                          >
                            <td className="mono" style={{ fontWeight: 500 }}>
                              {s.name}
                            </td>
                            <td>
                              <Tag>{s.kind}</Tag>
                            </td>
                            <td className="mono dim">{s.container ?? '-'}</td>
                            <td className="mono dim truncate" style={{ maxWidth: 320 }}>
                              {s.path}
                            </td>
                            <td className="mono dim">{s.line}</td>
                            <td>{s.exported ? <Tag tone="ok">exported</Tag> : <span className="dim">-</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === 'graph' ? (
              <div className="stack" style={{ padding: 12 }}>
                <div className="row">
                  <span className="muted" style={{ fontSize: 12 }}>
                    Parsed import graph. Solid edges are resolved project files; dashed nodes are external packages.
                  </span>
                  <span className="spacer" />
                  <Button size="sm" variant="ghost" onClick={() => void loadGraph()} icon={<IconRefresh size={13} />}>
                    Rebuild graph
                  </Button>
                </div>
                {graph ? <GraphView graph={graph} onSelect={(p) => { void openFile(p); }} /> : <Loading label="Building graph" />}
              </div>
            ) : null}

            {tab === 'impact' ? (
              <div className="stack" style={{ padding: 12 }}>
                <Field
                  label="Files to change (one per line)"
                  hint="Impact is computed from the parsed reverse dependency graph plus test-file heuristics. Each entry states whether it is parsed or heuristic."
                >
                  <textarea
                    className="textarea mono-input"
                    rows={4}
                    value={impactPaths.join('\n')}
                    onChange={(e) => setImpactPaths(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                    placeholder="src/core/orchestration/engine.ts"
                  />
                </Field>
                <div className="row">
                  <Button variant="primary" size="sm" onClick={() => void runImpact(impactPaths)} disabled={!impactPaths.length} icon={<IconTargetArrow size={13} />}>
                    Analyse impact
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const changed = (changes?.changes ?? []).map((c) => c.path);
                      setImpactPaths(changed);
                      void runImpact(changed);
                    }}
                    disabled={!changes?.changes?.length}
                  >
                    Use uncommitted changes ({changes?.changes.length ?? 0})
                  </Button>
                </div>
                {impact ? (
                  <div className="stack">
                    <div className="grid-3">
                      <Meta label="Source files" value={impact.source.length.toString()} sub="requested" />
                      <Meta label="Affected files" value={impact.affected.length.toString()} sub={impact.truncated ? 'truncated' : 'complete'} />
                      <Meta label="Related tests" value={impact.tests.length.toString()} sub="heuristic match" />
                    </div>
                    {impact.affected.length === 0 ? (
                      <Banner tone="ok" title="No dependents found">
                        Nothing in the parsed graph imports the selected files. Check whether the change is additive.
                      </Banner>
                    ) : (
                      <div className="table-wrap" style={{ maxHeight: 420 }}>
                        <table className="data">
                          <thead>
                            <tr>
                              <th>File</th>
                              <th>Depth</th>
                              <th>Confidence</th>
                              <th>Reason</th>
                              <th>Via</th>
                            </tr>
                          </thead>
                          <tbody>
                            {impact.affected.map((a) => (
                              <tr key={a.path} className="clickable" onClick={() => { void openFile(a.path); setTab('files'); }}>
                                <td className="mono truncate" style={{ maxWidth: 340 }}>
                                  {a.path}
                                  {a.isTest ? <Tag tone="info" >test</Tag> : null}
                                </td>
                                <td className="mono dim">{a.depth}</td>
                                <td>
                                  <Tag tone={a.confidence === 'parsed' ? 'ok' : 'warn'}>{a.confidence}</Tag>
                                </td>
                                <td className="muted" style={{ fontSize: 12 }}>
                                  {a.reason}
                                </td>
                                <td className="mono dim truncate" style={{ maxWidth: 200, fontSize: 11 }}>
                                  {a.via.join(' → ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {impact.tests.length ? (
                      <div>
                        <div className="section-label">Likely affected tests</div>
                        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                          {impact.tests.map((t) => (
                            <Tag key={t} tone="info">
                              {t}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}

      {showAdd ? (
        <Modal
          title="Add a local project"
          onClose={() => setShowAdd(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void addProject()} loading={addBusy} disabled={!addPath.trim()}>
                Add and index
              </Button>
            </>
          }
        >
          <Field label="Absolute folder path" hint="Dependency directories, build output, binaries and sensitive files such as .env are excluded automatically.">
            <div className="row">
              <TextInput value={addPath} onChange={setAddPath} placeholder="/home/you/code/project" mono />
              {canPickNative() ? (
                <Button
                  onClick={async () => {
                    const dir = await pickDirectory();
                    if (dir) setAddPath(dir);
                  }}
                  icon={<IconFolder size={14} />}
                >
                  Browse
                </Button>
              ) : null}
            </div>
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}

function Meta({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub ? (
        <div className="dim" style={{ fontSize: 11 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function TreeView({
  nodes,
  expanded,
  setExpanded,
  onOpen,
  selected,
  depth = 0,
}: {
  nodes: TreeNode[];
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
  onOpen: (p: string) => void;
  selected: string | null;
  depth?: number;
}) {
  const [limit, setLimit] = useState(400);
  const visible = useMemo(() => nodes.slice(0, limit), [nodes, limit]);
  return (
    <div>
      {visible.map((n) =>
        n.type === 'dir' ? (
          <div key={n.path}>
            <button
              className="file-row"
              style={{ paddingLeft: 6 + depth * 12 }}
              onClick={() => {
                const next = new Set(expanded);
                if (next.has(n.path)) next.delete(n.path);
                else next.add(n.path);
                setExpanded(next);
              }}
            >
              <IconChevronRight size={12} style={{ transform: expanded.has(n.path) ? 'rotate(90deg)' : 'none', transition: 'transform 120ms', color: 'var(--fg-4)' }} />
              <IconFolder size={13} style={{ color: 'var(--fg-3)' }} />
              <span className="truncate">{n.name}</span>
            </button>
            {expanded.has(n.path) && n.children ? (
              <TreeView nodes={n.children} expanded={expanded} setExpanded={setExpanded} onOpen={onOpen} selected={selected} depth={depth + 1} />
            ) : null}
          </div>
        ) : (
          <button
            key={n.path}
            className={`file-row ${selected === n.path ? 'selected' : ''}`}
            style={{ paddingLeft: 20 + depth * 12 }}
            onClick={() => onOpen(n.path)}
            title={n.path}
          >
            <IconFileCode size={12} style={{ color: 'var(--fg-4)' }} />
            <span className="truncate">{n.name}</span>
            {n.size ? (
              <span className="dim" style={{ fontSize: 10, marginLeft: 'auto' }}>
                {formatBytes(n.size)}
              </span>
            ) : null}
          </button>
        ),
      )}
      {nodes.length > limit ? (
        <button className="file-row" style={{ paddingLeft: 20 + depth * 12 }} onClick={() => setLimit((l) => l + 500)}>
          <span className="muted">Show more ({nodes.length - limit} remaining)</span>
        </button>
      ) : null}
    </div>
  );
}
