#!/usr/bin/env node
/**
 * ARQENIUM development launcher.
 *
 * Starts:
 *  - the local API server (tsx watch) on ARQ_API_PORT (default 4319)
 *  - the Vite dev server on 5173, proxying /api to the API server
 *  - optionally the Electron shell when RUN_ELECTRON=1 and a binary exists
 *
 * In this sandbox Electron's binary cannot be downloaded, so the web runtime is
 * the supported development/preview path. The Electron entrypoint is still
 * built and typechecked by `npm run build`.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const apiPort = process.env.ARQ_API_PORT ?? '4319';
const wantElectron = process.env.RUN_ELECTRON === '1';

const children = [];
let shuttingDown = false;

function run(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    shell: false,
  });
  children.push({ name, child });
  const prefix = `[${name}]`;
  child.stdout?.on('data', (d) => process.stdout.write(d.toString().replace(/^(?=.)/gm, `${prefix} `)));
  child.stderr?.on('data', (d) => process.stderr.write(d.toString().replace(/^(?=.)/gm, `${prefix} `)));
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`${prefix} exited (code=${code ?? 'null'} signal=${signal ?? 'none'})`);
    if (name === 'api' || name === 'vite') shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 400);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// The API must be listening before Vite proxies to it, so start it first.
run('api', process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'src/server/main.ts'], {
  ARQ_API_PORT: apiPort,
  NODE_ENV: 'development',
});

await new Promise((r) => setTimeout(r, 1200));

run('vite', process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '0.0.0.0', '--port', '5173'], {
  ARQ_DEV_SERVER_URL: 'http://127.0.0.1:5173',
});

if (wantElectron) {
  const electronBinary = path.join(root, 'node_modules/electron/dist/electron');
  if (existsSync(electronBinary)) {
    await new Promise((r) => setTimeout(r, 2500));
    run('electron', electronBinary, [path.join(root, 'dist/electron/main.js')], {
      ARQ_DEV_SERVER_URL: 'http://127.0.0.1:5173',
      NODE_ENV: 'development',
    });
  } else {
    console.log(
      '[dev] RUN_ELECTRON=1 but no Electron binary is installed in node_modules/electron/dist.\n' +
        '[dev] The desktop shell cannot start in this environment; the web runtime is running instead.\n' +
        '[dev] Install Electron on a machine with network access to run the desktop app.',
    );
  }
}

console.log('');
console.log('  ARQENIUM development runtime');
console.log(`  Web UI        http://localhost:5173`);
console.log(`  Local API     http://127.0.0.1:${apiPort}`);
console.log('');
