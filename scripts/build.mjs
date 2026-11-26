#!/usr/bin/env node
/**
 * ARQENIUM production build.
 *
 *  1. Vite builds the React renderer into dist/renderer
 *  2. esbuild bundles the Electron main process and preload into dist/electron
 *  3. esbuild bundles the standalone API server into dist/server
 *  4. esbuild bundles the hosted-preview bridge next to the renderer
 *
 * Nothing here requires network access.
 */
import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import { readFile, rm, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const dist = path.join(root, 'dist');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  // Native, Electron-provided and very large runtime deps stay external so they
  // load from node_modules instead of being inlined (typescript alone is ~11 MB
  // and its CommonJS internals assume __filename, which ESM does not define).
  external: ['electron', 'better-sqlite3', 'chokidar', 'fsevents', 'typescript'],
  banner: {
    js: [
      "import { createRequire as __arqCreateRequire } from 'node:module';",
      "import { fileURLToPath as __arqFileURLToPath } from 'node:url';",
      "import { dirname as __arqDirname } from 'node:path';",
      'const require = __arqCreateRequire(import.meta.url);',
      'const __filename = __arqFileURLToPath(import.meta.url);',
      'const __dirname = __arqDirname(__filename);',
    ].join(' '),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

async function main() {
  const t0 = Date.now();
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  console.log('\n[build] 1/4 renderer');
  await viteBuild();

  console.log('\n[build] 2/4 electron main + preload');
  await esbuild({
    ...shared,
    entryPoints: [path.join(root, 'src/electron/main.ts')],
    outfile: path.join(dist, 'electron/main.js'),
  });
  await esbuild({
    ...shared,
    entryPoints: [path.join(root, 'src/electron/preload.ts')],
    outfile: path.join(dist, 'electron/preload.js'),
  });

  console.log('\n[build] 3/4 standalone API server');
  await esbuild({
    ...shared,
    entryPoints: [path.join(root, 'src/server/main.ts')],
    outfile: path.join(dist, 'server/main.js'),
  });

  console.log('\n[build] 4/4 hosted preview bridge');
  // A browser-side IIFE, inlined next to index.html by Vite (see index.html).
  await esbuild({
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
    minify: true,
    sourcemap: false,
    logLevel: 'info',
    define: { 'process.env.NODE_ENV': '"production"' },
    entryPoints: [path.join(root, 'src/preview/bridge.ts')],
    outfile: path.join(dist, 'renderer/preview-bridge.js'),
  });

  // The `?url` suffix stops Vite from inlining the classic <script> into the
  // module graph; strip it so the served HTML points at the real file.
  const htmlFile = path.join(dist, 'renderer/index.html');
  const html = await readFile(htmlFile, 'utf8');
  await writeFile(htmlFile, html.replace('preview-bridge.js?url', 'preview-bridge.js'));

  const sizes = [];
  for (const rel of [
    'renderer/index.html',
    'renderer/preview-bridge.js',
    'electron/main.js',
    'electron/preload.js',
    'server/main.js',
  ]) {
    try {
      const s = await stat(path.join(dist, rel));
      sizes.push(`${rel}: ${(s.size / 1024).toFixed(1)} KB`);
    } catch {
      sizes.push(`${rel}: MISSING`);
    }
  }
  console.log('\n[build] artifacts');
  for (const s of sizes) console.log(`  ${s}`);
  console.log(`\n[build] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('[build] failed:', err);
  process.exit(1);
});
