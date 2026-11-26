import { createCore, resolveDataDir } from '../core/core';
import { createApiServer, defaultStaticDir } from './http';

/**
 * Standalone API / web runtime entrypoint.
 *
 *   npm run start:api
 *
 * Serves the validated JSON API, the SSE event stream and - when a production
 * renderer build exists in dist/renderer - the application itself.
 */
async function main(): Promise<void> {
  const port = Number(process.env.ARQ_API_PORT ?? 4319);
  const host = process.env.ARQ_API_HOST ?? '127.0.0.1';
  const dataDir = resolveDataDir();

  console.log(`[arqenium] data directory: ${dataDir}`);
  const core = createCore({ dataDir });
  // The demo provider is seeded by the registry; resolving it here fails fast
  // if the seed ever regresses.
  void core.providers.demoProvider().id;

  const staticDir = process.env.ARQ_STATIC_DIR ?? defaultStaticDir();
  const allowedOrigins = (process.env.ARQ_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.ARQ_DEV_ORIGIN) allowedOrigins.push(process.env.ARQ_DEV_ORIGIN);
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174');
  }

  const handle = createApiServer({ core, port, host, staticDir, allowedOrigins });
  await handle.started;
  console.log(`[arqenium] API listening on http://${host}:${port}`);
  if (staticDir) console.log(`[arqenium] serving renderer from ${staticDir}`);

  core.events.emit({
    type: 'app.started',
    message: `ARQENIUM API started on port ${port}`,
    data: { runtime: 'web', staticDir: staticDir ?? null },
    source: 'app',
  });

  const shutdown = async (signal: string) => {
    console.log(`[arqenium] ${signal} received, shutting down`);
    handle.unsubscribeSse();
    await new Promise<void>((resolve) => handle.server.close(() => resolve()));
    await core.dispose().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[arqenium] failed to start:', err);
  process.exit(1);
});
