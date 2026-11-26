import { createRouter } from './lib/router';
import { loadConfig } from './lib/config';
import type { AppConfig } from './lib/config';

export interface ServerHandle {
  port: number;
  routes: string[];
  stop: () => Promise<void>;
}

/**
 * Entrypoint of the fixture application. It wires configuration and the route
 * table together so the indexing tests can assert real import edges.
 */
export async function startServer(configPath?: string): Promise<ServerHandle> {
  const config: AppConfig = loadConfig(configPath ?? 'config.json');
  const table = routes(config);
  const router = createRouter(table);

  return {
    port: config.port,
    routes: router.list(),
    async stop() {
      await router.close();
    },
  };
}

export function routes(config: AppConfig): string[] {
  const base = ['/health', '/version'];
  if (config.features.includes('records')) {
    base.push('/records', '/records/:id');
  }
  return base;
}

export const routesTable = routes;

if (require.main === module) {
  void startServer().then((handle) => {
    console.log(`listening on ${handle.port}`);
  });
}
