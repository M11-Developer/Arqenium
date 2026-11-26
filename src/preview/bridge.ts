/**
 * Hosted-preview bridge.
 *
 * The Vercel deployment cannot run the ARQENIUM core: it needs a writable
 * SQLite database, long-lived SSE connections and native modules. So the
 * deployed page ships a **read-only interface preview** instead of a fake
 * backend:
 *
 *   - every read channel answers from `dataset.ts`, which was captured from the
 *     real core running in demo mode (real index, real symbols, real demo run);
 *   - every write channel fails with an explicit `preview_read_only` error, so
 *     nothing pretends to succeed;
 *   - the UI receives one synthetic `app.started` event so its stream indicator
 *     is honest about being connected to a preview.
 *
 * It installs only when `GET /api/info` does not answer with JSON, so
 * `npm run dev`, `npm run serve` and the Electron app always use the real core.
 */
import { PREVIEW_DATASET } from './dataset';

type InvokeResult<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

interface PreviewEvent {
  id: string;
  ts: string;
  type: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  projectId: string | null;
  runId: string | null;
  taskId: string | null;
  agentId: string | null;
  correlationId: string | null;
  source: string;
  message: string;
  data: unknown;
  durationMs: number | null;
}

const READ_ONLY: Record<string, string> = {
  'projects.add': 'Adding a local folder requires the desktop app: the core indexes files on your machine.',
  'projects.remove': 'The hosted preview is read-only.',
  'projects.reindex': 'The hosted preview serves a pre-computed index.',
  'runs.create':
    'The hosted preview cannot execute runs. It shows a completed demo run from the real engine; install the desktop app for live orchestration.',
  'runs.cancel': 'There is nothing to cancel in the hosted preview.',
  'agents.create': 'Agent records need the core. Install the desktop app to create agents.',
  'agents.update': 'The hosted preview is read-only.',
  'agents.delete': 'The hosted preview is read-only.',
  'approvals.decide': 'Approvals are decided by the core. Install the desktop app to act on them.',
  'providers.create': 'Provider configuration and credentials never leave your machine. Install the desktop app.',
  'providers.update': 'The hosted preview is read-only.',
  'providers.delete': 'The hosted preview is read-only.',
  'providers.test': 'The hosted preview cannot make network calls to providers.',
  'credentials.set': 'The hosted preview never stores credentials.',
  'credentials.delete': 'The hosted preview never stores credentials.',
  'mcp.add': 'MCP transports cannot be opened from a static host.',
  'mcp.update': 'The hosted preview is read-only.',
  'mcp.remove': 'The hosted preview is read-only.',
  'mcp.connect': 'MCP transports cannot be opened from a static host.',
  'mcp.disconnect': 'MCP transports cannot be opened from a static host.',
  'mcp.call': 'MCP tools run in the core process, which a static host does not have.',
  'mcp.internal.set': 'The internal MCP server cannot start on a static host.',
  'terminal.execute': 'EchoShell executes argument vectors locally. Install the desktop app.',
  'terminal.preview': 'EchoShell executes argument vectors locally. Install the desktop app.',
  'terminal.sessionCreate': 'Sessions live in the core. Install the desktop app.',
  'terminal.sessionDelete': 'The hosted preview is read-only.',
  'evals.run': 'Evaluations need the core and, for AI cases, a model. Install the desktop app.',
  'evals.rerun': 'Evaluations need the core. Install the desktop app.',
  'evals.export': 'Exports need the core. Install the desktop app.',
  'evals.suiteCreate': 'The hosted preview is read-only.',
  'evals.suiteDelete': 'The hosted preview is read-only.',
  'rebuild.captureScreenshot': 'Captures are stored by the core. Install the desktop app.',
  'rebuild.captureUrl': 'The hosted preview cannot fetch pages.',
  'rebuild.captureDelete': 'The hosted preview is read-only.',
  'rebuild.analyze': 'Rebuild Studio analysis runs in the core. Install the desktop app.',
  'rebuild.generate': 'Rebuild Studio generation runs in the core. Install the desktop app.',
  'rebuild.preview': 'Rebuild Studio previews run in the core. Install the desktop app.',
  'rebuild.exportPreview': 'Writes require the desktop app.',
  'rebuild.exportCommit': 'Committing requires the desktop app.',
  'context.upsert': 'Shared context is stored by the core. Install the desktop app.',
  'context.delete': 'The hosted preview is read-only.',
  'settings.set': 'Settings are persisted by the core. Install the desktop app.',
};

const projectId = (): string => {
  const projects = PREVIEW_DATASET['projects.list'];
  if (Array.isArray(projects) && projects.length > 0) return String((projects[0] as { id: string }).id);
  return 'prj_preview';
};

const now = (): string => new Date().toISOString();

/** Channels that need a tiny amount of shaping rather than a canned blob. */
const dynamic: Record<string, (input: Record<string, unknown>) => unknown> = {
  'projects.tree': (input) => {
    const base = typeof input.base === 'string' ? input.base : '';
    const all = PREVIEW_DATASET['projects.tree'] as Array<{ path: string }>;
    if (!base) return all.filter((n) => !n.path.includes('/'));
    return all.filter((n) => n.path.startsWith(`${base}/`) && !n.path.slice(base.length + 1).includes('/'));
  },
  'trace.events': (input) => {
    const base = PREVIEW_DATASET['trace.events'] as { items: PreviewEvent[] };
    const severity = input.severity;
    const type = input.type;
    const runId = input.runId;
    const items = base.items.filter(
      (e) =>
        (!severity || e.severity === severity) && (!type || e.type === type) && (!runId || e.runId === runId),
    );
    return { ...base, items };
  },
  'projects.search': (input) => {
    const q = String(input.query ?? '').toLowerCase();
    const base = PREVIEW_DATASET['projects.search'] as {
      files: Array<{ path: string }>;
      symbols: Array<{ name: string }>;
    };
    return {
      ...base,
      files: base.files.filter((f) => q.length === 0 || f.path.toLowerCase().includes(q)),
      symbols: base.symbols.filter((s) => q.length === 0 || s.name.toLowerCase().includes(q)),
    };
  },
  'terminal.explain': (input) => {
    const command = String(input.command ?? 'git status');
    const base = PREVIEW_DATASET['terminal.explain'] as Record<string, unknown>;
    return { ...base, command, argv: command.split(/\s+/).filter(Boolean) };
  },
};

function respond(channel: string): InvokeResult {
  if (Object.prototype.hasOwnProperty.call(READ_ONLY, channel)) {
    return { ok: false, error: { code: 'preview_read_only', message: READ_ONLY[channel] } };
  }
  if (Object.prototype.hasOwnProperty.call(PREVIEW_DATASET, channel)) {
    return { ok: true, result: PREVIEW_DATASET[channel] };
  }
  return {
    ok: false,
    error: {
      code: 'not_available',
      message: `${channel} is not available in the hosted preview. Install the desktop app to use the full product.`,
    },
  };
}

const listeners = new Set<(event: unknown) => void>();
let announced = false;

function emit(event: PreviewEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* a broken listener must not break the bridge */
    }
  }
}

const bridge = {
  runtime: 'electron' as const,
  preview: true as const,
  invoke<T>(channel: string, input?: unknown): Promise<InvokeResult<T>> {
    const shaped = dynamic[channel];
    if (shaped) {
      return Promise.resolve({ ok: true, result: shaped((input ?? {}) as Record<string, unknown>) as T });
    }
    return Promise.resolve(respond(channel) as InvokeResult<T>);
  },
  pickDirectory(): Promise<string | null> {
    return Promise.resolve(null);
  },
  pickFile(): Promise<string | null> {
    return Promise.resolve(null);
  },
  openExternal(url: string): Promise<boolean> {
    if (!/^https?:\/\//.test(url)) return Promise.resolve(false);
    window.open(url, '_blank', 'noopener,noreferrer');
    return Promise.resolve(true);
  },
  onEvent(listener: (event: unknown) => void): () => void {
    if (typeof listener !== 'function') return () => undefined;
    listeners.add(listener);
    if (!announced) {
      announced = true;
      // One honest frame so the UI's event indicator shows a connected stream.
      setTimeout(() => {
        emit({
          id: 'evt_preview_start',
          ts: now(),
          type: 'app.started',
          severity: 'info',
          projectId: projectId(),
          runId: null,
          taskId: null,
          agentId: null,
          correlationId: null,
          source: 'preview',
          message: 'Hosted interface preview - sample data, read-only',
          data: { preview: true },
          durationMs: null,
        });
      }, 50);
    }
    return () => {
      listeners.delete(listener);
    };
  },
};

// The bridge is assigned onto a plain string-keyed surface rather than
// re-declaring Window: the renderer already owns that declaration.
type PreviewWindow = typeof window & { arqenium?: unknown };

let installed = false;

function install(): void {
  const target = window as PreviewWindow;
  if (installed || target.arqenium) return;
  installed = true;
  target.arqenium = bridge;
  console.info('[arqenium] hosted interface preview active - sample data, read-only.');
}

/**
 * Probe the real API. A static host answers the SPA fallback (HTML) here, so
 * only a JSON response counts as "a core is running".
 */
function probe(): void {
  if (typeof fetch !== 'function') {
    install();
    return;
  }
  fetch('/api/info', { headers: { accept: 'application/json' } })
    .then((res) => {
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.includes('application/json')) install();
    })
    .catch(() => install());
}

probe();
// Never leave the app waiting on a hung probe.
setTimeout(install, 1200);
