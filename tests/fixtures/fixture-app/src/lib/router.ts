import { formatRecord } from './format';

export interface Route {
  path: string;
  handler: (id?: string) => string;
}

export interface Router {
  list: () => string[];
  dispatch: (path: string, id?: string) => string;
  close: () => Promise<void>;
}

/** Minimal deterministic router used by the fixture server. */
export function createRouter(paths: string[]): Router {
  let closed = false;
  const routes: Route[] = paths.map((path) => ({
    path,
    handler: (id?: string) => formatRecord({ id: id ?? 'unknown', path }),
  }));

  return {
    list: () => routes.map((r) => r.path),
    dispatch: (path: string, id?: string) => {
      if (closed) throw new Error('router is closed');
      const match = routes.find((r) => r.path === path || r.path.replace(':id', '') + (id ?? '') === path);
      return match ? match.handler(id) : 'not-found';
    },
    close: async () => {
      closed = true;
    },
  };
}
