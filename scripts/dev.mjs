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
// Bind loopback by default. Set ARQ_DEV_HOST=0.0.0.0 to expose the dev servers
// on the LAN (or in a container/sandbox that proxies from another host).
const devHost = process.env.ARQ_DEV_HOST ?? '127.0.0.1';
const wantElectron = process.env.RUN_ELECTRON === '1';

/** Windows ships the Electron binary as electron.exe, not `electron`. */
function electronBinary() {
  const base = path.join(root, 'node_modules/electron/dist');
  const candidates =
    process.platform === 'win32' ? ['electron.exe'] : ['Electron.app/Contents/MacOS/Electron', 'electron'];
  for (const rel of candidates) {
    const full = path.join(base, rel);
    if (existsSync(full)) return full;
  }
  return null;
}

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
    if (child.killed) continue;
    if (process.platform === 'win32') {
      // Windows has no SIGTERM for a detached child; taskkill /T also takes the
      // grandchildren (tsx -> node) so ports are actually released.
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } catch {
        child.kill();
      }
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), process.platform === 'win32' ? 900 : 400);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// The API must be listening before Vite proxies to it, so start it first.
run('api', process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'src/server/main.ts'], {
  ARQ_API_PORT: apiPort,
  NODE_ENV: 'development',
});

await new Promise((r) => setTimeout(r, 1200));

run('vite', process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', devHost, '--port', '5173'], {
  ARQ_DEV_SERVER_URL: `http://${devHost === '0.0.0.0' ? '127.0.0.1' : devHost}:5173`,
});

if (wantElectron) {
  const electronPath = electronBinary();
  if (electronPath) {
    await new Promise((r) => setTimeout(r, 2500));
    run('electron', electronPath, [path.join(root, 'dist/electron/main.js')], {
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
if (devHost === '0.0.0.0') console.log('  Bound to      0.0.0.0 (LAN / sandbox preview)');
console.log('');
