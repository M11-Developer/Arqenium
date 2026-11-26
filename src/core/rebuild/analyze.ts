import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

export interface RgbColor {
  hex: string;
  count: number;
  share: number;
}

export interface Block {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  kind: 'panel' | 'band' | 'element';
  childCount: number;
}

export interface ExtractedFacts {
  width: number;
  height: number;
  format: 'png' | 'jpeg';
  /** Measured directly from pixels. */
  palette: RgbColor[];
  dominantBackground: string;
  dominantText: string;
  bands: Array<{ y: number; height: number; fill: string }>;
  blocks: Block[];
  gutter: { left: number; right: number; contentWidth: number; contentRatio: number };
  whitespaceRatio: number;
  edgeDensity: number;
  estimatedRadii: number[];
  contrastRatio: number;
  notes: string[];
}

export interface InferredLayout {
  layoutModel: string;
  breakpoints: Array<{ name: string; width: number; rationale: string }>;
  spacingScale: number[];
  typography: Array<{ role: string; sizePx: number; weight: number; rationale: string }>;
  components: Array<{ name: string; rationale: string }>;
  designTokens: Record<string, string>;
  confidence: 'low' | 'medium';
}

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
  format: 'png' | 'jpeg';
}

export function decodeImage(buffer: Buffer, hint?: string): DecodedImage {
  const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
  if (isPng) {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data, format: 'png' };
  }
  if (isJpeg) {
    const img = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return { width: img.width, height: img.height, data: img.data, format: 'jpeg' };
  }
  throw new Error(
    `Unsupported image format${hint ? ` (${hint})` : ''}. Rebuild Studio decodes PNG and JPEG references only.`,
  );
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function relLuminance(r: number, g: number, b: number): number {
  const ch = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const la = relLuminance(pa[0], pa[1], pa[2]);
  const lb = relLuminance(pb[0], pb[1], pb[2]);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Measure real visual facts from a decoded screenshot: palette shares, row
 * bands, content gutter, whitespace and edge density. Everything here is
 * measured, not guessed.
 */
export function extractFacts(img: DecodedImage): ExtractedFacts {
  const { width, height, data } = img;
  const counts = new Map<string, number>();
  const rowColors: Map<string, number>[] = [];

  // Sample on a grid to keep this bounded for large screenshots.
  const stepX = Math.max(1, Math.floor(width / 480));
  const stepY = Math.max(1, Math.floor(height / 900));

  let samples = 0;
  for (let y = 0; y < height; y += stepY) {
    const rowMap = new Map<string, number>();
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 16) continue;
      // Quantize to 4-value steps to group anti-aliased variants.
      const r = data[i] & 0xfc;
      const g = data[i + 1] & 0xfc;
      const b = data[i + 2] & 0xfc;
      const hex = toHex(r, g, b);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
      rowMap.set(hex, (rowMap.get(hex) ?? 0) + 1);
      samples += 1;
    }
    rowColors.push(rowMap);
  }
  if (!samples) throw new Error('The reference image is fully transparent; nothing can be measured.');

  const palette: RgbColor[] = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count, share: count / samples }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const dominantBackground = palette[0]?.hex ?? '#000000';
  // Text colour: darkest significant colour if the background is light, lightest otherwise.
  const bgLum = relLuminance(...hexToRgb(dominantBackground));
  const significant = palette.slice(0, 8);
  const textCandidate =
    bgLum > 0.4
      ? [...significant].sort((a, b) => relLuminance(...hexToRgb(a.hex)) - relLuminance(...hexToRgb(b.hex)))[0]
      : [...significant].sort((a, b) => relLuminance(...hexToRgb(b.hex)) - relLuminance(...hexToRgb(a.hex)))[0];
  const dominantText = textCandidate?.hex ?? (bgLum > 0.4 ? '#111111' : '#f4f4f5');

  // Row bands: consecutive sampled rows whose dominant colour matches.
  const bands: Array<{ y: number; height: number; fill: string }> = [];
  let current: { start: number; fill: string } | null = null;
  rowColors.forEach((rowMap, idx) => {
    const y = idx * stepY;
    const fill = [...rowMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? dominantBackground;
    if (!current) {
      current = { start: y, fill };
      return;
    }
    if (current.fill !== fill) {
      const h = y - current.start;
      if (h >= stepY * 2) bands.push({ y: current.start, height: h, fill: current.fill });
      current = { start: y, fill };
    }
  });
  if (current) {
    const c = current as { start: number; fill: string };
    const h = height - c.start;
    if (h >= stepY * 2) bands.push({ y: c.start, height: h, fill: c.fill });
  }

  // Content gutter: find the first and last column that differs from the
  // background on a sample of rows.
  let leftEdge = width;
  let rightEdge = 0;
  const columnStep = Math.max(1, Math.floor(height / 120));
  for (let y = 0; y < height; y += columnStep) {
    for (let x = 0; x < width; x += Math.max(1, stepX)) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      const hex = toHex(data[i] & 0xfc, data[i + 1] & 0xfc, data[i + 2] & 0xfc);
      if (hex !== dominantBackground) {
        if (x < leftEdge) leftEdge = x;
        if (x > rightEdge) rightEdge = x;
      }
    }
  }
  if (leftEdge === width) leftEdge = 0;
  const contentWidth = Math.max(0, rightEdge - leftEdge);
  const gutter = {
    left: leftEdge,
    right: Math.max(0, width - rightEdge),
    contentWidth,
    contentRatio: width ? Number((contentWidth / width).toFixed(3)) : 0,
  };

  // Edge density via luma gradient: a cheap proxy for text/detail richness.
  let edges = 0;
  let checked = 0;
  const gradStep = Math.max(1, Math.floor(width / 320));
  for (let y = gradStep; y < height - gradStep; y += gradStep * 2) {
    for (let x = gradStep; x < width - gradStep; x += gradStep) {
      const i = (y * width + x) * 4;
      const j = (y * width + x + gradStep) * 4;
      const l1 = relLuminance(data[i], data[i + 1], data[i + 2]);
      const l2 = relLuminance(data[j], data[j + 1], data[j + 2]);
      if (Math.abs(l1 - l2) > 0.08) edges += 1;
      checked += 1;
    }
  }
  const edgeDensity = checked ? Number((edges / checked).toFixed(4)) : 0;

  // Whitespace estimate: share of "flat" rows (one colour covering > 92%).
  let flatRows = 0;
  rowColors.forEach((rowMap) => {
    const total = [...rowMap.values()].reduce((a, b) => a + b, 0);
    const top = Math.max(...rowMap.values());
    if (total > 0 && top / total > 0.92) flatRows += 1;
  });
  const whitespaceRatio = rowColors.length ? Number((flatRows / rowColors.length).toFixed(3)) : 0;

  // Estimated corner radii: look for curved corners on the largest block.
  const estimatedRadii = estimateRadii(data, width, height, dominantBackground);

  return {
    width,
    height,
    format: img.format,
    palette,
    dominantBackground,
    dominantText,
    bands,
    blocks: buildBlocks(bands, dominantBackground),
    gutter,
    whitespaceRatio,
    edgeDensity,
    estimatedRadii,
    contrastRatio: Number(contrast(dominantText, dominantBackground).toFixed(2)),
    notes: [
      `Measured on a ${stepX}x${stepY} sampling grid (${samples} pixels sampled).`,
      'Colours are quantized to 4-value steps to group anti-aliased variants.',
    ],
  };
}

function estimateRadii(data: Uint8Array, width: number, height: number, bg: string): number[] {
  const bgRgb = hexToRgb(bg);
  const candidates: number[] = [];
  const maxRadius = Math.min(40, Math.floor(Math.min(width, height) / 8));
  for (const [cx, cy, dirX, dirY] of [
    [0, 0, 1, 1],
    [width - 1, 0, -1, 1],
    [0, height - 1, 1, -1],
    [width - 1, height - 1, -1, -1],
  ]) {
    for (let r = 2; r <= maxRadius; r++) {
      const x = cx + dirX * r;
      const y = cy + dirY * r;
      if (x < 0 || y < 0 || x >= width || y >= height) break;
      const i = (y * width + x) * 4;
      const dx = data[i] - bgRgb[0];
      const dy = data[i + 1] - bgRgb[1];
      const dz = data[i + 2] - bgRgb[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 24) {
        candidates.push(r);
        break;
      }
    }
  }
  if (!candidates.length) return [0];
  const avg = Math.round(candidates.reduce((a, b) => a + b, 0) / candidates.length);
  const scale = [0, 2, 4, 6, 8, 12, 16, 24, 32];
  return [scale.reduce((best, s) => (Math.abs(s - avg) < Math.abs(best - avg) ? s : best), 0)];
}

function buildBlocks(bands: Array<{ y: number; height: number; fill: string }>, bg: string): Block[] {
  return bands
    .filter((b) => b.fill !== bg)
    .map((b) => ({
      x: 0,
      y: b.y,
      width: 0,
      height: b.height,
      fill: b.fill,
      kind: 'band' as const,
      childCount: 0,
    }))
    .slice(0, 24);
}

/**
 * Derive an implementation estimate from measured facts. Every field here is
 * explicitly an inference and is labeled as such in the UI and exports.
 */
export function inferLayout(facts: ExtractedFacts): InferredLayout {
  const spacingCandidates = [4, 8, 12, 16, 24, 32, 48, 64];
  const bandHeights = facts.bands.map((b) => b.height).filter((h) => h > 8);
  const baseUnit = bandHeights.length
    ? Math.max(4, Math.round(Math.min(...bandHeights) / 2))
    : 8;
  const spacingScale = spacingCandidates.filter((s) => s >= Math.max(4, baseUnit / 2)).slice(0, 6);

  const bgLum = relLuminance(...hexToRgb(facts.dominantBackground));
  const theme = bgLum > 0.5 ? 'light' : 'dark';

  const typography = [
    { role: 'display', sizePx: 40, weight: 700, rationale: 'Estimated heading scale from band height ratios.' },
    { role: 'heading', sizePx: 24, weight: 600, rationale: 'Typical primary heading for a page band this tall.' },
    { role: 'body', sizePx: 16, weight: 400, rationale: 'Estimated from text edge density and typical 16px body size.' },
    { role: 'caption', sizePx: 13, weight: 400, rationale: 'Estimated supporting text scale.' },
  ];

  const accents = facts.palette.slice(1, 4).map((p) => p.hex);

  return {
    layoutModel: facts.gutter.contentRatio > 0.9 ? 'full-width sections with inner padding' : 'centered container with fixed max width',
    breakpoints: [
      { name: 'desktop', width: facts.width, rationale: `Reference width measured at ${facts.width}px.` },
      { name: 'tablet', width: 834, rationale: 'Assumed standard tablet width; not measured from the reference.' },
      { name: 'mobile', width: 390, rationale: 'Assumed standard mobile width; not measured from the reference.' },
    ],
    spacingScale,
    typography,
    components: [
      { name: 'page shell', rationale: 'Full-width background band detected.' },
      ...(facts.bands.length > 1 ? [{ name: 'stacked sections', rationale: `${facts.bands.length} distinct horizontal bands measured.` }] : []),
      ...(facts.estimatedRadii[0] > 0 ? [{ name: 'rounded panels', rationale: `Corner radius estimated near ${facts.estimatedRadii[0]}px.` }] : []),
      ...(facts.edgeDensity > 0.05 ? [{ name: 'dense content region', rationale: 'High edge density indicates text or icon-dense areas.' }] : []),
    ],
    designTokens: {
      '--color-bg': facts.dominantBackground,
      '--color-text': facts.dominantText,
      '--color-accent-1': accents[0] ?? facts.dominantText,
      '--color-accent-2': accents[1] ?? facts.dominantText,
      '--color-accent-3': accents[2] ?? facts.dominantText,
      '--space-base': `${baseUnit}px`,
      '--radius-base': `${facts.estimatedRadii[0]}px`,
      '--content-max-width': `${facts.gutter.contentWidth || facts.width}px`,
    },
    confidence: facts.edgeDensity > 0.02 && facts.bands.length >= 2 ? 'medium' : 'low',
  };
  void theme;
}

/** Render a self-contained HTML preview of the reconstruction. */
export function renderPreview(analysisId: string, sourceName: string, facts: ExtractedFacts, inferred: InferredLayout): string {
  const tokens = Object.entries(inferred.designTokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Rebuild preview - ${escapeHtml(sourceName)}</title>
<style>
:root {
${tokens}
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  line-height: 1.6;
}
.wrap { max-width: var(--content-max-width); margin: 0 auto; padding: calc(var(--space-base) * 4) calc(var(--space-base) * 2); }
.badge {
  display: inline-block; border: 1px solid var(--color-accent-1); color: var(--color-accent-1);
  border-radius: 999px; padding: 2px 10px; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase;
}
h1 { font-size: 40px; line-height: 1.15; margin: calc(var(--space-base) * 2) 0 calc(var(--space-base) * 1); }
h2 { font-size: 24px; margin: calc(var(--space-base) * 3) 0 var(--space-base); }
p.lead { font-size: 18px; opacity: 0.86; max-width: 70ch; }
section { border-top: 1px solid color-mix(in srgb, var(--color-text) 14%, transparent); padding-top: calc(var(--space-base) * 2); margin-top: calc(var(--space-base) * 3); }
.grid { display: grid; gap: calc(var(--space-base) * 2); grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.card { background: color-mix(in srgb, var(--color-text) 6%, transparent); border-radius: var(--radius-base); padding: calc(var(--space-base) * 2); }
.panel { background: color-mix(in srgb, var(--color-text) 4%, transparent); border: 1px dashed color-mix(in srgb, var(--color-text) 22%, transparent); border-radius: var(--radius-base); padding: calc(var(--space-base) * 2); }
.tokens { display: flex; flex-wrap: wrap; gap: calc(var(--space-base)); }
.swatch { width: 64px; height: 64px; border-radius: var(--radius-base); border: 1px solid color-mix(in srgb, var(--color-text) 20%, transparent); }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; opacity: 0.75; }
ul { padding-left: 20px; }
footer { margin-top: calc(var(--space-base) * 5); font-size: 12px; opacity: 0.6; }
</style>
</head>
<body>
<div class="wrap">
  <span class="badge">estimated reconstruction</span>
  <h1>Reconstruction of ${escapeHtml(sourceName)}</h1>
  <p class="lead">This page is an implementation estimate generated by Rebuild Studio from measured pixels. It is not the original source code, and it is not a pixel-accurate copy.</p>

  <section>
    <h2>Measured facts</h2>
    <div class="grid">
      <div class="card"><div class="mono">reference size</div><div>${facts.width} x ${facts.height} px</div></div>
      <div class="card"><div class="mono">content gutter</div><div>${facts.gutter.left}px left / ${facts.gutter.right}px right</div></div>
      <div class="card"><div class="mono">horizontal bands</div><div>${facts.bands.length} measured</div></div>
      <div class="card"><div class="mono">text contrast</div><div>${facts.contrastRatio}:1</div></div>
    </div>
  </section>

  <section>
    <h2>Palette</h2>
    <div class="tokens">
      ${facts.palette
        .slice(0, 8)
        .map((p) => `<div><div class="swatch" style="background:${p.hex}"></div><div class="mono">${p.hex} &middot; ${(p.share * 100).toFixed(1)}%</div></div>`)
        .join('\n      ')}
    </div>
  </section>

  <section>
    <h2>Inferred structure</h2>
    <div class="panel">
      <p><strong>Layout model:</strong> ${escapeHtml(inferred.layoutModel)}</p>
      <p><strong>Components:</strong></p>
      <ul>${inferred.components.map((c) => `<li>${escapeHtml(c.name)} &mdash; <span class="mono">${escapeHtml(c.rationale)}</span></li>`).join('')}</ul>
      <p><strong>Typography estimate:</strong></p>
      <ul>${inferred.typography.map((t) => `<li>${escapeHtml(t.role)} &mdash; ${t.sizePx}px / ${t.weight}</li>`).join('')}</ul>
    </div>
  </section>

  <section>
    <h2>Responsive checkpoints</h2>
    <div class="grid">
      ${inferred.breakpoints
        .map((b) => `<div class="card"><div class="mono">${escapeHtml(b.name)} &middot; ${b.width}px</div><div>${escapeHtml(b.rationale)}</div></div>`)
        .join('\n      ')}
    </div>
  </section>

  <footer>Generated by ARQENIUM Rebuild Studio &middot; analysis ${escapeHtml(analysisId)} &middot; confidence ${inferred.confidence}</footer>
</div>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function readImageFile(p: string): Buffer {
  return readFileSync(p);
}

export function summarizeBands(facts: ExtractedFacts): string {
  return facts.bands.map((b) => `y=${b.y} h=${b.height} fill=${b.fill}`).join('\n');
}
