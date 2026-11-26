import { useCallback, useEffect, useState } from 'react';
import {
  IconChartHistogram,
  IconCheck,
  IconDownload,
  IconFlask,
  IconInfoCircle,
  IconPlus,
  IconRefresh,
  IconRepeat,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { request } from '../lib/bridge';
import {
  Banner,
  Button,
  EmptyState,
  Field,
  Loading,
  Modal,
  Select,
  Tag,
  TextArea,
  TextInput,
  formatDuration,
  timeAgo,
} from '../components/ui';
import type { EvalResult, EvalRun, EvalSuite } from '../lib/types';

export function Evaluation() {
  const { agents, currentProjectId, toast, moduleEnabled } = useApp();
  const [suites, setSuites] = useState<EvalSuite[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selectedSuite, setSelectedSuite] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<EvalRun | null>(null);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [agentId, setAgentId] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        request('evals.suites', {}) as Promise<EvalSuite[]>,
        request('evals.runs', { projectId: currentProjectId ?? undefined, limit: 50 }) as Promise<EvalRun[]>,
      ]);
      setSuites(s);
      setRuns(r);
      setSelectedSuite((cur) => cur ?? s[0]?.id ?? null);
      if (!selectedRun && r[0]) {
        setSelectedRun(r[0]);
      }
    } catch (err) {
      toast('err', 'Could not load evaluations', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [toast, selectedRun]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadResults = useCallback(async (evalRunId: string) => {
    try {
      setResults((await request('evals.results', { evalRunId })) as EvalResult[]);
    } catch {
      setResults([]);
    }
  }, []);

  useEffect(() => {
    if (selectedRun) void loadResults(selectedRun.id);
    else setResults([]);
  }, [selectedRun, loadResults]);

  async function runSuite(suiteId: string) {
    setRunning(true);
    try {
      const out = (await request('evals.run', {
        suiteId,
        projectId: currentProjectId ?? undefined,
        mode: agentId ? 'live' : 'demo',
        agentIds: agentId ? [agentId] : undefined,
      })) as { evalRun: EvalRun; results: EvalResult[] };
      setSelectedRun(out.evalRun);
      setResults(out.results);
      await load();
      toast('ok', 'Evaluation complete', `${out.evalRun.stats.passed}/${out.evalRun.stats.total} cases passed.`);
    } catch (err) {
      toast('err', 'Evaluation failed', err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function exportRun(format: 'json' | 'csv') {
    if (!selectedRun) return;
    try {
      const res = (await request('evals.export', { evalRunId: selectedRun.id, format })) as { content: string; filename: string };
      const blob = new Blob([res.content], { type: format === 'json' ? 'application/json' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast('ok', 'Exported', res.filename);
    } catch (err) {
      toast('err', 'Export failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteSuite(id: string) {
    if (!confirm('Delete this evaluation suite? Built-in suites cannot be deleted.')) return;
    try {
      await request('evals.suiteDelete', { id });
      await load();
      toast('info', 'Suite deleted');
    } catch (err) {
      toast('err', 'Delete failed', err instanceof Error ? err.message : String(err));
    }
  }

  if (!moduleEnabled('evaluation')) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Evaluation Lab</h1>
          </div>
        </div>
        <Banner tone="warn" title="Module disabled">
          The evaluation module is off. Enable it in Modules.
        </Banner>
      </div>
    );
  }

  const suite = suites.find((s) => s.id === selectedSuite) ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Evaluation Lab</h1>
          <p className="page-sub">
            Deterministic cases run fully offline against fixtures and the live index. AI cases execute through the real
            orchestration engine; the objective task status is stored separately from the heuristic criteria judgment,
            so a pass is never presented as a fabricated quality score.
          </p>
        </div>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => void load()} icon={<IconRefresh size={13} />}>
            Refresh
          </Button>
          <Button variant="primary" onClick={() => setShowCreate(true)} icon={<IconPlus size={14} />}>
            New suite
          </Button>
        </div>
      </div>

      {loading ? (
        <Loading label="Loading suites" />
      ) : (
        <div className="split">
          <div className="panel" style={{ maxHeight: 'calc(100vh - 220px)', display: 'flex', flexDirection: 'column' }}>
            <div className="panel-head">
              <span className="panel-title">Suites</span>
              <span className="spacer" />
              <span className="mono dim">{suites.length}</span>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <div className="list">
                {suites.map((s) => (
                  <button key={s.id} className={`list-item ${selectedSuite === s.id ? 'selected' : ''}`} onClick={() => setSelectedSuite(s.id)}>
                    <IconFlask size={14} style={{ color: 'var(--fg-3)' }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>
                        {s.name}
                      </div>
                      <div className="mono dim" style={{ fontSize: 10.5 }}>
                        {s.cases.length} cases · {s.kind}
                      </div>
                    </div>
                    {s.builtin ? <Tag tone="accent">built-in</Tag> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="stack">
            {!suite ? (
              <div className="panel">
                <EmptyState icon={<IconFlask size={20} />} title="Select a suite" text="Choose an evaluation suite to inspect its cases." />
              </div>
            ) : (
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">{suite.name}</span>
                  <Tag tone={suite.kind === 'deterministic' ? 'ok' : 'info'}>{suite.kind}</Tag>
                  <span className="spacer" />
                  {!suite.builtin ? (
                    <Button size="sm" variant="ghost" onClick={() => void deleteSuite(suite.id)} icon={<IconTrash size={13} />} title="Delete suite" />
                  ) : null}
                  <Button variant="primary" size="sm" onClick={() => void runSuite(suite.id)} loading={running} icon={<IconChartHistogram size={13} />}>
                    Run suite
                  </Button>
                </div>
                <div className="panel-body stack">
                  <p className="page-sub">{suite.description}</p>
                  <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ width: 260 }}>
                      <Field label="Agent for AI cases" hint="Simulation-only cases run without an agent. Selecting an agent runs AI cases live.">
                        <Select
                          value={agentId}
                          onChange={setAgentId}
                          options={[{ value: '', label: 'None (deterministic cases only)' }, ...agents.map((a) => ({ value: a.id, label: `${a.name}${a.modelRef ? '' : ' (demo)'}` }))]}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Case</th>
                          <th>Kind</th>
                          <th>Criteria</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suite.cases.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 500 }}>{c.name}</td>
                            <td>
                              <Tag tone={c.kind === 'deterministic' ? 'ok' : 'info'}>{c.kind}</Tag>
                            </td>
                            <td className="muted" style={{ fontSize: 12 }}>
                              {c.criteria || c.description}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">Recent evaluation runs</span>
                <span className="spacer" />
                {selectedRun ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => void exportRun('json')} icon={<IconDownload size={13} />}>
                      JSON
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void exportRun('csv')} icon={<IconDownload size={13} />}>
                      CSV
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void request('evals.rerun', { evalRunId: selectedRun.id }).then(() => load())} icon={<IconRepeat size={13} />}>
                      Re-run
                    </Button>
                  </>
                ) : null}
              </div>
              {runs.length === 0 ? (
                <EmptyState icon={<IconChartHistogram size={20} />} title="No evaluation runs yet" text="Run a suite to record measurable results." />
              ) : (
                <div className="table-wrap" style={{ maxHeight: 260 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Suite</th>
                        <th>Mode</th>
                        <th>Passed</th>
                        <th>Failed</th>
                        <th>Errors</th>
                        <th>Duration</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.id} className={`clickable ${selectedRun?.id === r.id ? 'selected' : ''}`} onClick={() => setSelectedRun(r)}>
                          <td style={{ fontWeight: 500 }}>{r.suiteName}</td>
                          <td>
                            <Tag tone={r.mode === 'live' ? 'ok' : 'warn'}>{r.mode}</Tag>
                          </td>
                          <td className="mono" style={{ color: 'var(--ok)' }}>
                            {r.stats.passed}/{r.stats.total}
                          </td>
                          <td className="mono" style={{ color: r.stats.failed ? 'var(--err)' : 'var(--fg-4)' }}>
                            {r.stats.failed}
                          </td>
                          <td className="mono" style={{ color: r.stats.errors ? 'var(--warn)' : 'var(--fg-4)' }}>
                            {r.stats.errors}
                          </td>
                          <td className="mono dim">{formatDuration(r.stats.durationMs)}</td>
                          <td className="mono dim">{timeAgo(r.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedRun ? (
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Results · {selectedRun.suiteName}</span>
                  <span className="spacer" />
                  {results.length ? (
                    <div className="bar-track" style={{ width: 160 }}>
                      <div className="bar-ok" style={{ width: `${(selectedRun.stats.passed / Math.max(1, selectedRun.stats.total)) * 100}%` }} />
                      <div className="bar-err" style={{ width: `${(selectedRun.stats.failed / Math.max(1, selectedRun.stats.total)) * 100}%` }} />
                      <div className="bar-skip" style={{ width: `${((selectedRun.stats.skipped + selectedRun.stats.errors) / Math.max(1, selectedRun.stats.total)) * 100}%` }} />
                    </div>
                  ) : null}
                  <span className="mono dim">
                    {selectedRun.stats.passed} pass / {selectedRun.stats.failed} fail / {selectedRun.stats.errors} err / {selectedRun.stats.skipped} skip
                  </span>
                </div>
                {results.length === 0 ? (
                  <EmptyState icon={<IconInfoCircle size={20} />} title="No results stored" text="This run produced no case results." />
                ) : (
                  <div>
                    {results.map((r) => (
                      <div key={r.id} className="result-row">
                        <div style={{ minWidth: 0 }}>
                          <div className="row" style={{ gap: 6 }}>
                            {r.status === 'pass' ? <IconCheck size={13} style={{ color: 'var(--ok)' }} /> : <IconX size={13} style={{ color: r.status === 'fail' ? 'var(--err)' : 'var(--warn)' }} />}
                            <span style={{ fontWeight: 500, fontSize: 12.5 }}>{r.caseName}</span>
                            {r.agentId ? <Tag tone="neutral">agent</Tag> : null}
                          </div>
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                            <strong>objective:</strong> {r.objective}
                          </div>
                          {r.subjective ? (
                            <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                              <strong>judgment:</strong> {r.subjective}
                            </div>
                          ) : null}
                          {r.error ? (
                            <div style={{ fontSize: 11.5, color: 'var(--err)', marginTop: 1 }}>{r.error}</div>
                          ) : null}
                        </div>
                        <div>
                          <Tag tone={r.status === 'pass' ? 'ok' : r.status === 'fail' ? 'err' : r.status === 'error' ? 'warn' : 'neutral'}>{r.status}</Tag>
                        </div>
                        <div className="mono dim" style={{ fontSize: 11 }}>
                          {formatDuration(r.durationMs)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="panel-foot">
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    Objective = machine-checked outcome. Judgment = heuristic text check against the declared criteria;
                    it is not a semantic model grade and no benchmark score is claimed.
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {showCreate ? (
        <NewSuiteModal
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false);
            await load();
            toast('ok', 'Suite created');
          }}
          onError={(m) => toast('err', 'Could not create the suite', m)}
        />
      ) : null}
    </div>
  );
}

function NewSuiteModal({ onClose, onSaved, onError }: { onClose: () => void; onSaved: () => Promise<void>; onError: (m: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'deterministic' | 'ai' | 'mixed'>('deterministic');
  const [casesText, setCasesText] = useState('Fixture contains expected markers|fixture_content|fixturePath=tests/fixtures/fixture-app/src/index.ts;contains=createServer');
  const [busy, setBusy] = useState(false);

  function parseCases() {
    return casesText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [caseName, caseKind, config] = line.split('|').map((s) => s.trim());
        const cfg: Record<string, unknown> = {};
        if (config) {
          for (const pair of config.split(';')) {
            const [k, v] = pair.split('=').map((s) => s.trim());
            if (!k) continue;
            if (k === 'contains' || k === 'notContains') cfg[k] = v.split(',');
            else if (k === 'minLines' || k === 'minFiles' || k === 'minSymbols' || k === 'minResults') cfg[k] = Number(v);
            else cfg[k] = v;
          }
        }
        if (cfg.fixturePath || cfg.fixture) cfg.type = 'fixture_content';
        return {
          name: caseName || 'Untitled case',
          description: '',
          kind: (caseKind === 'ai' ? 'ai' : 'deterministic') as 'ai' | 'deterministic',
          config: cfg,
          criteria: '',
        };
      });
  }

  async function save() {
    setBusy(true);
    try {
      await request('evals.suiteCreate', { name: name.trim(), description, kind, cases: parseCases() });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New evaluation suite"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!name.trim() || !parseCases().length}>
            Create suite
          </Button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Suite name">
          <TextInput value={name} onChange={setName} placeholder="e.g. Regression checks" />
        </Field>
        <Field label="Suite kind">
          <Select
            value={kind}
            onChange={(v) => setKind(v as 'deterministic' | 'ai' | 'mixed')}
            options={[
              { value: 'deterministic', label: 'Deterministic' },
              { value: 'ai', label: 'AI' },
              { value: 'mixed', label: 'Mixed' },
            ]}
          />
        </Field>
      </div>
      <Field label="Description">
        <TextInput value={description} onChange={setDescription} placeholder="What does this suite verify?" />
      </Field>
      <Field
        label="Cases (one per line)"
        hint="Format: name | kind | key=value;key=value. Deterministic types: fixture_content (fixturePath, contains, notContains, minLines), project_index, symbol_search, no_secret_leak."
      >
        <TextArea value={casesText} onChange={setCasesText} rows={6} mono />
      </Field>
      <Banner tone="info">
        Custom suites are stored locally. A deterministic case never claims model quality - it checks real fixture or
        index content.
      </Banner>
    </Modal>
  );
}
