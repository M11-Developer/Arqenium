import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { ModuleService } from '../modules';
import type { ApprovalService } from '../approvals';
import type { ProjectService } from '../projects/service';
import type { RebuildAnalysis, RebuildCapture } from '../../shared/types';
import { decodeImage, extractFacts, inferLayout, renderPreview, escapeHtml, type ExtractedFacts, type InferredLayout } from './analyze';
import { newId, nowIso } from '../../shared/ids';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

export interface ExportPreview {
  approvalId: string;
  targetDir: string;
  files: Array<{ path: string; bytes: number; preview: string }>;
}

/**
 * Rebuild Studio: measured reproduction support for interfaces the user owns or
 * is authorised to reproduce. It never fetches authenticated or protected
 * content, never copies proprietary source, and always labels output as an
 * estimate derived from pixels/markup the user supplied.
 */
export class RebuildService {
  constructor(
    private db: Db,
    private events: EventBus,
    private modules: ModuleService,
    private approvals: ApprovalService,
    private projects: ProjectService,
    private dataDir: string,
  ) {}

  listCaptures(projectId?: string): RebuildCapture[] {
    this.modules.requireEnabled('rebuild-studio');
    const rows = (projectId
      ? this.db.prepare('SELECT * FROM rebuild_captures WHERE project_id = ? OR project_id IS NULL ORDER BY created_at DESC').all(projectId)
      : this.db.prepare('SELECT * FROM rebuild_captures ORDER BY created_at DESC').all()) as any[];
    return rows.map(rowToCapture);
  }

  getCapture(id: string): RebuildCapture {
    const row = this.db.prepare('SELECT * FROM rebuild_captures WHERE id = ?').get(id) as any;
    if (!row) throw new Error(`Capture ${id} not found`);
    return rowToCapture(row);
  }

  // ------------------------------------------------------------- captures

  captureScreenshot(input: {
    projectId?: string | null;
    name: string;
    buffer: Buffer;
    mime: 'image/png' | 'image/jpeg';
  }): RebuildCapture {
    this.modules.requireEnabled('rebuild-studio');
    if (!input.buffer.length) throw new Error('The uploaded image is empty');
    if (input.buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (${input.buffer.length} bytes, max ${MAX_IMAGE_BYTES})`);
    }
    const declared = input.mime === 'image/jpeg' ? 'jpeg' : 'png';
    const img = decodeImage(input.buffer);
    // Trust the decoded format over the client-declared mime type.
    if (img.format !== declared) {
      throw new Error(`Declared type ${input.mime} does not match the decoded format ${img.format}`);
    }
    const captureId = newId('cap');
    const storedPath = this.storeBuffer(captureId, img.format === 'png' ? '.png' : '.jpg', input.buffer);
    const now = nowIso();
    this.db
      .prepare('INSERT INTO rebuild_captures (id, project_id, kind, source, path, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        captureId,
        input.projectId ?? null,
        'screenshot',
        input.name.slice(0, 200),
        storedPath,
        JSON.stringify({ width: img.width, height: img.height, format: img.format, bytes: input.buffer.length }),
        now,
      );
    this.events.emit({
      type: 'rebuild.capture.created',
      message: `Reference captured: ${input.name} (${img.width}x${img.height})`,
      projectId: input.projectId ?? undefined,
      data: { captureId, width: img.width, height: img.height },
      source: 'rebuild',
    });
    return this.getCapture(captureId);
  }

  /**
   * Capture an authorised public page for reference. Refuses non-http schemes,
   * local/private hosts, authenticated responses and non-HTML content.
   */
  async captureUrl(input: { projectId: string | null; url: string }): Promise<RebuildCapture> {
    this.modules.requireEnabled('rebuild-studio');
    const url = new URL(input.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http and https URLs can be captured');
    }
    if (isPrivateHost(url.hostname)) {
      throw new Error('Refusing to capture a private, loopback or link-local address');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'ARQENIUM-RebuildStudio/0.1 (+reference capture; honours robots.txt)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    clearTimeout(timer);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Refusing to bypass access control (HTTP ${res.status}). Only publicly accessible pages may be captured.`);
    }
    if (!res.ok) throw new Error(`Fetch failed with HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/html')) throw new Error(`Unsupported content type "${type}"; only HTML pages can be analysed.`);
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_HTML_BYTES) throw new Error('Page is too large to analyse');
    const html = await res.text();
    if (html.length > MAX_HTML_BYTES) throw new Error('Page is too large to analyse');

    const extracted = extractFromHtml(html);
    const captureId = newId('cap');
    const now = nowIso();
    this.db
      .prepare('INSERT INTO rebuild_captures (id, project_id, kind, source, path, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        captureId,
        input.projectId,
        'url',
        url.toString(),
        null,
        JSON.stringify({ html, extracted, fetchedAt: now, bytes: html.length }),
        now,
      );
    this.events.emit({
      type: 'rebuild.capture.created',
      message: `Authorised page captured: ${url.host}`,
      projectId: input.projectId ?? undefined,
      data: { captureId, host: url.host },
      source: 'rebuild',
    });
    return this.getCapture(captureId);
  }

  deleteCapture(id: string): void {
    this.modules.requireEnabled('rebuild-studio');
    this.db.prepare('DELETE FROM rebuild_captures WHERE id = ?').run(id);
  }

  // ------------------------------------------------------------- analysis

  analyze(captureId: string): RebuildAnalysis {
    this.modules.requireEnabled('rebuild-studio');
    const capture = this.getCapture(captureId);
    let extracted: Record<string, unknown>;
    let inferred: InferredLayout;
    const warnings: string[] = [];

    if (capture.kind === 'screenshot') {
      if (!capture.path || !existsSync(capture.path)) throw new Error('The stored reference image is missing');
      const buffer = readFileSync(capture.path);
      const facts = extractFacts(decodeImage(buffer));
      inferred = inferLayout(facts);
      extracted = facts as unknown as Record<string, unknown>;
      if (facts.contrastRatio < 3) warnings.push(`Measured text/background contrast is only ${facts.contrastRatio}:1 - verify accessibility before shipping.`);
      if (facts.edgeDensity < 0.01) warnings.push('Very low edge density: the reference may be mostly empty or a solid colour.');
      warnings.push('Colour roles, semantic structure and interaction states cannot be measured from pixels and are inferred.');
    } else {
      const meta = capture.meta as { extracted?: Record<string, unknown>; html?: string };
      if (!meta.extracted) throw new Error('Capture has no stored markup analysis');
      extracted = meta.extracted;
      inferred = inferFromHtml(meta.extracted);
      warnings.push('Markup was read from the captured HTML; computed CSS, fonts and images are not resolved.');
      warnings.push('This is a structural estimate, not a copy of the original stylesheet.');
    }

    const id = newId('analysis');
    this.db
      .prepare('INSERT INTO rebuild_analyses (id, capture_id, project_id, extracted, inferred, warnings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        id,
        captureId,
        capture.projectId,
        JSON.stringify(extracted),
        JSON.stringify(inferred),
        JSON.stringify(warnings),
        nowIso(),
      );
    this.events.emit({
      type: 'rebuild.analyzed',
      message: `Reference analysed (${capture.kind}) with ${warnings.length} caveat(s)`,
      projectId: capture.projectId ?? undefined,
      data: { analysisId: id, captureId, confidence: inferred.confidence },
      source: 'rebuild',
    });
    return this.getAnalysis(id);
  }

  getAnalysis(id: string): RebuildAnalysis {
    const row = this.db.prepare('SELECT * FROM rebuild_analyses WHERE id = ?').get(id) as any;
    if (!row) throw new Error(`Analysis ${id} not found`);
    return {
      id: row.id,
      captureId: row.capture_id,
      projectId: row.project_id,
      extracted: safeParse(row.extracted, {}),
      inferred: safeParse(row.inferred, {}),
      warnings: safeParse(row.warnings, []),
      createdAt: row.created_at,
    };
  }

  /** Self-contained HTML preview (no network resources). */
  preview(analysisId: string): { html: string; estimatedFiles: Array<{ path: string; content: string }> } {
    this.modules.requireEnabled('rebuild-studio');
    const analysis = this.getAnalysis(analysisId);
    const capture = this.getCapture(analysis.captureId);
    const facts = analysis.extracted as unknown as ExtractedFacts;
    const inferred = analysis.inferred as unknown as InferredLayout;
    const html = capture.kind === 'screenshot'
      ? renderPreview(analysis.id, capture.source, facts, inferred)
      : renderHtmlPreview(analysis.id, capture.source, analysis.extracted, inferred);
    return { html, estimatedFiles: this.buildFiles(capture, analysis, html) };
  }

  private buildFiles(capture: RebuildCapture, analysis: RebuildAnalysis, previewHtml: string): Array<{ path: string; content: string }> {
    const slug = capture.source.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'reference';
    const inferred = analysis.inferred as unknown as InferredLayout;
    const tokens = Object.entries(inferred.designTokens ?? {})
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
    return [
      {
        path: `rebuild/${slug}/tokens.css`,
        content: `/* ARQENIUM Rebuild Studio - estimated design tokens.\n * Derived from a reference the user supplied. Not the original stylesheet. */\n:root {\n${tokens}\n}\n`,
      },
      {
        path: `rebuild/${slug}/index.html`,
        content: previewHtml,
      },
      {
        path: `rebuild/${slug}/ANALYSIS.md`,
        content: renderAnalysisMarkdown(analysis, capture),
      },
    ];
  }

  exportPreview(input: { analysisId: string; projectId: string; targetDir?: string }): ExportPreview {
    this.modules.requireEnabled('rebuild-studio');
    const analysis = this.getAnalysis(input.analysisId);
    const capture = this.getCapture(analysis.captureId);
    const preview = this.preview(input.analysisId);
    const targetDir = (input.targetDir ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
    const files = preview.estimatedFiles.map((f) => ({ ...f, path: targetDir ? `${targetDir}/${f.path}` : f.path }));

    const approval = this.approvals.create({
      projectId: input.projectId,
      kind: 'file-write',
      title: `Export reconstruction (${files.length} files)`,
      detail: files.map((f) => `${f.path} (${Buffer.byteLength(f.content)} bytes)`).join('\n'),
      payload: { analysisId: input.analysisId, targetDir, files },
      risk: 'medium',
      source: 'rebuild',
    });
    void capture;
    return {
      approvalId: approval.id,
      targetDir,
      files: files.map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.content), preview: f.content.slice(0, 600) })),
    };
  }

  /** Write the reviewed files after the approval has been granted. */
  exportCommit(approvalId: string): { written: string[] } {
    this.modules.requireEnabled('rebuild-studio');
    const approval = this.approvals.get(approvalId);
    if (approval.status !== 'approved') throw new Error(`Approval is ${approval.status}; nothing was written`);
    if (!approval.projectId) throw new Error('Approval is not bound to a project');
    const payload = approval.payload as { analysisId: string; targetDir: string; files: Array<{ path: string; content: string }> };
    const written: string[] = [];
    for (const f of payload.files ?? []) {
      const abs = this.projects.resolveWithin(approval.projectId, f.path);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, f.content, 'utf8');
      written.push(f.path);
      this.db
        .prepare('INSERT INTO rebuild_exports (id, analysis_id, project_id, target_dir, files, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(newId('rexp'), payload.analysisId, approval.projectId, payload.targetDir ?? '', JSON.stringify(written), nowIso());
    }
    this.events.emit({
      type: 'rebuild.exported',
      message: `Reconstruction exported (${written.length} files)`,
      projectId: approval.projectId,
      data: { analysisId: payload.analysisId, files: written },
      source: 'rebuild',
    });
    return { written };
  }

  private storeBuffer(id: string, ext: string, buffer: Buffer): string {
    const dir = path.join(this.dataDir, 'rebuild');
    mkdirSync(dir, { recursive: true });
    const safeExt = ext === '.jpeg' || ext === '.jpg' || ext === '.png' ? ext : '.png';
    const p = path.join(dir, `${id}${safeExt}`);
    writeFileSync(p, buffer);
    return p;
  }
}

// ------------------------------------------------------------- HTML side

export function extractFromHtml(html: string): Record<string, unknown> {
  const root = parseHtml(html, { comment: false, blockTextElements: { script: false, style: true, pre: true } });
  const title = root.querySelector('title')?.text?.trim() ?? '';
  const metaDescription = root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';

  const headings = root
    .querySelectorAll('h1,h2,h3,h4')
    .slice(0, 40)
    .map((h) => ({ tag: h.tagName.toLowerCase(), text: (h.text ?? '').trim().slice(0, 160) }));

  const links = root.querySelectorAll('a').length;
  const images = root.querySelectorAll('img').length;
  const buttons = root.querySelectorAll('button, [role="button"], input[type="submit"]').length;
  const forms = root.querySelectorAll('form').length;
  const sections = root.querySelectorAll('section, article, main, aside, nav, header, footer').length;
  const scripts = root.querySelectorAll('script').length;

  const structure: Array<{ tag: string; classes: string; childCount: number }> = [];
  for (const el of root.querySelectorAll('body > *, body > * > *, main > *').slice(0, 60)) {
    structure.push({
      tag: el.tagName?.toLowerCase() ?? 'unknown',
      classes: (el.getAttribute('class') ?? '').slice(0, 160),
      childCount: el.childNodes?.length ?? 0,
    });
  }

  const cssColors = new Set<string>();
  const cssFonts = new Set<string>();
  for (const styleEl of root.querySelectorAll('style')) {
    const css = styleEl.text ?? '';
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) cssColors.add(m[0].toLowerCase());
    for (const m of css.matchAll(/rgba?\([^)]+\)/g)) cssColors.add(m[0].toLowerCase());
    for (const m of css.matchAll(/font-family\s*:\s*([^;}\n]+)/g)) cssFonts.add(m[1].trim().slice(0, 120));
  }
  const inlineStyles = root.querySelectorAll('[style]').slice(0, 200);
  for (const el of inlineStyles) {
    const style = el.getAttribute('style') ?? '';
    for (const m of style.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) cssColors.add(m[0].toLowerCase());
  }

  return {
    source: 'html',
    title,
    metaDescription,
    counts: { headings: headings.length, links, images, buttons, forms, sections, scripts },
    headings,
    structure,
    declaredColors: [...cssColors].slice(0, 40),
    declaredFonts: [...cssFonts].slice(0, 10),
    hasInlineScripts: scripts > 0,
    warnings: [
      'Only static markup was read. Stylesheets loaded over the network were not fetched.',
      scripts > 0 ? 'The page declares scripts; their runtime behaviour is not reproduced.' : '',
    ].filter(Boolean),
  };
}

function inferFromHtml(extracted: Record<string, unknown>): InferredLayout {
  const colors = (extracted.declaredColors as string[]) ?? [];
  const fonts = (extracted.declaredFonts as string[]) ?? [];
  const counts = (extracted.counts as Record<string, number>) ?? {};
  return {
    layoutModel: (counts.sections ?? 0) >= 3 ? 'semantic sectioned layout' : 'single-flow layout',
    breakpoints: [
      { name: 'desktop', width: 1440, rationale: 'Assumed desktop width; not measured from the reference.' },
      { name: 'tablet', width: 834, rationale: 'Assumed standard tablet width.' },
      { name: 'mobile', width: 390, rationale: 'Assumed standard mobile width.' },
    ],
    spacingScale: [4, 8, 16, 24, 32, 48],
    typography: [
      { role: 'heading', sizePx: 32, weight: 700, rationale: 'Estimated from the number of heading levels present.' },
      { role: 'body', sizePx: 16, weight: 400, rationale: 'Default body size assumption.' },
    ],
    components: [
      ...(counts.sections ? [{ name: 'layout regions', rationale: `${counts.sections} semantic region(s) found in markup.` }] : []),
      ...(counts.buttons ? [{ name: 'button controls', rationale: `${counts.buttons} button-like element(s) found.` }] : []),
      ...(counts.forms ? [{ name: 'form controls', rationale: `${counts.forms} form element(s) found.` }] : []),
      ...(counts.images ? [{ name: 'media blocks', rationale: `${counts.images} image element(s) found.` }] : []),
    ],
    designTokens: {
      '--color-bg': colors[0] ?? '#101014',
      '--color-text': colors[1] ?? '#e6e6ea',
      '--color-accent-1': colors[2] ?? '#38bdf8',
      '--color-accent-2': colors[3] ?? '#a78bfa',
      '--color-accent-3': colors[4] ?? '#f59e0b',
      '--font-body': fonts[0] ?? 'system-ui, sans-serif',
      '--space-base': '8px',
      '--radius-base': '8px',
      '--content-max-width': '1180px',
    },
    confidence: 'medium',
  };
}

function renderHtmlPreview(analysisId: string, source: string, extracted: Record<string, unknown>, inferred: InferredLayout): string {
  const tokens = Object.entries(inferred.designTokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  const headings = (extracted.headings as Array<{ tag: string; text: string }>) ?? [];
  const structure = (extracted.structure as Array<{ tag: string; classes: string }>) ?? [];
  const counts = (extracted.counts as Record<string, number>) ?? {};
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Rebuild preview - ${escapeHtml(source)}</title>
<style>
:root {
${tokens}
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); line-height: 1.6; }
.wrap { max-width: var(--content-max-width); margin: 0 auto; padding: 48px 24px; }
.badge { display:inline-block; border:1px solid var(--color-accent-1); color: var(--color-accent-1); border-radius: 999px; padding: 2px 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
h1 { font-size: 32px; margin: 20px 0 8px; }
h2 { font-size: 20px; margin: 32px 0 8px; }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-top: 16px; }
.card { background: color-mix(in srgb, var(--color-text) 6%, transparent); border-radius: var(--radius-base); padding: 16px; }
.mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; opacity: .72; }
section { border-top: 1px solid color-mix(in srgb, var(--color-text) 14%, transparent); margin-top: 32px; padding-top: 20px; }
ul { padding-left: 20px; }
footer { margin-top: 40px; font-size: 12px; opacity: .6; }
</style></head>
<body><div class="wrap">
<span class="badge">estimated reconstruction</span>
<h1>${escapeHtml(String(extracted.title ?? source))}</h1>
<p class="mono">Structural estimate from authorised markup: ${escapeHtml(source)}</p>
<section><h2>Measured content inventory</h2>
<div class="grid">
${Object.entries(counts)
  .map(([k, v]) => `<div class="card"><div class="mono">${escapeHtml(k)}</div><div>${v}</div></div>`)
  .join('\n')}
</div></section>
<section><h2>Heading outline</h2>
<ul>${headings.map((h) => `<li><span class="mono">${escapeHtml(h.tag)}</span> ${escapeHtml(h.text)}</li>`).join('')}</ul></section>
<section><h2>Element skeleton</h2>
<ul>${structure.slice(0, 24).map((s) => `<li><span class="mono">&lt;${escapeHtml(s.tag)}&gt;</span> ${escapeHtml(s.classes)}</li>`).join('')}</ul></section>
<footer>ARQENIUM Rebuild Studio &middot; analysis ${escapeHtml(analysisId)} &middot; confidence ${inferred.confidence}</footer>
</div></body></html>`;
}

function renderAnalysisMarkdown(analysis: RebuildAnalysis, capture: RebuildCapture): string {
  const inferred = analysis.inferred as unknown as InferredLayout;
  const facts = analysis.extracted as unknown as ExtractedFacts;
  const lines: string[] = [];
  lines.push(`# Reconstruction analysis`);
  lines.push('');
  lines.push(`Reference: \`${capture.source}\` (${capture.kind})`);
  lines.push(`Analysis id: \`${analysis.id}\``);
  lines.push(`Generated: ${analysis.createdAt}`);
  lines.push('');
  lines.push('> This file is an estimate produced by ARQENIUM Rebuild Studio from a reference the user supplied. It is not the original source code.');
  lines.push('');
  lines.push('## Measured facts');
  lines.push('');
  if (capture.kind === 'screenshot' && facts?.palette) {
    lines.push(`- Reference size: ${facts.width} x ${facts.height}px (${facts.format})`);
    lines.push(`- Dominant background: \`${facts.dominantBackground}\``);
    lines.push(`- Dominant text colour: \`${facts.dominantText}\` (contrast ${facts.contrastRatio}:1)`);
    lines.push(`- Content gutter: left ${facts.gutter.left}px, right ${facts.gutter.right}px`);
    lines.push(`- Horizontal bands: ${facts.bands.length}`);
    lines.push(`- Whitespace ratio: ${facts.whitespaceRatio}`);
    lines.push('');
    lines.push('Top palette entries:');
    for (const p of facts.palette.slice(0, 8)) lines.push(`- \`${p.hex}\` - ${(p.share * 100).toFixed(1)}% of sampled pixels`);
  } else {
    lines.push('Markup inventory was measured from the supplied HTML. See `index.html` for the full inventory.');
  }
  lines.push('');
  lines.push('## Inferred implementation');
  lines.push('');
  lines.push(`- Layout model: ${inferred.layoutModel}`);
  lines.push(`- Confidence: ${inferred.confidence}`);
  lines.push(`- Spacing scale: ${inferred.spacingScale.join(', ')}`);
  lines.push('');
  lines.push('### Design tokens');
  lines.push('```css');
  for (const [k, v] of Object.entries(inferred.designTokens)) lines.push(`${k}: ${v};`);
  lines.push('```');
  lines.push('');
  lines.push('## Caveats');
  lines.push('');
  for (const w of analysis.warnings) lines.push(`- ${w}`);
  lines.push('');
  return lines.join('\n');
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') return true;
  if (h === '[::1]' || h.startsWith('[')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  if (h.endsWith('.internal') || h.endsWith('.local')) return true;
  return false;
}

function rowToCapture(r: any): RebuildCapture {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    source: r.source,
    path: r.path,
    meta: safeParse(r.meta, {}),
    createdAt: r.created_at,
  };
}

function safeParse<T>(v: string | null, fb: T): T {
  if (!v) return fb;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fb;
  }
}
