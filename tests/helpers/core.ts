import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCore, type Core } from '../../src/core/core';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURE_APP = path.join(REPO_ROOT, 'tests/fixtures/fixture-app');

/**
 * A fresh in-memory core per test. The demo provider is seeded by the registry
 * so no network access or API key is ever required.
 */
export function makeCore(label = 'test'): Core {
  return createCore({
    inMemory: true,
    dataDir: path.join(REPO_ROOT, '.arqenium-data', label),
  });
}

export async function withIndexedProject(label = 'test'): Promise<{ core: Core; projectId: string }> {
  const core = makeCore(label);
  const project = await core.projects.add(FIXTURE_APP);
  await core.projects.reindex(project.id);
  return { core, projectId: project.id };
}

export async function waitFor<T>(fn: () => T | Promise<T>, predicate: (v: T) => boolean, timeoutMs = 8000, stepMs = 40): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
