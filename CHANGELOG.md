# Changelog

All notable changes to ARQENIUM are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-11-27

Windows is now a first-class target and the hosted preview ships with the
release. The desktop build fixes below are the ones that made a packaged
Windows app actually start.

### Fixed

- **Sandboxed preload was ES module.** `dist/electron/preload.js` was emitted as
  ESM while the window runs with `sandbox: true`; Electron loads sandboxed
  preloads as CommonJS, so `window.arqenium` would never be defined and the
  packaged app would report "core unreachable". The preload is now bundled as
  CommonJS into `preload.cjs` and referenced explicitly.
- **Packaging metadata.** `main` is declared for the packaged app via
  `extraMetadata`, an application icon is generated (`public/icon.png`), and
  `directories.buildResources` no longer points at a directory that did not
  exist in a fresh checkout.
- **Windows child processes.** `spawn('npm', …, { shell: false })` fails on
  Windows (`.cmd` shims, PATHEXT); executables are now resolved through
  PATH × PATHEXT and `.cmd`/`.bat` targets launch through `cmd.exe /d /s /c`
  with explicit quoting, while real executables keep `shell: false`. Timed-out
  and cancelled commands use `taskkill /T /F` so no child is orphaned.
- **Path containment.** Case-folded and separator-aware on Windows/macOS, so
  `C:\work\proj` contains `c:\WORK\PROJ\src` but never `C:\work\proj-evil`.
- **Windows command risk rules** for `format`, `diskpart`, `reg`, `vssadmin`,
  drive-root deletes and `choco`/`winget`/`scoop` package mutations.

### Added

- **Windows support, end to end.** `src/core/paths.ts` provides case-folding, separator-aware path containment (`C:\work\proj` vs `c:\WORK\PROJ` vs `C:\work\proj-evil`), used by project file access, the static server and EchoShell's working directory. Executables are resolved through `PATH` × `PATHEXT`, spawned tools are hidden from the console, git porcelain output handles CRLF, and the app data directory follows `%APPDATA%`. `npm run dev:desktop` works identically in cmd, PowerShell and POSIX shells.
- **Windows packaging and releases.** `electron-builder` configuration with NSIS and portable x64 targets, an application icon, and a [`Windows`](.github/workflows/windows.yml) workflow that verifies, smoke-tests and builds the installers on `windows-latest`. Pushing a `v*` tag publishes those installers to a GitHub Release, with a `SHA256SUMS.txt` manifest next to them.
- **Hosted preview.** `src/preview/bridge.ts` supplies a labelled, read-only sample dataset so the Vercel deployment is explorable; it installs only when no real core answers `/api/info`, and every mutating channel answers with an explicit `preview_read_only` error instead of pretending to succeed. The dataset (`src/preview/dataset.ts`) is captured from the real core in demo mode by `scripts/capture-preview-dataset.mjs`, with a real index and a real executed demo run.
- **Server demo mode.** `ARQ_DEMO_MODE=1` runs the real core on an in-memory database with a seeded, genuinely indexed sample project.
- **Platform test suite.** `tests/09-platform-windows.test.ts` covers containment edge cases, executable resolution, a real temporary project and the per-platform data directory.
- **Preview test suite.** `tests/10-hosted-preview.test.ts` renders the built SPA in jsdom with no backend, walks all eleven destinations and asserts the dataset shapes and the refusals.

### Changed

- `npm run serve` starts the built server without platform-specific environment-variable syntax.
- `npm run build` emits the preload as `dist/electron/preload.cjs`.
- README and [docs/DEPLOY.md](docs/DEPLOY.md) document Windows behaviour, the hosted preview and the release process.

### Download

Windows users should take the release assets, not the source tree:

| Asset | Use |
| --- | --- |
| `ARQENIUM-1.1.0-win-x64.exe` | NSIS installer (per-user, choose the install directory, desktop and Start-menu shortcuts) |
| `ARQENIUM-1.1.0-win-x64-portable.exe` | Single executable, no installation |
| `SHA256SUMS.txt` | Verify a download with `Get-FileHash` |

The builds are unsigned, so Windows SmartScreen warns on first launch.

## [1.0.0] — 2026-11-25

First stable release. ARQENIUM is a local, desktop-first engineering command center: it indexes a repository on your machine, runs multi-agent engineering tasks against it through approval-gated tools, records every step in TraceX, and evaluates the result. Everything except live model calls works offline.

### Added

**Project intelligence**
- Local indexing with real parsers: TypeScript/JavaScript through the TypeScript compiler API, Python through a sandboxed child-process scanner, everything else through a structural fallback.
- Explicit `parseQuality` (`parsed` / `approximate` / `none`) stored per file and shown in the UI.
- File tree, per-file summaries, root-confined source viewing with a size cap and a NUL-byte binary probe.
- Parsed symbol table with search, plus an import graph.
- Impact analysis that returns **parsed** edges and **heuristic** test matches as separate, labelled result sets.
- `.gitignore`-aware exclusions so dependencies, build output and secret-shaped files never enter the index or a prompt.

**Orchestration**
- Runs modelled as a DAG of tasks with `dependsOn`, priority, retry policy and an ordered agent pipeline; each agent receives the previous agent's output.
- Hard budgets — wall clock, tool calls, tokens, task count — enforced by the engine; exceeding one fails the run and records which limit tripped.
- Cancellation, per-stage timeouts and iteration caps.
- Deterministic **demo provider** so the whole product is explorable and testable with no API key. Demo output is labelled in the UI and in TraceX.

**Agents & permissions**
- Agent records with role templates (Planner, Architect, Implementer, Reviewer, Tester), system prompt, model reference, tool grants, permission flags and limits.
- Least privilege by default: writes always create an approval, commands stay off unless EchoShell is enabled and the agent is granted them.
- Denials are returned to the agent as `denied` with an instruction not to retry, so a refused call never becomes a loop.

**Integrations (MCP)**
- MCP client over stdio and Streamable HTTP with lifecycle management, tool discovery and capability persistence.
- Deny-first per-tool policy (`allowed`, `denied`, `autoApproved`) with pattern matching and a result cap.
- Internal MCP server exposing ARQENIUM's own project-intelligence tools over loopback.

**Observability (TraceX)**
- Append-only event log with type, severity, source, run/task/agent ids, correlation id, duration and payload.
- Free-text, severity and event-type filters; a dedicated tool-call view; JSON export.
- Redaction at write time, asserted by an evaluation case.

**Evaluation lab**
- Built-in deterministic suites that run fully offline against a bundled fixture, plus AI-judged cases when an agent is selected.
- User-defined suites (name, description, kind, named cases).
- JSON and CSV export, re-run with the same configuration, and objective checks reported separately from model judgment.

**EchoShell** *(optional module, off by default)*
- Argument-vector execution with no shell, so pipes, redirects, chaining and substitution are rejected outright.
- Static risk assessment (`low` / `medium` / `high`) with human-readable reasons and an explain view.
- Hard blocklist that no approval can unlock: recursive root/home delete, fork bombs, `mkfs`, raw device writes, world-writable root, power-state changes.
- Preview → approve → execute, with filtered environment, output caps and redaction.

**Rebuild Studio** *(optional module, off by default)*
- Screenshot or page capture, then measurement: palette, contrast, horizontal bands, gutter, spacing scale, typography estimate.
- Proposed implementation (`tokens.css`, `index.html`, `ANALYSIS.md`) with measured facts kept separate from inferred tokens and a confidence label.
- Export gated by the same approval path as any other write.

**Platform**
- Electron desktop shell (`contextIsolation`, typed preload bridge, channel allow-list) and a headless web runtime with an identical core.
- Local HTTP API: `POST /api/invoke`, `GET /api/events` (SSE), static serving with SPA fallback confined to the build directory.
- 91 typed channels validated by zod before any service is entered; a module gate that answers `module_disabled` (HTTP 403).
- AES-256-GCM credential store with a 0600 key file and masked-only listings.
- SQLite persistence (WAL, foreign keys, sequential transactional migrations).
- Documentation: README, full tutorial, architecture reference, security policy, contributing guide, 14 generated stills and five narrated walkthrough videos.

### Changed

- Version promoted to **1.0.0** across `package.json`, the API `app.info` payload and the MCP client identity.
- Cross-fade between documentation scenes shortened and the video canvas standardised at 1440×800 for legible UI text.

### Fixed

- **Project file viewing** now probes the first 4 KB for NUL bytes before rendering, so a binary file is refused with `Binary file cannot be displayed: <path>` instead of corrupting the pane.
- **API error reporting** for a missing `channel` field returns `400 invalid_input` with a precise message instead of a generic failure.
- **Bundled server output** no longer crashes on `__filename is not defined`: Node-side entrypoints build as ESM with externals and a CJS-safe banner.
- **Renderer imports** collapsed and a duplicated `formatDateTime` helper removed.

### Security

- Origin allow-list on the HTTP API (`origin_forbidden`, 403), loopback binding by default, and `OPTIONS` preflight handled inside the same check.
- 4 MB request body cap that drains the socket and answers `413` rather than resetting the connection.
- Path confinement for every read, write and static file: `path.resolve` plus prefix check.
- Secret masking and environment filtering before any prompt, trace record or command spawn.

### Known limitations

- Electron runtime binaries cannot be downloaded in some sandboxed environments; the web runtime is the supported path there and exercises the same core.
- Python indexing is structural rather than AST-complete, and is reported as such.
- Single-user by design: no multi-tenant sync, no remote database.

[1.0.0]: https://github.com/M11-Developer/Arqenium/releases/tag/v1.0.0
