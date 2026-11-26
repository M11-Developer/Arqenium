# ARQENIUM — Tutorial

A complete, button-by-button walkthrough of ARQENIUM 1.0.0. Work through it in order the first time; afterwards use it as a reference. Every control described here is real — if you cannot see a control on your screen, it is because the module that owns it is disabled (see [Modules](#12-modules)).

**Contents**

1. [Install and launch](#1-install-and-launch)
2. [The shell](#2-the-shell)
3. [Overview](#3-overview)
4. [Projects & Project Intelligence](#4-projects--project-intelligence)
5. [Agents](#5-agents)
6. [Runs — creating a pipeline](#6-runs--creating-a-pipeline)
7. [Runs — watching, approving, cancelling](#7-runs--watching-approving-cancelling)
8. [Integrations (MCP)](#8-integrations-mcp)
9. [Evaluation lab](#9-evaluation-lab)
10. [Observability (TraceX)](#10-observability-tracex)
11. [EchoShell (Terminal)](#11-echoshell-terminal)
12. [Modules](#12-modules)
13. [Rebuild Studio](#13-rebuild-studio)
14. [Settings](#14-settings)
15. [A complete first project, start to finish](#15-a-complete-first-project-start-to-finish)

---

## 1. Install and launch

**Requirements:** Node ≥ 22.12, npm ≥ 10, and a normal desktop OS. A native module (`better-sqlite3`) compiles during install.

```bash
git clone https://github.com/M11-Developer/Arqenium.git
cd Arqenium
npm install
npm run dev
```

`npm run dev` starts two processes:

| Process | Address | What it is |
| --- | --- | --- |
| API | `http://127.0.0.1:4319` | The core: SQLite, indexing, orchestration, approvals, TraceX |
| UI | `http://localhost:5173` | Vite dev server, proxying `/api` to the API |

Open `http://localhost:5173`. To run the desktop shell instead, `npm start` (requires the Electron runtime binary). For a production-style single process:

```bash
npm run build
ARQ_API_PORT=4400 ARQ_STATIC_DIR=dist/renderer node dist/server/main.js
# UI + API both on http://127.0.0.1:4400
```

**What you should see first:** the Overview page, with a banner reading *“No AI provider configured — demo mode is active.”* That is expected and correct. Everything except live model calls works offline.

**Where your data lives:** `~/.arqenium` (or `$ARQ_DATA_DIR`) — a SQLite database in WAL mode plus artifacts. Delete that folder to reset to a factory state.

---

## 2. The shell

```
┌──────────────────────────────────────────────────────────────┐
│ sidebar            page head: title · subtitle · actions      │
│ ─────────          ────────────────────────────────────────  │
│ ARQENIUM           page body (panels, tables, tabs)           │
│ WORKSPACE                                                     │
│  Overview                                                     │
│  Projects                                                     │
│  Agents          ← badge appears on Runs when approvals wait  │
│  Runs                                                         │
│  Integrations                                                 │
│  Evaluation                                                   │
│  Observability                                                │
│  Terminal                                                     │
│  Rebuild Studio                                               │
│ SYSTEM                                                        │
│  Modules                                                      │
│  Settings                                                     │
├──────────────────────────────────────────────────────────────┤
│ footer: ● stream state · current project · records count      │
└──────────────────────────────────────────────────────────────┘
```

### Sidebar

Eleven destinations in two groups: **Workspace** and **System**. Only destinations whose module is enabled appear — disable TraceX and *Observability* disappears from the sidebar entirely.

- **Runs badge** — a count of pending approvals. It appears on *Runs* whenever something is waiting for you.
- **Connection state** — the bottom of the sidebar shows `Live stream`, `Reconnecting` or `Offline` next to a status dot.
- **Theme toggle** — the sun/moon button beside the connection state switches dark (default) and light.

### Top bar

- **Breadcrumb** — the current page title, then `/`, then the active project.
- **Project switcher** — the folder dropdown picks the active project. Indexing, symbol search, impact analysis, runs and EchoShell sessions are all scoped to it.
- **Index chips** — `Indexing` while a scan runs, `Index error` if it failed, `Starting` while the core boots.
- **Repository link** — the GitHub icon opens the project homepage.

### Page head

Every page has a title, a one-line subtitle explaining what the page is for, and page-level actions on the right (`Add project`, `New run`, `Run suite`, …). Actions are disabled rather than hidden when their prerequisites are missing, and the tooltip or banner tells you what is missing.

### Connection state

The dot beside `Live stream` is a real SSE indicator: green while events are arriving, `Reconnecting` when the stream drops, `Offline` when it cannot connect. If the stream drops the UI keeps working — approvals are polled every 8 s as a fallback — but live run progress pauses until it reconnects. Transient results, successes and failures appear as toasts in the bottom-right corner; each has a **Dismiss** button.

*(The documentation stills show this status on a caption strip below the window so it is readable at small sizes; in the running app it lives in the sidebar footer.)*

---

## 3. Overview

The landing page. It answers three questions: *is the system healthy*, *what needs me*, and *what should I do next*.

| Area | What it shows | What you can do |
| --- | --- | --- |
| Hero row | Version, uptime, a *Engineering control plane* tag | — |
| Hero actions | — | **New engineering run** (opens the run wizard), **Add project**, **Open Project Intelligence** |
| Banners | Missing provider, disabled Project Intelligence, pending approvals | **Configure provider**, **Review** (jumps to the approval) |
| Stats grid | Projects, symbols indexed, agents, runs, trace events, MCP servers | — |
| Recent runs | The six most recent runs with status and duration | Click a row to open it in *Runs* |
| Capability status | Which modules are on, and why | — |
| Workflow | The intended loop: add project → configure agent → run → review → evaluate | — |
| Privacy | Where data is stored, and that telemetry is off | — |

**Add project dialog** (from the hero or a banner):
- *Absolute folder path* — typed, or use **Browse** to open the native folder picker (desktop) / directory hint (web).
- **Cancel** closes without changes.
- **Add and index** registers the project and starts indexing immediately. Indexing runs in the background; the stats strip refreshes every 2.5 s while it runs.

> **Demo mode.** With no provider configured, the banner is permanent and every run is created with `mode=demo`. Demo output is deterministic sample text and is labelled as such in the run detail and in TraceX. It is not model output.

---

## 4. Projects & Project Intelligence

*Requires the **Project intelligence** module (core, always on).*

The page is a three-part workspace: reference tree on the left, content on the right, and a tab strip for the four views.

### Page actions

| Button | Effect |
| --- | --- |
| **Add project** | Opens the add dialog (path + **Browse** + **Add and index**) |
| **Re-index** | Re-scans the active project from disk. Use after pulling changes |
| **Remove** | Unregisters the project. Files on disk are never touched |

### Views

**Files & summaries** — the indexed tree with per-file status (`indexed`, `skipped`, `error`) and a one-line summary. Click a file to open it in the source pane. The pane shows the real bytes from disk, with a size cap and an explicit truncation notice. Binary files are refused with *“Binary file cannot be displayed”* — the check reads the first 4 KB for NUL bytes rather than trusting the extension.

**Symbols** — every parsed definition: name, kind (function, class, interface, method, …), container, file, line, and whether it is exported. Search box filters by name. Two honesty markers matter here:
- `parseQuality=parsed` — a real parser (TypeScript compiler API / Python scanner) produced this.
- `parseQuality=approximate` — structural fallback. Treat counts as indicative.

**Dependency graph** — import edges rendered as a graph. Rebuild graph re-reads the index. Click a node to focus that file.

**Impact analysis** — select a file, press **Analyse impact**, and you get the files that would be affected, each with:
- `depth` — hops from the changed file,
- `confidence` — **parsed** (a real import edge) or **heuristic** (a related test matched by name),
- `reason` / `via` — the import chain or the matching rule,
- a separate *Likely affected tests* list.

Parsed and heuristic results are never merged into one list. If a result is a guess, it says so.

### Indexing rules

`.gitignore` is honoured. `node_modules`, build output, lockfiles that are not source, and `.env`-style files are excluded by default so secrets and noise never enter the index or the prompt context.

---

## 5. Agents

*Requires the **Agent control** module.*

An agent is a configuration record, not a chat session. The library shows every agent with its role, its permission tags (`read`, `write`, `commands`, `auto: …`) and its model.

| Button | Effect |
| --- | --- |
| **New agent** | Opens the agent editor with a blank form pre-filled from the *Planner* template |
| Click a card | Opens the editor for that agent |
| **Configure** / **Delete** | Edit or remove the agent |
| **Create the first agent** | Empty-state shortcut with the same result as *New agent* |

### Agent editor fields

| Field | Meaning | Safe default |
| --- | --- | --- |
| **Role template** | Planner, Architect, Implementer, Reviewer, Tester. Fills the prompt and the tool grants | Planner |
| **Agent name** | Display name | required |
| **Model** | Provider/model reference; empty means the demo provider | empty |
| **Description** | What this agent is responsible for — shown to the orchestrator | — |
| **System instructions** | The system prompt. Templates give you a working starting point | template text |
| **Tool grants** | Multi-select of every tool the core exposes: `project_structure`, `search_symbols`, `search_files`, `read_file`, `write_file`, `dependency_graph`, `impact_analysis`, `project_summary`, `run_command` | role default |
| **Read project files** | `canReadFiles`. Sensitive paths remain blocked regardless | on |
| **Write project files** | `canWriteFiles`. Each write still needs approval unless auto-approved | **off** |
| **Run commands through EchoShell** | `canRunCommands`. Requires the EchoShell module | **off** |
| **Auto-approved tools** | Tools that skip the approval prompt for *this* agent. Leave empty for the safest behaviour | empty |
| **Max iterations** | Loop cap per stage | 8 |
| **Stage timeout (seconds)** | Wall-clock cap for one stage | 120 |
| **Retries** | Re-attempts on a failed stage | 1 |

**What approval means in practice:** a tool call that needs approval pauses the task, writes an `approval.requested` event, and waits. The agent receives `denied` if you say no and is instructed not to retry. Auto-approving a write tool removes the human gate for that agent — do it only for narrow, trusted workflows.

---

## 6. Runs — creating a pipeline

*Requires the **Agent control** module. Needs an indexed project and at least one agent; otherwise **New run** is disabled.*

The wizard builds one run.

### Run-level fields

| Field | Meaning | Default |
| --- | --- | --- |
| **Execution mode** | `Demo` uses the deterministic local adapter and is labelled throughout; `Live` calls a configured provider | Demo |
| **Tool-call budget** | Maximum tool calls for the whole run | 60 |
| **Time budget (minutes)** | Wall-clock limit; the run is cancelled when exceeded | 10 |
| **Providers available** | Read-only list so you know what `Live` would use | — |

Budgets are **hard limits with recorded reasons** — not warnings. Exceed one and the run fails with the budget named in TraceX.

### Task-level fields

Each task card in the wizard has:

| Field | Meaning |
| --- | --- |
| **Title** | Short imperative name |
| **Description / verification criteria** | Passed to the agent as part of the brief |
| **Agent pipeline (ordered)** | One or more agents; click to add in order. Each agent receives the previous agent's output, so `Planner → Implementer → Reviewer` is a valid chain |
| **Depends on** | Other tasks that must complete successfully first. The first task has none |
| **Priority** | Scheduling weight among ready tasks |
| **Max attempts** | Retries for this task |
| **Task input** | Optional extra material, treated as untrusted data — never as instructions |

| Button | Effect |
| --- | --- |
| **Add task** | Appends a task card (disabled until at least one agent exists) |
| **Remove** (trash) | Deletes that task card |
| **Cancel** | Closes the wizard, discarding edits |
| **Start run** | Creates and starts the run; validation errors appear inline |

Concurrency and approval timeouts are not per-run — they live in Settings and apply to the engine.

---

## 7. Runs — watching, approving, cancelling

The Runs page is a history table plus a detail pane for the selected run.

### Run history

Columns: status, source (`orchestration` / `evaluation` / `manual`), started, duration, and a click target for each row. Statuses are `pending`, `running`, `completed`, `failed`, `canceled`.

| Button | Effect |
| --- | --- |
| **New run** | Opens the wizard |
| **Refresh** | Reloads the list |
| **Cancel run** | Stops scheduling and marks in-flight tasks canceled. Only shown while running |
| **Reload** | Refreshes the open run detail, including approvals |

### Run detail tabs

| Tab | Contents |
| --- | --- |
| **Timeline** | Chronological events for this run: task transitions, tool calls, approvals, errors — the same records TraceX shows, scoped to one run |
| **Tasks** | One row per task: status, attempt count, duration, and the recorded output. In demo mode the output is prefixed as sample data |
| **Tool calls** | Every tool invocation with arguments, result status and duration |
| **Approvals** | Pending and decided approvals for this run |

### Approvals

A pending approval card shows the tool, the target path or command, the arguments (collapsible via the payload toggle), and the risk level.

| Button | Effect |
| --- | --- |
| **Approve** | Performs the operation, records the decision against your name, resumes the task |
| **Deny** | Returns `denied` to the agent, records the decision, resumes the task with the instruction not to retry |
| **Payload** | Expands the raw arguments JSON |

Approvals expire (the timeout is configurable in Settings) so a paused run never hangs forever.

---

## 8. Integrations (MCP)

*Requires the **OpenBridge** module.*

Two halves: **Servers** (register, connect, inspect) and **Directory** (what a connected server can do).

### Register server

| Field | Meaning |
| --- | --- |
| **Display name** | Label shown in the list |
| **Transport** | `stdio` (local process) or `http` (Streamable HTTP, stateful sessions) |
| **Command** | stdio only — executable, e.g. `npx` |
| **Arguments (one per line)** | stdio only — e.g. `-y` then the package name |
| **URL** | http only — e.g. `http://127.0.0.1:4321/mcp` |
| **Headers (JSON)** | http only — values are stored as credentials, not inline |
| **Allowed tools** | Patterns, e.g. `search, list_*` |
| **Denied tools** | Patterns, e.g. `write_*, delete_*` |
| **Auto-approved tools** | Patterns that skip the approval prompt |
| **Result cap** | Maximum result payload retained per call |
| **Connect immediately after registering** | Connects without a second click |

**Policy order is deny-first.** A tool must match an allow pattern to be reachable; denied patterns win over allowed ones; anything unmatched is refused with `not_permitted` (HTTP 403). Auto-approval only ever applies to tools that are already allowed.

### Server row actions

| Button | Effect |
| --- | --- |
| **Connect** / **Disconnect** | Opens or closes the transport; state is persisted |
| **Refresh** | Re-reads server state and capabilities |
| **Register server** | Opens the dialog above |
| **Open internal server** | Shows the ARQENIUM internal MCP server: transport, binding and its exposed tools |

**Internal server** — ARQENIUM exposes its own project-intelligence tools over MCP at `http://127.0.0.1:4321/mcp`, so an external MCP client can query the index and symbol search without touching the database.

### Directory

For a connected server: each discovered tool with kind, name, description, declared input schema and last error. **Call** opens an argument editor (JSON), runs the tool, and shows the result — giving you a round-trip test before an agent ever relies on it.

---

## 9. Evaluation lab

*Requires the **Evaluation** module.*

### Suites column

Three built-in suites ship with the app:

| Suite | Kind | Runs offline | What it verifies |
| --- | --- | --- | --- |
| Fixture project integrity | deterministic | yes | The bundled fixture really parses; no fixture secret leaked into TraceX |
| Project intelligence checks | deterministic | yes | The live index has files and symbols; symbol search returns results |
| Agent engineering tasks | ai | needs an agent | Judged criteria for engineering tasks |

Selecting a suite shows its cases with kind and criteria.

| Control | Effect |
| --- | --- |
| **Run suite** | Executes the suite. Deterministic cases run immediately |
| **Agent for AI cases** | `None (deterministic cases only)` runs just the objective checks; picking an agent runs the AI cases live |
| **Refresh** | Reloads suites and recent runs |
| **New suite** | Opens the suite builder |

### Suite builder

| Field | Meaning |
| --- | --- |
| **Suite name** | Display name |
| **Description** | What this suite verifies |
| **Suite kind** | `deterministic`, `ai` or `mixed` |
| **Cases (one per line)** | Case names, one per line — the case contract is name + criteria |
| **Create suite** | Persists the suite |

### Results

Recent runs list suite, mode (`live` / `demo`), passed, failed, errors, duration and timestamp. Case rows carry `pass`, `fail`, `error` or `skipped`.

| Button | Effect |
| --- | --- |
| **JSON** | Copies the full result document to the clipboard |
| **CSV** | Downloads the result table |
| **Re-run** | Repeats the same suite with the same configuration |

Objective checks and model judgment are reported in separate columns on purpose: a deterministic pass is a fact, an AI case is a judgment. The UI never claims a benchmark score.

---

## 10. Observability (TraceX)

*Requires the **TraceX** module.*

Everything the core does is recorded here first — this is the audit trail, not a debug console.

### Filters

| Control | Effect |
| --- | --- |
| Search | Free text across messages and event types |
| Severity | All / Debug / Info / Warning / Error |
| Event type | Every type with an occurrence count in the dropdown |

### Tabs

| Tab | Contents |
| --- | --- |
| **Events** | Type, severity, time, source, run, task, agent, correlation id, duration, message |
| **Tool calls** | Tool, status, duration, input — one row per invocation across all runs |

### Event detail

Selecting a row opens the detail panel: type, severity, time, source, run, task, agent, correlation id, duration, message, and the structured payload as JSON. Use the correlation id to follow one request across planner, tool and approval events.

| Button | Effect |
| --- | --- |
| **Export** | Downloads the filtered event set as JSON |
| **Refresh** | Re-reads the current filter |

Payloads are redacted on write. Secrets matching the fixture patterns (`sk-…`, `super-secret-value`) never reach the database — and the evaluation suite asserts exactly that.

---

## 11. EchoShell (Terminal)

*Optional module, **off by default**. Enable it in Modules, then grant `Run commands` to the agent that needs it.*

EchoShell is a supervised command runner, deliberately not a shell.

### Sessions

| Control | Effect |
| --- | --- |
| **New session** | Creates a session bound to a working directory inside the active project |
| **Reload history** | Re-reads past sessions |
| A session row | Shows project, working directory, and its history |
| **Command line** | The command to run — one command, no shell syntax |
| **Explain** | Static analysis: the parsed argv, what the binary does, and every risk reason |
| **Review** | Produces a preview: normalised argv, risk level, and whether it is blocked |

### Approve and run

`Review` shows a preview card. **Approve and run** executes it; **Deny** discards it. Both create an approval record with the approval id shown on the card, so the terminal is auditable like any other tool.

**Why no shell:** the command is split into an argument vector and spawned directly. Pipes, redirection, `&&`, `;`, backticks and `$()` are all rejected before execution — there is nothing to interpolate, so there is no injection surface.

**Risk assessment** is static and explainable:

- `low` — read-only binaries (`ls`, `cat`, `grep`, `git status`, …).
- `medium` — writes or package-manager mutations.
- `high` — destructive or administrative binaries (`rm`, `dd`, `chmod`, `sudo`, `systemctl`, …), destructive git, or any hard-blocked pattern.

**Hard blocks — no approval can unlock these:** recursive delete of `/` or `~`, fork bombs, `mkfs`, `dd … of=/dev/…`, `chmod -R 777 /`, and power-state changes. Environment variables are filtered before spawning, and output is redacted on the way into TraceX.

---

## 12. Modules

The capability gate. Nine modules, two groups:

| Module | Type | Default | What it enables |
| --- | --- | --- | --- |
| Project intelligence | core | on | Parsing, symbols, graph, impact |
| Agent control | core | on | Agents, tools, permissions, orchestration |
| OpenBridge | core | on | MCP client + internal MCP server |
| TraceX | core | on | Event log, tool calls, timeline |
| Evaluation | core | on | Suites, runs, exports |
| Providers | core | on | Provider adapters, credentials, health |
| Shared context | core | on | Conventions injected into prompts |
| EchoShell | optional | **off** | Preview → approve → execute commands |
| Rebuild Studio | optional | **off** | Screenshot → measured reconstruction |

Core modules cannot be disabled — the toggle is inert and says so. Optional modules are opt-in.

**The gate is enforced in the backend.** Turning a module off removes its sidebar destination *and* makes every channel it owns return `module_disabled` (HTTP 403). The UI cannot bypass it, and a disabled module never schedules background work. **Reload module state** re-reads the registry from the database.

---

## 13. Rebuild Studio

*Optional module, **off by default**.*

Turns a reference image into measured facts and a proposed implementation — while keeping fact and inference apart.

### References

| Control | Effect |
| --- | --- |
| **Add screenshot** | Dialog: *Reference image* (PNG/JPEG up to 12 MB, read locally, never uploaded), *Label*, *Dimensions*, then **Capture** |
| **Capture page** | Fetches markup from a *Page URL* and stores it as a reference |
| **Analyse** | Measures the selected reference |
| A reference row | Shows the stored copy, dimensions and capture time |

### Measured facts

Real measurements only: canvas size, extracted palette (with hex values), contrast ratio, measured horizontal bands, content width / gutter, spacing scale, typography estimate, estimated component count. Anything derived rather than measured is marked as an estimate.

### Inferred implementation

**Generate preview** proposes the files: `tokens.css` (design tokens), `index.html` (structure), `ANALYSIS.md` (what was measured versus inferred, plus warnings and a confidence label).

| Button | Effect |
| --- | --- |
| **Export to project** | Opens the export dialog: *Target directory* (relative to the project root) and the file list, then **Approve and run** |
| **Preview** | Shows the proposed file contents before anything is written |

Export writes through the same approval path as any other agent write, so a reconstruction cannot silently modify your repository.

---

## 14. Settings

Five sections in a left rail.

### AI providers

| Control | Effect |
| --- | --- |
| **Add provider** | *Provider type* (OpenAI, OpenAI-compatible, Anthropic, Gemini, Ollama, Demo), *Display name*, *Base URL*, *Default model*, *API key* |
| **Test** | Calls the adapter's health check and reports latency or the error |
| **Models** | Lists models the provider advertises |
| **Edit** | Updates the configuration; the key is replaced only if you enter a new one |
| **Delete** | Removes the provider and its stored credential |

Every key is stored encrypted, scoped to that provider, and never displayed again — only a masked hint.

### Project context

Long-lived conventions injected into prompts for the active project: *Key*, *Value*, *Scope*, *Description*, **Save context**, **Delete**. Use it for things a model must not have to rediscover — naming rules, layer boundaries, “we never touch `legacy/`”.

### Credentials

Every stored credential with scope, reference, masked hint and update time. **Delete** removes one. Only hints are ever rendered; full values are decrypted in the main process at call time.

### Runtime

Product version, runtime kind (`Electron desktop` or `Web preview (HTTP API)`), Node version, platform, data directory, telemetry (`disabled (not implemented)`), theme. **Interface theme** switch — dark/light, stored locally. **Advanced settings** lists every persisted key/value so nothing is hidden.

### Data & storage

Where the database lives, and **Export recent traces** to take your audit trail with you. Nothing is uploaded; there is no cloud account and no sync.

---

## 15. A complete first project, start to finish

1. **Add the project.** Overview → **Add project** → paste an absolute path → **Add and index**. Watch the file and symbol counts appear.
2. **Explore it.** Projects → *Files* to read a file, *Symbols* to search a definition, *Impact analysis* on a core module to see what depends on it.
3. **Create two agents.** Agents → **New agent** → *Implementer* template, keep `write` on, leave the tool list narrow. Repeat with the *Reviewer* template, `read` only.
4. **Compose a run.** Runs → **New run**. Task 1: *Plan the change*, pipeline `Planner`. Task 2: *Implement the change*, pipeline `Implementer → Reviewer`, **Depends on** Task 1. Leave budgets at their defaults.
5. **Start it.** **Start run**. Watch the timeline fill live.
6. **Approve the write.** When the approval badge appears, open the *Approvals* tab, read the payload, then **Approve**.
7. **Audit it.** Observability → filter by severity *Warning* to see every approval, then open one event and follow its correlation id back through the tool call.
8. **Evaluate it.** Evaluation → *Project intelligence checks* → **Run suite** → **JSON** to take the result.
9. **Lock it down.** Modules → turn EchoShell on, grant `Run commands` to one agent only, and use Terminal once to see the preview → approve → execute loop.
10. **Configure a provider.** Settings → **Add provider** → enter a key → **Test** → set *Execution mode* to `Live` on your next run.

That is the whole product: index locally, act through gates, record everything, evaluate honestly.
