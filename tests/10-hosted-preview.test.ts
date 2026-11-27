import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { PREVIEW_DATASET } from '../src/preview/dataset';
import { REPO_ROOT } from './helpers/core';

/**
 * Hosted-preview regression tests.
 *
 * The Vercel deployment serves `dist/renderer` as a static SPA, so /api does not
 * exist there. These tests rebuild that exact condition in jsdom - no network,
 * no EventSource, no backend - and assert that:
 *
 *   1. the built page renders instead of showing a boot error,
 *   2. every route in the shell produces real content,
 *   3. the dataset keeps the response shapes the UI expects,
 *   4. mutating channels are refused rather than silently faked.
 *
 * They run against `dist/renderer`. A developer who runs `npm run build` before
 * `npm test` gets the full browser-level checks; on a clean checkout without a
 * build they are skipped rather than failed, so the suite never depends on an
 * artifact being present.
 */
const rendererDir = path.join(REPO_ROOT, 'dist/renderer');
const built = fs.existsSync(path.join(rendererDir, 'index.html')) && fs.existsSync(path.join(rendererDir, 'preview-bridge.js'));

const READ_ONLY_CHANNELS = [
  'projects.add',
  'runs.create',
  'agents.create',
  'approvals.decide',
  'providers.test',
  'credentials.set',
  'mcp.connect',
  'terminal.execute',
  'evals.run',
  'rebuild.analyze',
  'context.upsert',
  'settings.set',
];

describe('hosted preview dataset', () => {
  it('carries the payloads the boot sequence needs', () => {
    for (const channel of ['app.info', 'modules.list', 'projects.list', 'providers.list', 'approvals.list']) {
      expect(PREVIEW_DATASET[channel], `${channel} missing from the preview dataset`).toBeDefined();
      expect(PREVIEW_DATASET[channel]).not.toBeNull();
    }
    const projects = PREVIEW_DATASET['projects.list'] as Array<Record<string, unknown>>;
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0]).toHaveProperty('indexStats');
  });

  it('keeps the project pages populated', () => {
    expect((PREVIEW_DATASET['projects.symbols'] as { items: unknown[] }).items.length).toBeGreaterThan(0);
    expect((PREVIEW_DATASET['projects.tree'] as unknown[]).length).toBeGreaterThan(0);
    expect((PREVIEW_DATASET['projects.graph'] as { nodes: unknown[] }).nodes.length).toBeGreaterThan(0);
    expect((PREVIEW_DATASET['agents.list'] as unknown[]).length).toBeGreaterThan(0);
    expect((PREVIEW_DATASET['runs.list'] as unknown[]).length).toBeGreaterThan(0);
  });

  it('includes a genuinely executed demo run with its trace', () => {
    const runs = PREVIEW_DATASET['runs.list'] as Array<{ id: string; status: string }>;
    expect(runs[0]).toHaveProperty('labels');
    expect(runs[0]).toHaveProperty('kind');
    const detail = PREVIEW_DATASET['runs.get'] as { tasks: unknown[] };
    expect(detail.tasks.length).toBeGreaterThan(0);
    const events = PREVIEW_DATASET['trace.events'] as { items: unknown[] };
    expect(events.items.length).toBeGreaterThan(0);
  });

  it('uses absolute Windows-style project paths so the preview reads like a desktop install', () => {
    const projects = PREVIEW_DATASET['projects.list'] as Array<{ rootPath: string }>;
    expect(projects[0].rootPath).toMatch(/^[A-Za-z]:\\/);
  });
});

describe.skipIf(!built)('hosted preview in a browser engine', () => {
  let dom: JSDOM;
  let win: JSDOM['window'];
  const errors: string[] = [];

  beforeAll(async () => {
    const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
    // jsdom cannot execute <script src>; evaluate the same files manually in the
    // same order the page uses (bridge first, then the app bundle).
    dom = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://arqenium.example/',
    });
    win = dom.window;

    // Static-host conditions: no API, no SSE, no network.
    win.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    win.EventSource = class {
      onerror: ((e: unknown) => void) | null = null;
      constructor() {
        setTimeout(() => this.onerror?.(new Error('static host')), 5);
      }
      addEventListener(): void {}
      removeEventListener(): void {}
      close(): void {}
    } as unknown as typeof EventSource;
    win.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    win.matchMedia = (() => ({
      matches: false,
      addEventListener(): void {},
      removeEventListener(): void {},
      addListener(): void {},
      removeListener(): void {},
    })) as unknown as typeof win.matchMedia;
    win.scrollTo = (() => undefined) as unknown as typeof win.scrollTo;
    win.HTMLElement.prototype.scrollIntoView = () => undefined;
    win.requestAnimationFrame = (cb: FrameRequestCallback): number => setTimeout(() => cb(Date.now()), 0) as unknown as number;
    win.cancelAnimationFrame = (id: number): void => clearTimeout(id);
    win.addEventListener('error', (event: Event) =>
      errors.push(String((event as ErrorEvent).error ?? (event as ErrorEvent).message)),
    );
    win.onunhandledrejection = (event: PromiseRejectionEvent) =>
      errors.push(`unhandled: ${String(event.reason)}`);

    win.eval(fs.readFileSync(path.join(rendererDir, 'preview-bridge.js'), 'utf8'));
    const bundle = fs.readdirSync(path.join(rendererDir, 'assets')).find((f) => f.endsWith('.js'));
    expect(bundle, 'renderer bundle missing').toBeTruthy();
    win.eval(fs.readFileSync(path.join(rendererDir, 'assets', bundle as string), 'utf8'));
    await new Promise((r) => setTimeout(r, 2500));
  });

  afterAll(() => {
    dom.window.close();
  });

  it('installs the preview bridge when no core answers', () => {
    expect(win.arqenium).toBeTruthy();
    expect((win.arqenium as unknown as { preview: boolean }).preview).toBe(true);
  });

  it('renders the shell instead of a boot error', () => {
    const text = (win.document.getElementById('root')?.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).not.toContain('could not start');
    expect(text.length).toBeGreaterThan(400);
    expect(text).toContain('Overview');
  });

  it('renders every destination without throwing', async () => {
    const links = [...win.document.querySelectorAll('a')]
      .map((a) => a.getAttribute('href'))
      .filter((h): h is string => !!h && h.startsWith('#/'));
    expect(links.length).toBeGreaterThanOrEqual(10);
    for (const href of links) {
      win.location.hash = href.slice(1);
      await new Promise((r) => setTimeout(r, 500));
      const body = (win.document.getElementById('root')?.textContent ?? '').replace(/\s+/g, ' ');
      expect(body.length, `${href} rendered almost nothing`).toBeGreaterThan(120);
    }
    expect(errors).toEqual([]);
  });
});

describe('hosted preview refusals', () => {
  it('refuses to fake a mutation', async () => {
    if (!built) return;
    // The refusal table lives in the bridge module; import it directly.
    const bridgeSource = fs.readFileSync(path.join(REPO_ROOT, 'src/preview/bridge.ts'), 'utf8');
    for (const channel of READ_ONLY_CHANNELS) {
      expect(bridgeSource, `${channel} must be refused, not faked`).toContain(`'${channel}':`);
    }
  });
});
