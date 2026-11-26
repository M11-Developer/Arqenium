#!/usr/bin/env node
/**
 * Regenerate src/preview/dataset.ts.
 *
 * The hosted preview ships real responses instead of invented ones, so the
 * dataset is captured, not written by hand:
 *
 *   node scripts/capture-preview-dataset.mjs
 *
 * It builds the server, starts it in demo mode on a spare port, seeds the
 * sample project, executes a demo run, then records what every read channel
 * returns. Absolute paths and entity ids are normalised so the result is a
 * stable, machine-independent file.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd();
const port = 4599;
const origin = `http://127.0.0.1:${port}`;

const PREVIEW_PROJECT_ID = 'prj_preview';
const PREVIEW_ROOT = 'C:\\Users\\you\\code\\sample-app';

async function invoke(channel, input = {}) {
  const res = await fetch(`${origin}/api/invoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, input }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`${channel}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${origin}/api/info`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('demo server did not start');
}

function normalise(value) {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === 'projectId' && typeof v === 'string') out[key] = PREVIEW_PROJECT_ID;
      else if (key === 'rootPath' && typeof v === 'string') out[key] = PREVIEW_ROOT;
      else out[key] = normalise(v);
    }
    return out;
  }
  return value;
}

async function main() {
  console.log('[capture] building…');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/build.mjs')], { stdio: 'ignore' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))));
    child.on('error', reject);
  });

  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'arqenium-capture-'));
  console.log('[capture] starting demo server…');
  const server = spawn(process.execPath, [path.join(root, 'dist/server/main.js')], {
    env: { ...process.env, ARQ_DEMO_MODE: '1', ARQ_DATA_DIR: dataDir, ARQ_API_PORT: String(port) },
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    await waitForServer();
    // Give the seeded run time to finish so the trace is complete.
    await sleep(2500);

    const projects = await invoke('projects.list');
    const projectId = projects[0]?.id;
    if (!projectId) throw new Error('demo mode seeded no project');
    const agents = await invoke('agents.list', { projectId });
    const runs = await invoke('runs.list', { projectId });
    const providers = await invoke('providers.list');
    const servers = await invoke('mcp.list');
    const suites = await invoke('evals.suites');
    const runId = runs[0]?.id;

    const requests = [
      ['app.info', {}],
      ['app.health', {}],
      ['modules.list', {}],
      ['projects.list', {}],
      ['projects.get', { projectId }],
      ['projects.tree', { projectId }],
      ['projects.file', { projectId, path: 'src/index.ts' }],
      ['projects.symbols', { projectId }],
      ['projects.search', { projectId, query: 'format' }],
      ['projects.graph', { projectId }],
      ['projects.impact', { projectId, paths: ['src/lib/format.ts'] }],
      ['projects.summary', { projectId, path: 'src/index.ts' }],
      ['projects.changes', { projectId }],
      ['projects.stats', { projectId }],
      ['agents.list', { projectId }],
      ['agents.templates', {}],
      ['runs.list', { projectId }],
      ['runs.get', { runId }],
      ['runs.events', { runId }],
      ['approvals.list', {}],
      ['providers.list', {}],
      ['providers.models', { id: providers[0]?.id }],
      ['trace.events', { limit: 50 }],
      ['trace.toolCalls', {}],
      ['trace.summary', {}],
      ['trace.eventTypes', {}],
      ['evals.suites', {}],
      ['evals.runs', {}],
      ['evals.results', { evalRunId: suites[0] ? `evr_${suites[0].id}` : 'evr_none' }],
      ['mcp.list', {}],
      ['mcp.directory', {}],
      ['mcp.internal.status', {}],
      ['terminal.sessions', { projectId }],
      ['terminal.history', { projectId }],
      ['terminal.explain', { command: 'git status' }],
      ['settings.list', {}],
      ['credentials.list', {}],
      ['context.list', { projectId }],
      ['rebuild.captures', {}],
    ];
    if (servers[0]) requests.push(['mcp.capabilities', { id: servers[0].id }]);

    const dataset = {};
    for (const [channel, input] of requests) {
      dataset[channel] = normalise(await invoke(channel, input));
      console.log(`[capture] ${channel}`);
    }
    dataset['app.info'].dataDir = '(hosted preview - sample data)';
    dataset['app.info'].runtime = 'preview';
    console.log(`[capture] ${agents.length} agents, ${runs.length} runs`);

    const header = `/**
 * Sample data captured from the real core while running in demo mode
 * (\`ARQ_DEMO_MODE=1\`): the seeded sample project was actually indexed, the
 * demo provider actually ran a task, and these are the responses the channels
 * returned. Do not hand-edit - regenerate with
 * \`node scripts/capture-preview-dataset.mjs\` against a local demo server.
 *
 * Only machine-specific values (absolute paths, ids) were normalised.
 */
export const PREVIEW_DATASET: Record<string, unknown> = `;
    await writeFile(
      path.join(root, 'src/preview/dataset.ts'),
      `${header}${JSON.stringify(dataset, null, 2)};\n`,
      'utf8',
    );
    console.log('[capture] wrote src/preview/dataset.ts');
  } finally {
    server.kill();
    await sleep(200);
  }
}

main().catch((err) => {
  console.error(`[capture] ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
