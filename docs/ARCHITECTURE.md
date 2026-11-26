# ARQENIUM — Architecture

How ARQENIUM 1.0.0 is put together: the process model, the request path, every service, the data model, and the security boundaries that make an agent safe to run against a real repository.

**Contents**

1. [Design intent](#design-intent)
2. [Process model & runtimes](#process-model--runtimes)
3. [The request path](#the-request-path)
4. [Directory map](#directory-map)
5. [Core services](#core-services)
6. [Project intelligence](#project-intelligence)
7. [Orchestration](#orchestration)
8. [Approvals & the tool router](#approvals--the-tool-router)
9. [MCP (OpenBridge)](#mcp-openbridge)
10. [Observability (TraceX)](#observability-tracex)
11. [Evaluation](#evaluation)
12. [EchoShell](#echoshell)
13. [Rebuild Studio](#rebuild-studio)
14. [Data model](#data-model)
15. [Security model](#security-model)
16. [Error contract](#error-contract)
17. [Build & packaging](#build--packaging)
18. [Testing strategy](#testing-strategy)
19. [Extending](#extending)
20. [Design decisions & trade-offs](#design-decisions--trade-offs)

---

## Design intent

Five properties drive every decision in the codebase:

1. **Local by default.** The database, the index, the credentials and the traces live on the machine. Network egress happens only when you configure a provider and start a run.
2. **One validated door.** Every renderer → core call goes through a single dispatcher that parses a zod contract first. No page talks to a service directly, and there is no second, unvalidated code path.
3. **Nothing silently privileged.** Writes, commands and MCP tool calls pass through an explicit policy layer that can require a human. Denials are recorded and returned to the agent as denials.
4. **Honest reporting.** Demo output is labelled. Parse quality is labelled. Parsed graph edges and heuristic impact guesses are separate lists. There is no fake streaming and no claimed benchmark.
5. **Everything is an event.** If it happened, it is in TraceX — the UI reads the same records the audit trail keeps.

## Process model & runtimes

ARQENIUM has one core and two thin front-ends.

```
┌───────────────────────────── Electron (optional) ─────────────────────────────┐
│ main process                       preload (contextIsolation)                 │
│  · creates the Core                · exposes a typed allow-list               │
│  · registers ipcMain handlers      · window.arqenium.invoke(channel, payload)  │
│  · loads the built renderer        · window.arqenium.onEvent(cb)               │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                    │  ipcRenderer.invoke
┌───────────────────────────────────▼───────────────────────────────────────────┐
│ Renderer — React 19 + Vite + zustand                                          │
│   pages → lib/bridge.ts → window.arqenium.invoke | fetch('/api/invoke')       │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                    │  channel + JSON payload
┌───────────────────────────────────▼───────────────────────────────────────────┐
│ Core (Node 22, in-process in Electron, standalone in web mode)                │
│   Dispatcher → zod parse → service call → SQLite (better-sqlite3, WAL)        │
│   Every service write emits an EventBus event → TraceX + SSE                  │
└───────────────────────────────────────────────────────────────────────────────┘
```

| Runtime | Entrypoint | Transport | Used for |
| --- | --- | --- | --- |
| **Electron desktop** | `src/electron/main.ts` | `ipcRenderer.invoke` over a fixed channel allow-list | The product |
| **Web / headless** | `src/server/main.ts` → `src/server/http.ts` | `POST /api/invoke` + `GET /api/events` (SSE) | Development, CI, restricted networks |
| **Hosted interface preview** | `src/preview/bridge.ts` (bundled with the renderer) | In-process: no network at all | The Vercel deployment — read-only sample data |

Both runtimes construct the **same** `Core` and the **same** `Dispatcher`, so behaviour — validation, module gating, errors — is identical. Only the transport differs. That is deliberate: it means a bug found in one is a bug in both, and a test written against the HTTP API covers the desktop path too.

### Runtimes

`npm run dev` starts the API (tsx watch, port 4319) and Vite (5173, proxying `/api`). The built app runs as a single process:

```bash
npm run build
ARQ_API_PORT=4400 ARQ_STATIC_DIR=dist/renderer node dist/server/main.js
```

With `ARQ_STATIC_DIR`, the same process serves the renderer with an SPA fallback, confined to that directory by `isInside` (see [Cross-platform behaviour](#cross-platform-behaviour)), so `../` cannot escape. The Electron path is built and typechecked by every `npm run build` even where the Electron binary cannot be downloaded.

### The hosted preview (and what it is not)

A static host cannot run the core: it needs a writable database, long-lived SSE connections and native modules. Rather than pretend, the Vercel deployment ships a **labelled, read-only interface preview**:

```
index.html ──> preview-bridge.js ──(installs only if /api/info is not JSON)──> window.arqenium
                                                                                    │
dist/renderer/assets/*.js ──> lib/bridge.ts ──> window.arqenium.invoke ─────────────┘
                                                (calls the real API when present)
```

- `src/preview/dataset.ts` is **captured** from the real core in demo mode by `scripts/capture-preview-dataset.mjs` — a genuinely indexed project, a genuinely executed demo run, the real suite definitions. Nothing is invented.
- Every mutating channel has an explicit refusal in `src/preview/bridge.ts` (`preview_read_only`), so no button silently lies.
- The bridge probes `GET /api/info` and only installs when the response is not JSON. `npm run dev`, `npm run serve` and Electron therefore always talk to the real core.
- `tests/10-hosted-preview.test.ts` renders the built SPA in jsdom with no backend and walks all eleven destinations, so this path is covered by CI.

## Cross-platform behaviour

Windows is a first-class target, not an afterthought. The rules are centralised so they cannot drift:

| Concern | Where | Rule |
| --- | --- | --- |
| Path containment | `src/core/paths.ts` | Case-folded on Windows and macOS, separator-aware, `path.resolve`d on both sides. `C:\work\proj` contains `c:\WORK\PROJ\src`, never `C:\work\proj-evil` |
| Executables | `resolveExecutable` in `src/core/terminal/service.ts` | `PATH` × `PATHEXT` lookup (`.exe`, `.cmd`, `.bat`, `.com`) so `npm`/`npx` spawn without a shell; absolute paths pass through |
| Child processes | every `execFile`/`spawn` | `shell: false` plus `windowsHide: true` — no console windows, no shell quoting |
| Line endings | git porcelain, file reads, diffs | split on `/\r?\n/` |
| Data directory | `resolveDataDir` in `src/core/core.ts` | `%APPDATA%\Arqenium` on Windows, `~/Library/Application Support/Arqenium` on macOS, `$XDG_DATA_HOME` otherwise |
| Shutdown | `scripts/dev.mjs` | `taskkill /T /F` on Windows so Vite/Electron are not orphaned |
| Packaging | `package.json` → `build` | NSIS installer + portable `.exe`, `asarUnpack` for `.node` binaries |

`tests/09-platform-windows.test.ts` asserts the platform-conditional parts of this, and `.github/workflows/windows.yml` runs the whole suite, the built-API smoke test and an installer build on `windows-latest`.

## The request path

```
UI control
  → bridge.request(channel, payload)
    → POST /api/invoke {channel, payload}      (or ipc)
      → CORS/origin check                      (web only, 403 origin_forbidden)
      → body size cap 4 MB                     (413 payload_too_large)
      → Dispatcher.dispatch(channel, payload)
          → channel in requestSchemas ?        (else 400 unknown_channel)
          → zod safeParse                      (else 400 invalid_input + issues)
          → route() → service                  (throws DispatchFailure on policy)
      → {ok: true, result} | {ok: false, error}
        → HTTP status from code map            (400/403/404/405/409/413/500)
          → bridge resolves or throws AppError
```

Three rules hold everywhere:

- **Requests are untrusted, responses are trusted.** Only requests are parsed. Responses are built by core code from typed structures.
- **No channel bypasses the modules table.** Each channel declaration names the module that owns it; a disabled module answers `module_disabled` before the service is entered.
- **Errors are typed, not stringly.** `DispatchFailure` carries a machine `code`; the HTTP layer maps codes to statuses and only falls back to message classification for domain errors raised by services.

## Directory map

```
src/
├── shared/                 contracts shared by all three processes
│   ├── channels.ts         zod request schemas for all 91 channels
│   ├── types.ts            domain types, module ids, statuses
│   ├── events.ts           event envelope + event type registry
│   ├── catalog.ts          role templates, tool catalog, MCP catalog
│   └── ids.ts              id generation, timestamps
├── core/                   the entire application logic (no UI, no transport)
│   ├── core.ts             composition root: builds and wires every service
│   ├── dispatcher.ts       channel → zod → service, version constant
│   ├── db/                 better-sqlite3 open + pragmas + migrations
│   ├── events/bus.ts       typed in-process pub/sub (SSE + TraceX source)
│   ├── projects/           indexing, tree, files, symbols, graph, impact
│   │   └── lang/           typescript.ts, python.ts, registry.ts
│   ├── agents/             agent CRUD + role templates
│   ├── orchestration/      engine (DAG scheduler), prompt builder, tool router
│   ├── approvals.ts        request/decide/expire, risk levels
│   ├── mcp/                client (stdio + http), internal server, types
│   ├── providers/          registry + adapters (openai, anthropic, gemini, demo)
│   ├── traces/             event persistence, filters, tool-call queries
│   ├── evals/              suites (built-in + user), runner, export
│   ├── terminal/           EchoShell sessions, argv parsing, risk assessment
│   ├── rebuild/            capture, analyze, generate, export
│   ├── context/            project conventions injected into prompts
│   ├── credentials.ts      AES-256-GCM store, masked listing
│   ├── redact.ts           secret masking + env filtering
│   ├── modules.ts          capability registry and gate
│   └── settings.ts         typed key/value persistence
├── server/                 local HTTP API (invoke + SSE + static)
├── electron/               main.ts (window, IPC) + preload.ts (bridge)
└── renderer/               React app: 12 pages, Shell, ui.tsx, theme
tests/                      9 suites (01…08 + helpers) over the core
docs/                       this documentation, its generator, stills, videos
```

## Core services

| Service | Owns | Key guarantees |
| --- | --- | --- |
| `SettingsService` | `settings` table | Typed get/set; read at call time, never cached stale |
| `ModuleService` | `modules` table | Core modules cannot be disabled; `isEnabled` checked before work |
| `CredentialStore` | `credentials` + `secret.key` | AES-256-GCM; key file mode 0600; list returns masked hints only |
| `ProjectService` | `projects`, `indexed_files`, `symbols`, `file_edges` | Path confinement to the project root; `.gitignore` aware; binary probe |
| `AgentService` | `agents` | Permission flags are first-class, not free text |
| `ToolRouter` | — | Every tool call: grant check → policy check → approval → execute |
| `Orchestrator` | `runs`, `tasks` | DAG scheduling, hard budgets, cancellation, retries |
| `ApprovalService` | `approvals` | Explicit decisions, expiry, recorded against a principal |
| `McpClientManager` | `mcp_servers`, `mcp_capabilities` | Transport lifecycle, tool discovery, deny-first policy |
| `InternalMcpServer` | — | Exposes project tools to external MCP clients |
| `ProviderRegistry` | `providers` | Adapter map, health tracking, demo seeding |
| `TraceService` | `events`, `tool_calls` | Append-only, redacted on write, filterable |
| `EvalService` | `eval_*` tables | Deterministic + AI cases, exports, re-runs |
| `TerminalService` | `terminal_*` | argv-only execution, static risk assessment, hard blocklist |
| `RebuildService` | `rebuild_*` | Measured vs inferred separation, approval-gated export |
| `ContextService` | `context_entries` | Conventions injected into prompts, scoped per project |

The composition root (`core/core.ts`) is the only place that knows about all of them; nothing else reaches across.

## Project intelligence

### Indexing pipeline

```
scan(root)            chokidar-free recursive walk, .gitignore + built-in rules
  → classify(ext)     language registry: typescript | python | structural
  → read (capped)     size limit, NUL-byte probe → binary files skipped
  → parse             TS: compiler API (real AST)
                      PY: syntax-aware definition/import scanner
                      *:  structural (functions/classes/exports guess) → approximate
  → persist           indexed_files + symbols + file_edges (replaced atomically)
  → events            project.indexed / project.indexError
```

Exclusions are applied before reading, and the exclusion set is stored per project. `node_modules`, `dist`, `build`, `out`, `.git`, coverage output and `.env`-style files never enter the index — which also means they never enter a prompt.

**Parse quality is stored, not inferred.** `parseQuality` on a file is `parsed`, `approximate` or `none`, and the UI renders it. A structural guess is never presented with the same authority as a compiler-API result.

### Queries

| Operation | Implementation |
| --- | --- |
| Tree | Materialised from `indexed_files` paths; no disk access |
| File read | Root-confined `path.resolve` + prefix check, size cap, NUL probe |
| Symbols | SQL over `symbols` with FTS-style `LIKE` on name; kind/container/line/exported |
| Graph | `file_edges` joined to file names, returned as nodes + edges |
| Impact | BFS over import edges from the changed file; separately, heuristic test matching by name convention |
| Summary | Per-file one-liners for prompt context |

**Impact analysis keeps two result sets.** `confidence: 'parsed'` means a real import edge exists. `confidence: 'heuristic'` means a test filename matched a pattern. They are returned and rendered separately so a reader can tell a fact from a guess.

## Orchestration

A **run** is a DAG of **tasks**; a **task** is a **pipeline** of agents.

```
Run (status, mode, budgets, stats)
 └── Task (dependsOn[], pipeline[agentId], priority, maxAttempts, input)
      └── Stage per agent in pipeline (iterations, tool calls, timeout)
```

Scheduling loop:

1. Select ready tasks (all `dependsOn` completed, status `pending`), ordered by priority then creation.
2. For each, walk the pipeline in order. Each agent receives the previous agent's output as input.
3. Each stage: build the system prompt (`orchestration/prompt.ts`) from the agent config + project context + tool catalog, then loop up to `maxIterations`:
   - call the provider (live) or the demo adapter;
   - parse tool calls from the response;
   - route every call through the `ToolRouter`;
   - stop on a final answer, an iteration cap, or a stage timeout.
4. Budgets are checked between every step. Exceeding one fails the run with the budget named in the event.
5. Cancellation sets a flag the loop checks; in-flight stages are abandoned and marked `canceled`.
6. Every transition emits an event, so the UI needs no polling and TraceX needs no separate writer.

**Budgets are hard.** `maxDurationMs`, `maxToolCalls`, `maxTokens`, `maxTasks` — the engine enforces them, records which one tripped, and never silently continues.

**Untrusted data stays data.** Task input and project context are assembled into the prompt as clearly delimited data, never as instructions, so a checked-in file cannot become a directive.

## Approvals & the tool router

Every tool call — from an agent, from MCP, or from the UI's Test button — passes the same path:

```
ToolRouter.call(tool, args, ctx)
  ├─ module gate            owning module enabled?           else module_disabled (403)
  ├─ agent grant            tool in agent.tools?             else not_permitted (403)
  ├─ permission flags       canWriteFiles / canRunCommands?  else not_permitted (403)
  ├─ path confinement       inside the project root?         else not_permitted (403)
  ├─ policy                 MCP allow/deny patterns          else not_permitted (403)
  ├─ approval               needed and not autoApproved?
  │     → approvals row (risk, title, args, run/task ids)
  │     → approval.requested event
  │     → task parks until decide()
  ├─ execute                perform the operation
  └─ record                 tool_calls row + tool.call event (redacted)
```

Approval decisions are terminal and typed: `approved`, `denied`, `expired`, `canceled`. A denial returns a normal tool result of `denied` plus an instruction not to retry, so the model continues rather than looping. An expired approval fails the stage with a clear reason.

Risk levels: `low` (read-only), `medium` (writes), `high` (commands and destructive operations). The UI colours them and the TraceX record keeps them.

## MCP (OpenBridge)

```
McpClientManager
 ├── transports: stdio (child process) | http (Streamable HTTP, stateful)
 ├── lifecycle: connect → initialize → tools/list → persist capabilities
 ├── policy:    deny-first pattern matching (allowed, denied, autoApproved)
 └── calls:     tools/call with a result cap, surfaced to the UI and to agents

InternalMcpServer
 └── serves ARQENIUM's own tools (project_structure, search_symbols, read_file …)
     at http://127.0.0.1:4321/mcp for external MCP clients
```

Tool visibility rules, in order: denied patterns win; then allowed patterns; anything unmatched is invisible to agents and refused at call time with `not_permitted`. Auto-approval only applies within the allowed set, so it can never widen access — only remove a prompt.

The internal server gives the ecosystem a way in without giving it the database: it speaks MCP over loopback and routes through the same tool router, so module gates and permissions still apply.

## Observability (TraceX)

- `EventBus` is an in-process typed emitter. Every service publishes; two subscribers persist (TraceService) and fan out (SSE to the renderer).
- Events carry `type`, `severity`, `source`, `runId`, `taskId`, `agentId`, `correlationId`, `durationMs`, `message`, `payload`.
- `correlationId` is the thread that ties a run → task → tool call → approval together; the detail panel exposes it so one click can reconstruct a chain.
- Payloads are **redacted on write**. Secret-shaped values are masked before persistence, so the audit trail can be shared.

Event families: `app.*`, `project.*`, `agent.*`, `run.*`, `task.*`, `tool.call`, `approval.*`, `mcp.*`, `eval.*`, `terminal.*`, `rebuild.*`, `provider.*`, `module.*`.

## Evaluation

Suites are either **built-in** (`evals/suites.ts`, running against the bundled fixture and the live index) or **user-defined** (name, description, kind, named cases). A case is one of:

- `fixture_content` — a checked-in fixture file must contain given markers and a minimum line count;
- `no_secret_leak` — the last N TraceX events must contain none of the forbidden patterns;
- `project_index` — the live index must have at least N files and symbols;
- `symbol_search` — searching a term must return results;
- `ai` — an agent judges the criteria (recorded separately from objective checks).

The runner records per-case `pass` / `fail` / `error` / `skipped` with duration, plus run-level totals. Modes are `live` and `demo`, and the mode is shown in results so nobody mistakes a demo pass for a model evaluation.

## EchoShell

```
input string
  → tokenizer           split to argv; reject pipes, redirects, &&, ;, $(), backticks
  → assessCommand       static risk: binary class, destructive flags, hard blocklist
  → preview             argv, cwd (project-confined), risk, reasons, blocked?
  → approval            approved and run | denied   (approval id recorded)
  → spawn(argv)         no shell: shell:false, filtered env, timeout, output cap
  → result              exit code, stdout/stderr (redacted), duration
```

Hard blocks (no approval unlocks them): recursive delete of `/` or `~`, fork bombs, `mkfs`, `dd of=/dev/…`, `chmod -R 777 /`, power-state changes. Because execution never uses a shell, quoting games and metacharacter injection have no surface.

## Rebuild Studio

```
capture(file | url)      file: base64 → disk, size/type checked
                         url:  fetch → stored markup
  → analyze              PNG/JPEG decode (pngjs, jpeg-js) → palette, bands,
                         gutter, spacing scale, contrast, typography estimate
  → generate             tokens.css, index.html, ANALYSIS.md with warnings
  → preview              file list + contents
  → export               target dir inside project root → approval → write
```

Measured facts (dimensions, palette, contrast, bands) and inferred tokens (spacing scale, component estimates, confidence) are stored and rendered as separate groups. Export goes through the approval path, so a reconstruction can be reviewed before it touches the repository.

## Data model

SQLite, WAL, foreign keys on, sequential migrations applied once inside a transaction.

| Table | Purpose |
| --- | --- |
| `settings` | Typed key/value config |
| `modules` | Enabled flag + per-module config |
| `projects` | Root path (unique), name, index state, stats, exclusions |
| `indexed_files` | One row per file: language, size, hash, parse quality, summary |
| `symbols` | Name, kind, container, file, line, exported |
| `file_edges` | Import edges (source → target, kind) |
| `agents` | Role, prompt, model, tools, permission flags, limits |
| `runs` / `tasks` | Run graph, statuses, budgets, stats, outputs |
| `approvals` | Kind, risk, title, payload, status, decision, run/task |
| `events` | TraceX: type, severity, correlation, payload (redacted) |
| `tool_calls` | Tool, args, status, duration, run/task/agent |
| `providers` | Kind, name, base URL, default model, enabled |
| `credentials` | Scope, ref, ciphertext, masked hint, updated |
| `mcp_servers` / `mcp_capabilities` | Server config, transport, policy, discovered tools |
| `context_entries` | Project conventions injected into prompts |
| `eval_suites` / `eval_cases` / `eval_runs` / `eval_results` | Suites and results |
| `terminal_sessions` / `terminal_commands` | Sessions, previews, executions |
| `rebuild_captures` / `rebuild_analyses` / `rebuild_exports` | References through to exports |
| `artifacts` | Files produced by runs or tools |

Deleting `$ARQ_DATA_DIR` resets the application completely; nothing is written outside it (except files you explicitly approve an agent to write inside a project).

## Security model

| Boundary | Control |
| --- | --- |
| Renderer → core | Single dispatcher, zod-parsed, channel allow-list; Electron `contextIsolation` + preload with an explicit channel set |
| Browser → API | Loopback bind by default; strict origin allow-list (`origin_forbidden`, 403); same-host allowed |
| Paths | Project root confinement via `isInside` (case-folded, separator-aware) on every read/write/serve; `../` and sibling-prefix tricks cannot escape |
| Body size | 4 MB cap with socket draining, answered `413` rather than a reset |
| Credentials | AES-256-GCM with a 0600 key file; listings expose masked hints only; values decrypted only at call time |
| Prompts | Secrets filtered from process env (`filterEnv`), context treated as data, demo output labelled |
| Traces | Redaction on write; the `no_secret_leak` eval case asserts it |
| Commands | argv execution, no shell, static risk assessment, hard blocklist, approval required |
| Modules | Server-side gate; disabled means `module_disabled` (403) and no background work |
| Network | No telemetry, no update check, no analytics; egress only to a provider you configured |

Full disclosure process: [SECURITY.md](../SECURITY.md).

## Error contract

| Code | HTTP | Meaning |
| --- | --- | --- |
| `unknown_channel` | 400 | Channel is not in the contract |
| `invalid_input` | 400 | zod rejected the payload (`details` carries the issues) |
| `invalid_json` | 400 | Body is not JSON |
| `not_permitted` | 403 | Tool not granted, policy denied, or path escaped the root |
| `module_disabled` | 403 | Owning module is off |
| `origin_forbidden` | 403 | Browser origin not in the allow-list |
| `not_found` | 404 | Unknown entity or route |
| `method_not_allowed` | 405 | `/api/invoke` requires POST |
| `conflict` / `approval_required` | 409 | Concurrent state change or a pending approval |
| `payload_too_large` | 413 | Body over 4 MB |
| `preview_read_only` | — | Client-side only: the hosted preview refusing a mutation |
| `request_failed` | 500 | Domain error; the message is passed through |

## Build & packaging

`scripts/build.mjs` runs esbuild for the Node-side entrypoints (server, Electron main, preload) with native modules externalised and a CJS-safe banner (`__filename`/`__dirname` shims so ESM output does not crash), then Vite for the renderer into `dist/renderer`. `scripts/dev.mjs` runs the API under tsx watch plus Vite with `/api` proxied, and optionally launches Electron when `RUN_ELECTRON=1` and the binary exists.

A fourth step bundles `src/preview/bridge.ts` into `dist/renderer/preview-bridge.js` as a standalone IIFE, and the `?url` marker in `index.html` keeps Vite from trying to inline a classic script.

`electron-builder` config produces `pack:dir` (unpacked) and `dist` (installers) for Windows (NSIS + portable), macOS (dmg) and Linux (AppImage). Both need the Electron runtime binary to be downloadable in your environment; where it is not, the web runtime is the supported path and exercises the identical core. The Windows installers are built on a real Windows runner by `.github/workflows/windows.yml`, because cross-building a native module from Linux is not something to trust.

## Testing strategy

Eleven suites, 118 tests, vitest, no browser required (the preview suite uses jsdom):

| Suite | Focus |
| --- | --- |
| `01-project-indexing` | Scan, exclusions, TS/Python parsing, parse quality, binary probe |
| `02-search-and-graph` | Symbol search, graph edges, impact confidence separation |
| `03-orchestration` | DAG order, budgets, retries, cancellation, demo mode labelling |
| `04-context-and-providers` | Context injection, provider CRUD, demo adapter, credentials masking |
| `05-mcp` | stdio + http round trip, discovery, deny-first policy, internal server |
| `06-traces-and-evals` | Event persistence, filters, redaction, suites, exports |
| `07-modules-terminal-rebuild` | Module gating, argv safety, blocklist, rebuild facts |
| `08-api-and-validation` | HTTP contract, statuses, origins, body cap, error codes |
| `09-platform-windows` | Path containment edge cases, `PATHEXT` resolution, a real temp project, per-platform data directory |
| `10-hosted-preview` | Built SPA rendered in jsdom with no backend, all eleven routes, refusals, dataset shapes |

The tests drive the same `Core` and `Dispatcher` the app uses — there is no mock core.

## Extending

### Adding a provider

1. Implement `ProviderAdapter` in `src/core/providers/adapters/` (`id`, `caps`, `chat`, `listModels`, `health`).
2. Register it in `ProviderRegistry`'s constructor.
3. Add the kind to `ProviderKind` in `shared/types.ts` and the env fallback in `ENV_KEYS`.
4. Surface it in the Settings *Provider type* select.

Capabilities are declared, not assumed — if your adapter cannot stream, say so and the UI will not offer it.

### Adding a language

1. Implement a `LanguageAdapter` in `src/core/projects/lang/` (`extensions`, `parse(content, path)` returning symbols, imports and a parse quality).
2. Register it in `lang/registry.ts`.
3. Add a fixture and a case to `01-project-indexing`.

Report `approximate` unless you parse a real syntax tree.

### Adding a channel

1. Declare the request schema in `shared/channels.ts` and note its owning module.
2. Add the response type in `shared/types.ts` if it is new.
3. Handle it in `Dispatcher.route()` — parse has already happened.
4. Add a test in the matching suite. The channel count assertion in the API suite will tell you if a count changed.

## Design decisions & trade-offs

| Decision | Why | Cost |
| --- | --- | --- |
| One dispatcher, two transports | Validation and policy cannot drift between desktop and web | A little indirection in `bridge.ts` |
| SQLite over a server DB | Zero setup, single file, transactional, fine for one user | Not multi-user; delete the folder to reset |
| Demo provider shipped | The product is fully explorable offline and testable in CI | Demo output must be labelled everywhere (it is) |
| Two result sets for impact | A guess must never look like a fact | Redundant-looking UI, but honest |
| No shell in EchoShell | Removes an entire injection class | No pipes/redirects — by design |
| Redaction at write time | Traces can be exported and shared safely | Loses raw payloads even for debugging |
| Module gate server-side | A hidden route is not a security control | Every channel must name its module |
| Synthetic documentation media | Rebuildable without a browser, deterministic in CI | Not a literal screenshot of a live session — the stills mirror the real layout and label sample data |

---

See also: [README](../README.md) · [Tutorial](TUTORIAL.md) · [Contributing](../CONTRIBUTING.md) · [Security](../SECURITY.md) · [Changelog](../CHANGELOG.md)
