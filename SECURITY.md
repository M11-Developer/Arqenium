# Security policy

ARQENIUM runs autonomous agents against a real repository, so its security properties are part of its function, not an afterthought. This document states what the app guarantees, what it deliberately does not, and how to report a problem.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

- Preferred: open a [private security advisory](https://github.com/M11-Developer/Arqenium/security/advisories/new) on GitHub.
- Alternative: email the maintainer listed in `package.json` with `SECURITY` in the subject.

Include the version (`Settings → Runtime`), your platform, a description, and a minimal reproduction. If you can, say whether the issue needs a malicious repository, a malicious MCP server, or only local access.

**What to expect:** acknowledgement within 5 working days, a triage decision within 10, and credit in the changelog once a fix ships — unless you ask to stay anonymous. Please give us a reasonable window to release a fix before publishing details.

## Threat model

**In scope.** A malicious repository (checked-in code, config, markdown, filenames), a malicious or compromised MCP server, a prompt-injection payload inside indexed content, a compromised renderer page, and a local attacker on the same machine who is *not* the user.

**Out of scope.** A user who deliberately grants `autoApprove` to write tools and enables EchoShell for everything, a compromised operating system or Node runtime, a provider that exfiltrates prompts you chose to send it, and physical access to an unlocked machine.

## Controls

### Process and IPC

- Electron runs with `contextIsolation` and a preload script exposing a fixed channel allow-list. The renderer never receives `require`, `process`, or raw `ipcRenderer`.
- Every renderer → core call goes through one dispatcher that parses a zod schema before any service code runs. Unknown channels fail with `unknown_channel`; invalid payloads fail with `invalid_input` and never reach a service.

### Local HTTP API

- Binds loopback by default.
- Browser origins are checked against an allow-list; same-host is permitted, anything else is refused with `origin_forbidden` (403) before routing. `OPTIONS` preflight is subject to the same check.
- Request bodies are capped at 4 MB. Oversized bodies are drained so the client receives `413 payload_too_large` rather than a connection reset.
- Static serving resolves paths against the build root and refuses anything outside it.

### Filesystem

- Every read, write and static lookup is confined to the project root (or renderer build directory) using `path.resolve` plus a prefix check — `../` traversal cannot escape.
- Size caps apply before content is read; binary files are detected by a NUL-byte probe of the first 4 KB, not by extension.
- `.gitignore` and built-in exclusions keep dependencies, build output and `.env`-style files out of the index, and therefore out of prompts and traces.

### Credentials and secrets

- Provider and MCP header credentials are encrypted with AES-256-GCM. The data key lives in `secret.key` with mode `0600` inside the data directory.
- After storing, only masked hints are ever returned — the full value is decrypted at call time in the core, never rendered.
- Process environments handed to child processes are filtered: variables matching `KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|PRIVATE` are removed.
- TraceX payloads are redacted **on write**, so exported traces are safe to share. The `no_secret_leak` evaluation case asserts that a known fixture secret never appears in the event log.

### Tool execution

- Agents reach the filesystem and shell only through the tool router: module gate → agent grant → permission flag → path confinement → MCP policy → approval → execution → audit record.
- Writes require an approval unless the specific tool is explicitly auto-approved for that agent. Commands require both the EchoShell module and `canRunCommands`.
- Denials are terminal for that call: the agent receives `denied` and an instruction not to retry.

### EchoShell

- Commands are tokenised to an argument vector and spawned with `shell: false`. Pipes, redirection, `&&`, `;`, backticks and `$()` are rejected before execution, which removes the injection surface entirely.
- Static risk assessment classifies the binary and flags destructive patterns. A hard blocklist cannot be overridden by any approval: recursive delete of `/` or `~`, fork bombs, `mkfs`, `dd of=/dev/…`, `chmod -R 777 /`, power-state changes.
- Working directories are confined to the project root; output is capped and redacted.

### Prompt injection

Project content, file contents, MCP tool results and task input are assembled as **delimited data**, never as instructions, and the system prompt states that data cannot issue commands. Approval prompts are the hard backstop: injected instructions can ask for a write, but a write still stops for a human. If you find a path where untrusted content changes agent *policy* (grants, permissions, module state) rather than merely suggesting a tool call, that is a vulnerability — please report it.

### Network

- No telemetry, no analytics, no update pings. `ARQ_TELEMETRY` is accepted for compatibility and is inert.
- Outbound HTTP happens only to endpoints you configure (a provider base URL, an MCP server, a page URL in Rebuild Studio) and only when you trigger the action.

## Hardening checklist

For a machine that will run untrusted code review:

1. Leave `autoApprove` empty on every agent.
2. Keep EchoShell **off** unless a task genuinely needs it, and grant `Run commands` to one narrow agent.
3. Keep Rebuild Studio **off** unless you are actively using it.
4. Add provider keys through Settings, not environment files that other tools can read.
5. Point MCP servers at allow-lists, not `*`, and deny destructive tool patterns explicitly.
6. Export traces for auditing and keep `$ARQ_DATA_DIR` on encrypted disk.
7. Review `Settings → Runtime → Advanced settings` — every persisted key is listed there.

## Disclosure history

No vulnerabilities have been reported or fixed to date. This section will list them with credit.
