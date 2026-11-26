#!/usr/bin/env node
/**
 * Desktop development launcher, identical on Windows, macOS and Linux.
 *
 * `npm run dev` starts the web runtime only. This wrapper additionally builds
 * the Electron main/preload bundles, then starts everything with
 * RUN_ELECTRON=1 so the desktop shell comes up against the Vite dev server.
 *
 * Windows note: setting an environment variable inline (`RUN_ELECTRON=1 npm
 * run dev`) does not work in cmd.exe or PowerShell, which is why this exists as
 * a script rather than a shell snippet.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, ...env },
      windowsHide: false,
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  console.log('[dev:desktop] building main, preload and renderer bundles…');
  await run(process.execPath, [path.join(root, 'scripts/build.mjs')]);
  console.log('[dev:desktop] starting Vite + API + Electron…');
  await run(process.execPath, [path.join(root, 'scripts/dev.mjs')], {
    RUN_ELECTRON: '1',
    NODE_ENV: 'development',
  });
}

main().catch((err) => {
  console.error(`[dev:desktop] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
