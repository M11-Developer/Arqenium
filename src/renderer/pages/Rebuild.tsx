import { useCallback, useEffect, useState } from 'react';
import {
  IconCamera,
  IconCheck,
  IconCode,
  IconDeviceDesktop,
  IconDownload,
  IconEye,
  IconLink,
  IconPalette,
  IconRefresh,
  IconRuler,
  IconTrash,
  IconTypography,
  IconWindowMaximize,
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
  Tag,
  TextInput,
  formatDateTime,
  timeAgo,
} from '../components/ui';
import type { RebuildAnalysis, RebuildCapture } from '../lib/types';

interface Facts {
  width: number;
  height: number;
  format: string;
  palette: Array<{ hex: string; share: number }>;
  dominantBackground: string;
  dominantText: string;
  bands: Array<{ y: number; height: number; fill: string }>;
  gutter: { left: number; right: number; contentWidth: number; contentRatio: number };
  whitespaceRatio: number;
  edgeDensity: number;
  contrastRatio: number;
  notes: string[];
}

interface Inferred {
  layoutModel: string;
  confidence: 'low' | 'medium';
  spacingScale: number[];
  typography: Array<{ role: string; sizePx: number; weight: number; rationale: string }>;
  components: Array<{ name: string; rationale: string }>;
  designTokens: Record<string, string>;
  breakpoints: Array<{ name: string; width: number; rationale: string }>;
}

interface ExportPreview {
  approvalId: string;
  targetDir: string;
  files: Array<{ path: string; bytes: number; preview: string }>;
}

export function Rebuild() {
  const { currentProjectId, moduleEnabled, projects, toast } = useApp();
  const [captures, setCaptures] = useState<RebuildCapture[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RebuildAnalysis | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState<ExportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [targetDir, setTargetDir] = useState('rebuild');
  const project = projects.find((p) => p.id === currentProjectId) ?? null;

  const load = useCallback(async () => {
    try {
      const list = (await request('rebuild.captures', currentProjectId ? { projectId: currentProjectId } : {})) as RebuildCapture[];
      setCaptures(list);
      setSelected((cur) => cur ?? list[0]?.id ?? null);
    } catch (err) {
      toast('err', 'Could not load captures', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = captures.find((c) => c.id === selected) ?? null;

  async function analyze(captureId: string) {
    setBusy(captureId);
    try {
      const res = (await request('rebuild.analyze', { captureId })) as RebuildAnalysis;
      setAnalysis(res);
      setPreviewHtml(null);
      toast('ok', 'Reference analysed', `${res.warnings.length} documented caveat(s).`);
    } catch (err) {
      toast('err', 'Analysis failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function generate(analysisId: string) {
    setBusy('preview');
    try {
      const res = (await request('rebuild.preview', { analysisId })) as { html: string; estimatedFiles: Array<{ path: string; content: string }> };
      setPreviewHtml(res.html);
      toast('ok', 'Preview generated', `${res.estimatedFiles.length} estimated file(s).`);
    } catch (err) {
      toast('err', 'Preview failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function startExport(analysisId: string) {
    if (!currentProjectId) return;
    setBusy('export');
    try {
      const res = (await request('rebuild.exportPreview', { analysisId, projectId: currentProjectId, targetDir })) as ExportPreview;
      setExportPreview(res);
    } catch (err) {
      toast('err', 'Export preparation failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function confirmExport() {
    if (!exportPreview) return;
    setBusy('export');
    try {
      await request('approvals.decide', { id: exportPreview.approvalId, approved: true, decidedBy: 'user', reason: 'approved rebuild export' });
      const res = (await request('rebuild.exportCommit', { approvalId: exportPreview.approvalId })) as { written: string[] };
      setExportPreview(null);
      toast('ok', 'Reconstruction exported', `${res.written.length} file(s) written into the project.`);
    } catch (err) {
      toast('err', 'Export failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function removeCapture(id: string) {
    if (!confirm('Remove this reference and its analyses?')) return;
    try {
      await request('rebuild.captureDelete', { id });
      setAnalysis(null);
      setPreviewHtml(null);
      await load();
    } catch (err) {
      toast('err', 'Remove failed', err instanceof Error ? err.message : String(err));
    }
  }

  if (!moduleEnabled('rebuild-studio')) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">Rebuild Studio</h1>
            <p className="page-sub">Visual reconstruction from references you own or are authorised to reproduce.</p>
          </div>
        </div>
        <Banner tone="warn" title="Rebuild Studio is disabled">
          This optional module is off by default. When enabled it measures real visual facts (palette, bands, gutter,
          contrast) from screenshots you supply, or reads the markup of a publicly accessible page, and produces a
          clearly-labelled implementation estimate.
        </Banner>
      </div>
    );
  }

  const facts = analysis ? (analysis.extracted as unknown as Facts) : null;
  const inferred = analysis ? (analysis.inferred as unknown as Inferred) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Rebuild Studio</h1>
          <p className="page-sub">
            Measured facts and inferred implementation are always shown separately. ARQENIUM does not copy proprietary
            source, does not bypass authentication or anti-bot controls, and never presents an estimate as the original
            code.
          </p>
        </div>
        <div className="row">
          <Button size="sm" onClick={() => setShowScreenshot(true)} icon={<IconCamera size={13} />}>
            Add screenshot
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowUrl(true)} icon={<IconLink size={13} />}>
            Capture page
          </Button>
        </div>
      </div>

      {loading ? (
        <Loading label="Loading references" />
      ) : (
        <div className="split">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">References</span>
              <span className="spacer" />
              <Button size="sm" variant="ghost" onClick={() => void load()} icon={<IconRefresh size={13} />} title="Reload" />
            </div>
            {captures.length === 0 ? (
              <EmptyState icon={<IconWindowMaximize size={20} />} title="No references" text="Add a screenshot of an interface you own, or capture a public page you are authorised to reproduce." />
            ) : (
              <div className="list">
                {captures.map((c) => (
                  <div key={c.id} className={`list-item ${selected === c.id ? 'selected' : ''}`} style={{ cursor: 'pointer' }} onClick={() => { setSelected(c.id); setAnalysis(null); setPreviewHtml(null); }}>
                    {c.kind === 'screenshot' ? <IconDeviceDesktop size={13} style={{ color: 'var(--fg-3)' }} /> : <IconLink size={13} style={{ color: 'var(--fg-3)' }} />}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>
                        {c.source}
                      </div>
                      <div className="mono dim" style={{ fontSize: 10.5 }}>
                        {c.kind} · {timeAgo(c.createdAt)}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Remove reference"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeCapture(c.id);
                      }}
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="stack">
            {!current ? (
              <div className="panel">
                <EmptyState icon={<IconWindowMaximize size={20} />} title="Select a reference" text="Choose a capture to analyse it." />
              </div>
            ) : (
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">{current.source}</span>
                  <Tag tone={current.kind === 'screenshot' ? 'neutral' : 'info'}>{current.kind}</Tag>
                  <span className="spacer" />
                  <Button size="sm" variant="primary" onClick={() => void analyze(current.id)} loading={busy === current.id} icon={<IconEye size={13} />}>
                    Analyse
                  </Button>
                </div>
                <div className="panel-body">
                  <dl className="kv">
                    <dt>Captured</dt>
                    <dd>{formatDateTime(current.createdAt)}</dd>
                    {current.meta && (current.meta as any).width ? (
                      <>
                        <dt>Dimensions</dt>
                        <dd className="mono">
                          {(current.meta as any).width} x {(current.meta as any).height} ({(current.meta as any).format})
                        </dd>
                      </>
                    ) : null}
                    {current.path ? (
                      <>
                        <dt>Stored copy</dt>
                        <dd className="mono truncate" style={{ fontSize: 11.5 }}>
                          {current.path}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              </div>
            )}

            {analysis && facts && inferred ? (
              <>
                <div className="panel">
                  <div className="panel-head">
                    <span className="panel-title">Measured facts</span>
                    <Tag tone="ok">from pixels / markup</Tag>
                    <span className="spacer" />
                    <Button size="sm" variant="ghost" onClick={() => void generate(analysis.id)} loading={busy === 'preview'} icon={<IconCode size={13} />}>
                      Generate preview
                    </Button>
                  </div>
                  <div className="panel-body stack">
                    <div className="grid-4">
                      <Metric icon={<IconRuler size={12} />} label="Canvas" value={facts.width ? `${facts.width} x ${facts.height}` : 'markup'} />
                      <Metric icon={<IconPalette size={12} />} label="Contrast" value={facts.contrastRatio ? `${facts.contrastRatio}:1` : 'n/a'} />
                      <Metric label="Bands" value={String(facts.bands?.length ?? 0)} />
                      <Metric label="Content width" value={facts.gutter ? `${facts.gutter.contentWidth}px` : 'n/a'} />
                    </div>
                    {facts.palette?.length ? (
                      <div>
                        <div className="section-label">Extracted palette</div>
                        <div className="swatch-grid">
                          {facts.palette.slice(0, 10).map((p) => (
                            <div key={p.hex} className="swatch">
                              <div className="swatch-color" style={{ background: p.hex }} />
                              <div className="swatch-meta">
                                <span>{p.hex}</span>
                                <span>{(p.share * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {facts.bands?.length ? (
                      <div>
                        <div className="section-label">Measured horizontal bands</div>
                        <div className="stack-2">
                          {facts.bands.slice(0, 12).map((b, i) => (
                            <div key={i} className="row" style={{ gap: 8 }}>
                              <span className="mono dim" style={{ width: 70, fontSize: 11 }}>
                                y={b.y}
                              </span>
                              <div className="band-bar" style={{ background: b.fill, flex: 1 }} />
                              <span className="mono dim" style={{ width: 60, textAlign: 'right', fontSize: 11 }}>
                                {b.height}px
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {facts.notes?.join(' ')}
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <span className="panel-title">Inferred implementation</span>
                    <Tag tone={inferred.confidence === 'medium' ? 'warn' : 'neutral'}>confidence: {inferred.confidence}</Tag>
                    <span className="spacer" />
                    <Button size="sm" onClick={() => void startExport(analysis.id)} loading={busy === 'export'} disabled={!currentProjectId} icon={<IconDownload size={13} />}>
                      Export to project
                    </Button>
                  </div>
                  <div className="panel-body stack">
                    <dl className="kv">
                      <dt>Layout model</dt>
                      <dd>{inferred.layoutModel}</dd>
                      <dt>Spacing scale</dt>
                      <dd className="mono">{inferred.spacingScale.join(', ')}px</dd>
                    </dl>
                    <div>
                      <div className="section-label">
                        <IconTypography size={12} /> Typography estimate
                      </div>
                      <div className="stack-2">
                        {inferred.typography.map((t) => (
                          <div key={t.role} className="row" style={{ gap: 8 }}>
                            <Tag>{t.role}</Tag>
                            <span className="mono" style={{ fontSize: 11.5 }}>
                              {t.sizePx}px / {t.weight}
                            </span>
                            <span className="muted" style={{ fontSize: 11 }}>
                              {t.rationale}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="section-label">Estimated components</div>
                      <div className="stack-2">
                        {inferred.components.map((c) => (
                          <div key={c.name} className="row" style={{ gap: 8 }}>
                            <Tag tone="accent">{c.name}</Tag>
                            <span className="muted" style={{ fontSize: 11.5 }}>
                              {c.rationale}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="section-label">Design tokens</div>
                      <pre className="code-block" style={{ maxHeight: 200 }}>
                        {Object.entries(inferred.designTokens)
                          .map(([k, v]) => `${k}: ${v};`)
                          .join('\n')}
                      </pre>
                    </div>
                    {analysis.warnings.length ? (
                      <Banner tone="warn" title="Documented caveats">
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {analysis.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </Banner>
                    ) : null}
                  </div>
                </div>

                {previewHtml ? (
                  <div className="panel">
                    <div className="panel-head">
                      <span className="panel-title">Preview</span>
                      <span className="spacer" />
                      {analysis.warnings.length ? <Tag tone="warn">estimated reconstruction</Tag> : null}
                    </div>
                    <div className="panel-body">
                      <iframe className="preview-frame" title="Reconstruction preview" sandbox="" srcDoc={previewHtml} />
                      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                        The preview runs in a sandboxed frame with no script execution and no network access. It is
                        generated from measured facts and labelled estimates - not a copy of the original site.
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      )}

      {showScreenshot ? (
        <ScreenshotModal
          projectId={currentProjectId}
          onClose={() => setShowScreenshot(false)}
          onSaved={async () => {
            setShowScreenshot(false);
            await load();
            toast('ok', 'Reference captured');
          }}
          onError={(m) => toast('err', 'Capture failed', m)}
        />
      ) : null}

      {showUrl ? (
        <UrlModal
          projectId={currentProjectId}
          onClose={() => setShowUrl(false)}
          onSaved={async () => {
            setShowUrl(false);
            await load();
            toast('ok', 'Page captured');
          }}
          onError={(m) => toast('err', 'Capture failed', m)}
        />
      ) : null}

      {exportPreview ? (
        <Modal
          title="Approve reconstruction export"
          onClose={() => setExportPreview(null)}
          wide
          footer={
            <>
              <Button variant="ghost" onClick={() => setExportPreview(null)} icon={<IconX size={14} />}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void confirmExport()} loading={busy === 'export'} icon={<IconCheck size={14} />}>
                Write {exportPreview.files.length} file(s)
              </Button>
            </>
          }
        >
          <Banner tone="warn" title="Nothing is written until you confirm">
            The files below will be created inside <span className="mono">{project?.name}</span>. Existing files at the
            same paths are overwritten.
          </Banner>
          <Field label="Target directory" hint="Relative to the project root.">
            <TextInput value={targetDir} onChange={setTargetDir} mono />
          </Field>
          <div className="stack-2">
            {exportPreview.files.map((f) => (
              <div key={f.path} className="task-card">
                <div className="task-card-head">
                  <span className="mono" style={{ fontSize: 12 }}>
                    {f.path}
                  </span>
                  <span className="spacer" />
                  <span className="mono dim" style={{ fontSize: 10.5 }}>
                    {f.bytes} bytes
                  </span>
                </div>
                <pre className="code-block" style={{ maxHeight: 120, fontSize: 11 }}>
                  {f.preview}
                </pre>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Metric({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function ScreenshotModal({
  projectId,
  onClose,
  onSaved,
  onError,
}: {
  projectId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState('');
  const [base64, setBase64] = useState('');
  const [mime, setMime] = useState<'image/png' | 'image/jpeg'>('image/png');
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      onError('Only PNG and JPEG references are supported.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      onError('Image is larger than 12 MB.');
      return;
    }
    setMime(file.type as 'image/png' | 'image/jpeg');
    if (!name) setName(file.name);
    const buf = await file.arrayBuffer();
    // Chunked conversion keeps large buffers off the call stack.
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    setBase64(btoa(binary));
  }

  async function save() {
    setBusy(true);
    try {
      await request('rebuild.captureScreenshot', {
        projectId,
        name: name.trim() || 'reference',
        dataBase64: base64,
        mime,
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add a screenshot reference"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!base64}>
            Capture
          </Button>
        </>
      }
    >
      <Banner tone="info" title="Only use references you are authorised to reproduce">
        ARQENIUM measures the pixels you give it and stores a local copy. Do not use screenshots of interfaces whose
        visual design you may not reproduce.
      </Banner>
      <Field label="Reference image" hint="PNG or JPEG, up to 12 MB. The file is read in the browser/desktop renderer and sent to the local core - it is never uploaded anywhere else.">
        <input
          type="file"
          accept="image/png,image/jpeg"
          className="input"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          style={{ paddingTop: 5 }}
        />
      </Field>
      <Field label="Label">
        <TextInput value={name} onChange={setName} placeholder="Marketing homepage v2" />
      </Field>
      {base64 ? (
        <div className="row">
          <Tag tone="ok">loaded</Tag>
          <span className="mono dim" style={{ fontSize: 11 }}>
            {mime} · {Math.round((base64.length * 3) / 4 / 1024)} KB
          </span>
        </div>
      ) : null}
    </Modal>
  );
}

function UrlModal({
  projectId,
  onClose,
  onSaved,
  onError,
}: {
  projectId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await request('rebuild.captureUrl', { projectId, url: url.trim() });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Capture a public page"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!url.trim()}>
            Fetch and store markup
          </Button>
        </>
      }
    >
      <Banner tone="warn" title="Access rules are enforced">
        Only publicly reachable http(s) pages are fetched. Responses with 401/403 are refused, loopback and private
        addresses are blocked, and only HTML is accepted.
      </Banner>
      <Field label="Page URL">
        <TextInput value={url} onChange={setUrl} placeholder="https://example.com" mono />
      </Field>
    </Modal>
  );
}
