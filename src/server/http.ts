import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dispatcher, DispatchFailure } from '../core/dispatcher';
import { isInside } from '../core/paths';
import type { Core } from '../core/core';

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface ServerOptions {
  core: Core;
  port: number;
  host?: string;
  /** Serve a built renderer directory (production preview). */
  staticDir?: string;
  /** Allowed browser Origins for the API. Empty = same-origin only. */
  allowedOrigins?: string[];
}

export interface RunningServerHandle {
  started: Promise<void>;
  server: import('node:http').Server;
  unsubscribeSse: () => void;
  /** True once the socket is listening (useful when port 0 was requested). */
  listening: () => boolean;
  /** Base URL clients should use, e.g. `http://127.0.0.1:4319`. */
  origin: () => string;
  close: () => Promise<void>;
}

export interface RunningServer {
  port: number;
  url: string;
  close: () => Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Local HTTP API used by the web runtime (headless preview, browsers) and kept
 * available to the desktop app for automation. Every request body is validated
 * by the shared dispatcher; browser origins are restricted to an allow-list.
 */
export function createApiServer(opts: ServerOptions): RunningServerHandle {
  const dispatcher = new Dispatcher(opts.core, 'web');
  const sseClients = new Set<ServerResponse>();
  const allowed = new Set(opts.allowedOrigins ?? []);

  const unsubscribe = opts.core.events.on((event) => {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  });

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  const applyCors = (req: IncomingMessage, res: ServerResponse): boolean => {
    const origin = req.headers.origin;
    if (!origin) return true;
    // Same-origin requests (the served renderer) share the host header.
    const host = req.headers.host;
    const isSameHost = (() => {
      try {
        return new URL(origin).host === host;
      } catch {
        return false;
      }
    })();
    if (isSameHost || allowed.has(origin) || allowed.has('*')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      return true;
    }
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'origin_forbidden', code: 'origin_forbidden', message: `Origin ${origin} is not allowed` }));
    return false;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'OPTIONS') {
      // applyCors already answered with 403 for a disallowed origin.
      if (!applyCors(req, res)) return;
      res.writeHead(204, {
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
      });
      res.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      if (!applyCors(req, res)) return;
      if (url.pathname === '/api/invoke' && req.method !== 'POST') {
        return json(res, 405, { error: 'method_not_allowed', code: 'method_not_allowed', message: 'Use POST /api/invoke' });
      }
      try {
        if (url.pathname === '/api/info' && req.method === 'GET') {
          return json(res, 200, { ok: true, result: dispatcher.bootInfo() });
        }
        if (url.pathname === '/api/health' && req.method === 'GET') {
          return json(res, 200, dispatcher.health());
        }
        if (url.pathname === '/api/events' && req.method === 'GET') {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
          });
          res.write(': connected\n\n');
          sseClients.add(res);
          const ping = setInterval(() => {
            try {
              res.write(': ping\n\n');
            } catch {
              clearInterval(ping);
            }
          }, 25_000);
          req.on('close', () => {
            clearInterval(ping);
            sseClients.delete(res);
          });
          return;
        }
        if (url.pathname === '/api/invoke' && req.method === 'POST') {
          const body = await readBody(req);
          let parsed: { channel?: unknown; input?: unknown };
          try {
            parsed = JSON.parse(body || '{}');
          } catch {
            return json(res, 400, { error: 'invalid_json', code: 'invalid_json', message: 'Request body must be JSON' });
          }
          if (typeof parsed.channel !== 'string') {
            return json(res, 400, { error: 'invalid_request', code: 'invalid_channel', message: 'Missing "channel"' });
          }
          const result = await dispatcher.dispatch(parsed.channel, parsed.input ?? {});
          return json(res, 200, { ok: true, result });
        }
        return json(res, 404, { error: 'not_found', code: 'not_found', message: `No route for ${url.pathname}` });
      } catch (err) {
        return sendError(res, err);
      }
    }

    if (opts.staticDir) return serveStatic(opts.staticDir, url.pathname, res);
    return json(res, 404, { error: 'not_found', code: 'not_found', message: 'Not found' });
  };

  const listen = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(opts.port, opts.host ?? '127.0.0.1', () => resolve());
    });

  const addressOrigin = (): string => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') return `http://${opts.host ?? '127.0.0.1'}:${opts.port}`;
    const host = addr.address === '::' || addr.address === '0.0.0.0' ? '127.0.0.1' : addr.address;
    return `http://${host.includes(':') ? `[${host}]` : host}:${addr.port}`;
  };

  return {
    started: listen(),
    server,
    listening: () => server.listening,
    origin: addressOrigin,
    close: () =>
      new Promise<void>((resolve) => {
        for (const res of sseClients) {
          try {
            res.end();
          } catch {
            // ignore
          }
        }
        sseClients.clear();
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
      }),
    unsubscribeSse: () => {
      unsubscribe();
      for (const res of sseClients) {
        try {
          res.end();
        } catch {
          // ignore
        }
      }
      sseClients.clear();
    },
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(payload);
}

/** Maps the dispatcher's error taxonomy onto HTTP status codes. */
const STATUS_BY_CODE: Record<string, number> = {
  invalid_input: 400,
  invalid_json: 400,
  invalid_channel: 400,
  unknown_channel: 400,
  not_permitted: 403,
  not_found: 404,
  module_disabled: 403,
  approval_required: 409,
  conflict: 409,
  payload_too_large: 413,
  request_failed: 500,
};

function sendError(res: ServerResponse, err: unknown): void {
  // A generic `request_failed` still carries the domain message, so classify it
  // by message before answering with a bare 500.
  if (err instanceof DispatchFailure && err.code !== 'request_failed') {
    const status = STATUS_BY_CODE[err.code] ?? 500;
    json(res, status, { error: err.code, code: err.code, message: err.message, details: err.details });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  // Order matters: module-gate and permission messages contain "not found"-like
  // words rarely, but "approval" appears inside denial text, so test precisely.
  const mapped = /is disabled/i.test(message)
    ? { status: 403, code: 'module_disabled' }
    : /cannot be disabled|already exists|already registered|is pending|pending|approval (is|was) (pending|expired)/i.test(message)
      ? { status: 409, code: 'conflict' }
      : /not permitted|blocked by security policy|escapes the project root|not allowed|denied/i.test(message)
        ? { status: 403, code: 'not_permitted' }
        : /not found|no such|unknown (project|agent|run|task|provider|server|approval)|is not indexed/i.test(message)
          ? { status: 404, code: 'not_found' }
          : { status: 500, code: 'request_failed' };
  json(res, mapped.status, { error: mapped.code, code: mapped.code, message });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop buffering but keep draining the socket so the client receives the
        // 413 response instead of a connection reset.
        chunks.length = 0;
        req.removeAllListeners('data');
        req.resume();
        reject(new DispatchFailure('payload_too_large', `Request body exceeds ${Math.round(MAX_BODY_BYTES / 1024 / 1024)} MB`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(rootDir: string, pathname: string, res: ServerResponse): void {
  const root = path.resolve(rootDir);
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const target = path.resolve(root, `.${rel}`);
  // Path confinement: never serve outside the renderer build directory.
  // `isInside` folds case on Windows/macOS, where a case-sensitive prefix test
  // would reject valid requests.
  if (!isInside(root, target)) {
    json(res, 403, { error: { code: 'forbidden', message: 'Path escapes the application directory' } });
    return;
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback for client-side routes.
      const index = path.join(root, 'index.html');
      fs.readFile(index, (e2, data) => {
        if (e2) {
          json(res, 404, { error: { code: 'not_found', message: 'Application bundle not built' } });
          return;
        }
        res.writeHead(200, { 'content-type': MIME['.html'] });
        res.end(data);
      });
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=300',
    });
    fs.createReadStream(target).pipe(res);
  });
}

export function defaultStaticDir(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../../renderer'), path.resolve(here, '../renderer'), path.resolve(process.cwd(), 'dist/renderer')];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return undefined;
}
