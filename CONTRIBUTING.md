# Contributing to ARQENIUM

Thanks for taking the time to contribute. This project has a deliberately narrow set of rules, and following them makes review fast.

## Getting set up

```bash
git clone https://github.com/M11-Developer/Arqenium.git
cd Arqenium
npm install          # compiles better-sqlite3
npm run dev          # UI :5173 · API :4319
```

Requires Node ≥ 22.12. If your Node build is non-standard and the native module will not compile, install with `npm_config_nodedir=/usr/local npm install`.

Useful scripts:

| Command | Purpose |
| --- | --- |
| `npm test` | 100 tests, no browser needed |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over the whole repo |
| `npm run build` | esbuild + Vite → `dist/` |
| `python3 docs/tools/stills.py` | Regenerate documentation stills |
| `python3 docs/tools/videos.py` | Regenerate walkthrough videos (needs `pillow`, `imageio-ffmpeg`) |

## Before you open a pull request

Run all four and make sure they are clean:

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

A PR that changes behaviour without a test will be asked for one. A PR that changes a channel count, an error code or a status mapping will be asked to update `tests/08-api-and-validation.test.ts` and `docs/ARCHITECTURE.md`.

## Architectural rules

These are not style preferences — they are the properties the project is built on.

1. **All renderer → core traffic goes through the dispatcher.** A new capability means a schema in `src/shared/channels.ts`, a case in `Dispatcher.route()`, and a call through `lib/bridge.ts`. Never call a service from a page, and never add a second IPC or HTTP path.
2. **Requests are parsed, responses are trusted.** Requests are untrusted input and must be zod-validated. Build responses from typed structures.
3. **Name the owning module for every channel.** If a channel belongs to `echoshell` or `rebuild-studio`, a disabled module must answer `module_disabled` before any work happens. A hidden route is not a security control.
4. **No silent privilege.** Anything that writes, executes, or reaches the network on the user's behalf goes through the tool router and the approval service. Never `autoApprove` something by default.
5. **Report honestly in the UI.** Label demo output, label parse quality, keep parsed facts and heuristic guesses in separate lists, and do not claim a capability the adapter does not have.
6. **Persist secrets only encrypted.** Use `CredentialStore`; never write a key to `settings`, an event payload or a log. Run it through `redact` if it might appear in a trace.
7. **Confine paths.** Any path that came from outside the core goes through `path.resolve` + prefix check against the project root (or renderer build root).
8. **Emit an event for anything the user could care about.** If it is not in TraceX, it did not happen as far as auditing is concerned.

## Code style

- TypeScript strict; no `any` in new code unless the surrounding API is genuinely untyped (`unknown` + narrowing is preferred).
- ESM throughout (`"type": "module"`); Node-side entrypoints are bundled with a CJS-safe banner.
- React: function components, hooks, no class components, no new global stores — use the existing zustand store.
- Styling: use the CSS custom properties in `src/renderer/styles/theme.css`. Do not hard-code colours; the light theme depends on the tokens.
- Comments explain *why*, not *what*. If a decision is subtle or defensive, say so — several lines in this codebase exist because of a specific bug.
- Keep files focused. A 900-line service is a code smell; split by concern as the existing `core/` layout does.

## Adding things

### A provider
Implement `ProviderAdapter` in `src/core/providers/adapters/`, register it in `ProviderRegistry`, add the kind to `ProviderKind` and `ENV_KEYS`, surface it in Settings. Declare capabilities truthfully.

### A language
Implement a `LanguageAdapter` in `src/core/projects/lang/`, register it in the registry, and add a fixture plus a case to `01-project-indexing`. Report `approximate` unless you parse a real syntax tree.

### A channel
Schema in `shared/channels.ts` (with its module), response type in `shared/types.ts`, case in `Dispatcher.route()`, test in the matching suite.

### A tool
Add it to the catalog in `shared/catalog.ts`, wire it in `orchestration/tools.ts` (grant check, permission flags, path confinement, approval path), and document it in the tutorial's Agents section.

## Testing expectations

- Tests drive the same `Core` and `Dispatcher` the application uses — there is no mock core, and there should not be.
- Prefer asserting on observable behaviour (records, events, error codes) over private internals.
- Cover the failure path: denials, disabled modules, path escapes, oversized bodies. Most of the interesting behaviour here is in the refusal.
- Use `:memory:` databases and `tests/fixtures/fixture-app` for anything filesystem-related.

## Documentation

- User-facing behaviour changes → update [`docs/TUTORIAL.md`](docs/TUTORIAL.md).
- Internal design changes → update [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Anything user-visible → a line under **Unreleased** in [`CHANGELOG.md`](CHANGELOG.md).
- If you change the layout of a screen, regenerate the media: `python3 docs/tools/stills.py` and, for narration, `python3 docs/tools/videos.py`. Both are deterministic and take well under two minutes.
- The documentation imagery is generated from the design tokens in `src/renderer/styles/theme.css`. If you change a token, regenerate so the docs do not drift from the product.

## Commit messages

Conventional Commits, imperative mood, scope where useful:

```
feat(projects): report parse quality per file
fix(api): answer 413 instead of resetting on oversized bodies
docs(tutorial): document approval expiry
```

Explain *why* in the body when the change is defensive or fixes a subtle bug. Reference issues with `Fixes #123`.

## Review process

- One maintainer approval is required; CI must be green (tests, typecheck, lint, build).
- Expect questions about failure modes: what happens on a denial, on a disabled module, on an escaped path, on a cancelled run.
- Security-adjacent changes (tool router, approval service, credential store, terminal, static serving) get an extra pass and must state their threat-model impact in the PR description.

## Reporting bugs

Open an issue with: version (`Settings → Runtime`), runtime (Electron or web), platform, exact steps, expected versus actual, and any relevant TraceX event type or correlation id. Security issues go through [SECURITY.md](SECURITY.md), not the public tracker.

## License

Contributions are accepted under Apache-2.0. By opening a pull request you confirm you have the right to submit the code.
