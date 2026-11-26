# Deploying the hosted preview

The Vercel deployment is a **static, read-only preview of the interface**. It is
not a hosted backend: the core needs a writable SQLite database, long-lived SSE
connections and native modules, none of which a serverless function provides.

What is deployed, in order of what the browser does:

1. `dist/renderer/index.html` — the real application shell.
2. `dist/renderer/preview-bridge.js` — bundled from `src/preview/bridge.ts`.
   It probes `GET /api/info`; because a static host answers the SPA fallback
   with HTML, the probe fails and the bridge installs itself onto
   `window.arqenium`.
3. `dist/renderer/assets/*` — the real renderer bundle, talking to the bridge
   through the same `lib/bridge.ts` it uses for Electron and HTTP.

Read channels answer from `src/preview/dataset.ts`, which is **captured from the
real core** running in demo mode. Every mutating channel answers
`preview_read_only` with a message telling the visitor to install the desktop
app.

## Build

```bash
npm run build:web      # node scripts/build.mjs --web
```

That produces only `dist/renderer` (renderer + bridge). It is the same command
`vercel.json` declares, so a git deployment builds exactly what a local build
produces. The full `npm run build` additionally emits the Electron and
standalone-server bundles, which the hosted preview does not use.

`vercel.json` copies the settings into the repository:

| Setting | Value |
| --- | --- |
| Framework preset | Other / Vite (no detection) |
| Build command | `npm run build:web` |
| Install command | `npm install --no-audit --no-fund --ignore-scripts` |
| Output directory | `dist/renderer` |
| Rewrites | everything except `/api/*` → `/index.html` (hash routing means this is belt and braces) |

## Deploy

1. **Push the branch.** `git push origin arena/c77da9df-arqenium`.
2. **Create or pick a Vercel project** linked to `M11-Developer/Arqenium`.
   `vercel.json` supplies the build settings; do not override them in the
   dashboard, or the two will disagree.
3. **Turn Deployment Protection off** for the project
   (Settings → Deployment Protection → Vercel Authentication → *Disabled*), or
   attach a custom domain. With protection on, every visitor is redirected to a
   Vercel login page and the preview is not public.
4. **Deploy.** Either let the git integration build on push, or trigger it:

   ```bash
   npx vercel --prod            # from a checkout of this branch
   ```

   The first build downloads ~620 npm packages and takes roughly 2–4 minutes.

## Verifying a deployment

```bash
curl -s https://<deployment>/ | grep -c preview-bridge.js     # expect 1
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/assets/<bundle>.js   # expect 200
```

Then open it: every destination in the left rail should render with sample data,
and any action that would write (adding a project, creating a run, running a
command) should answer with an explicit read-only message rather than failing
silently. `tests/10-hosted-preview.test.ts` asserts exactly this against the
built bundle in jsdom, so `npm test` covers the deployed artefact.

## Why not deploy the server

`src/server/main.ts` with `ARQ_DEMO_MODE=1` does run on a normal Node host (a
small VM, a container, Fly.io, Railway) and would give the preview a live core:
in-memory database, a seeded sample project that is genuinely indexed, and a
genuinely executed demo run. On Vercel, functions are ephemeral and cannot keep
the SSE stream open, which is why the hosted preview stays static. If a live
demo is wanted, deploy `npm run serve` to a container host instead and set
`ARQ_DEMO_MODE=1`, `ARQ_STATIC_DIR=dist/renderer`, `ARQ_API_HOST=0.0.0.0`.
