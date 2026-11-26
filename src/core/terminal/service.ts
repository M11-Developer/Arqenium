import { spawn } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { ApprovalService } from '../approvals';
import type { ModuleService } from '../modules';
import type { ProjectService } from '../projects/service';
import type { TerminalCommandResult, TerminalSession } from '../../shared/types';
import type { ToolContext } from '../orchestration/tools';
import { newId, nowIso } from '../../shared/ids';
import { filterEnv } from '../redact';
import { isInside } from '../paths';

export interface CommandAssessment {
  risk: 'low' | 'medium' | 'high';
  reasons: string[];
  blocked: boolean;
}

/** Binaries that may modify the filesystem or system state. */
const WRITE_BINARIES = new Set([
  'rm',
  'rmdir',
  'mv',
  'cp',
  'mkdir',
  'touch',
  'chmod',
  'chown',
  'dd',
  'ln',
  'truncate',
  'tee',
  'sed',
  'patch',
  'git-clean',
]);

/** Binaries considered destructive or administrative. */
const HIGH_RISK_BINARIES = new Set([
  'rm',
  'rmdir',
  'dd',
  'mkfs',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'chown',
  'chmod',
  'useradd',
  'userdel',
  'passwd',
  'sudo',
  'su',
  'systemctl',
  'service',
  'kill',
  'pkill',
  'killall',
  'iptables',
  'mount',
  'umount',
  'curl',
  'wget',
  'nc',
  'ncat',
  'ssh',
  'scp',
  'rsync',
]);

/** Always refused: no approval can unlock these. */
const BLOCKED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+(-[a-zA-Z]*\s+)*(\/|\/\*|~|\$HOME)(\s|$)/, reason: 'recursive delete of a root or home directory' },
  { re: /:\s*\(\s*\)\s*\{.*\}\s*;\s*:/, reason: 'fork bomb pattern' },
  { re: /\bmkfs(\.\w+)?\b/, reason: 'filesystem format command' },
  { re: /\bdd\b.*\bof=\/dev\//, reason: 'raw device write' },
  { re: />\s*\/dev\/(sd|nvme|disk)/, reason: 'raw device write' },
  { re: /\bchmod\s+-R\s+777\s+\/(\s|$)/, reason: 'world-writable root' },
  { re: /\bshutdown\b|\breboot\b|\bpoweroff\b/, reason: 'machine power state change' },
];

const GIT_DESTRUCTIVE = [
  { re: /\bgit\s+push\b/, reason: 'git push changes a remote repository' },
  { re: /\bgit\s+reset\s+--hard\b/, reason: 'git reset --hard discards local work' },
  { re: /\bgit\s+clean\s+-[a-zA-Z]*f/, reason: 'git clean deletes untracked files' },
  { re: /\bgit\s+checkout\s+--\s/, reason: 'git checkout -- discards file changes' },
  { re: /\bgit\s+(rebase|filter-branch)\b/, reason: 'history rewriting command' },
];

const PKG_MUTATIONS = [
  { re: /\b(npm|pnpm|yarn)\s+(install|i|add|remove|uninstall|publish)\b/, reason: 'package manager mutation' },
  { re: /\bpip3?\s+install\b/, reason: 'package manager mutation' },
  { re: /\bcargo\s+(install|publish)\b/, reason: 'package manager mutation' },
];

/**
 * Static risk assessment of a command. Runs on the argv array joined with
 * spaces purely for pattern matching - the actual execution never uses a shell.
 */
export function assessCommand(argv: string[], cwdRel: string): CommandAssessment {
  const reasons: string[] = [];
  let risk: 'low' | 'medium' | 'high' = 'low';
  if (!argv.length) {
    return { risk: 'high', reasons: ['empty command'], blocked: true };
  }
  const bin = path.basename(argv[0]);
  const joined = argv.join(' ');

  for (const p of BLOCKED_PATTERNS) {
    if (p.re.test(joined)) {
      return { risk: 'high', reasons: [`blocked: ${p.reason}`], blocked: true };
    }
  }
  for (const p of GIT_DESTRUCTIVE) {
    if (p.re.test(joined)) {
      risk = 'high';
      reasons.push(p.reason);
    }
  }
  for (const p of PKG_MUTATIONS) {
    if (p.re.test(joined)) {
      risk = 'high';
      reasons.push(p.reason);
    }
  }
  if (HIGH_RISK_BINARIES.has(bin)) {
    risk = 'high';
    reasons.push(`"${bin}" is a destructive or administrative command`);
  } else if (WRITE_BINARIES.has(bin)) {
    if (risk === 'low') risk = 'medium';
    reasons.push(`"${bin}" modifies the filesystem`);
  }
  if (argv.some((a) => a.startsWith('/') && a !== argv[0])) {
    if (risk === 'low') risk = 'medium';
    reasons.push('command references absolute paths');
  }
  if (cwdRel.includes('..')) {
    risk = 'high';
    reasons.push('working directory escapes the project root');
  }
  const traversalArg = argv.slice(1).find((a) => /(^|[/\\])\.\.([/\\]|$)/.test(a));
  if (traversalArg) {
    risk = 'high';
    reasons.push(`argument "${traversalArg.slice(0, 120)}" references a parent directory and may read outside the project`);
  }
  if (argv[0] === 'npx' || argv[0] === 'pnpx') {
    if (risk === 'low') risk = 'medium';
    reasons.push('npx may download and execute a package');
  }
  if (bin === 'sh' || bin === 'bash' || bin === 'zsh') {
    risk = 'high';
    reasons.push('shell invocation');
  }
  return { risk, reasons, blocked: false };
}

function resolveSessionCwd(projectRoot: string, cwdRel: string): string {
  const root = realpathSync(projectRoot);
  const target = realpathSync(path.resolve(root, cwdRel || '.'));
  if (!isInside(root, target)) {
    throw new Error('Working directory escapes the project root');
  }
  if (!statSync(target).isDirectory()) throw new Error('Working directory is not a directory');
  return target;
}

export interface RunOptions {
  timeoutMs: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
}

/** Execute without a shell; stdout/stderr are captured and capped. */
/**
 * Resolve a bare binary name to something Windows can actually launch.
 *
 * `spawn('npm', …, { shell: false })` works on POSIX but fails on Windows with
 * ENOENT: npm/npx/pnpm are `.cmd` wrappers there and `CreateProcess` does not
 * consult PATHEXT. We walk PATH ourselves (the same lookup `cmd` would do),
 * preferring `.exe`, then `.cmd`, then `.bat`. This keeps `shell: false` — no
 * shell means no injection surface — while still finding the tools.
 */
export function resolveExecutable(bin: string): string {
  if (process.platform !== 'win32') return bin;
  if (bin.includes('/') || bin.includes('\\')) return bin;
  const exts = path.extname(bin) ? [''] : ['.exe', '.cmd', '.bat', '.com'];
  const dirs = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter).filter(Boolean);
  for (const ext of exts) {
    for (const dir of dirs) {
      const candidate = path.join(dir, bin + ext);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        /* keep looking */
      }
    }
  }
  // Let Node try PATHEXT itself; failing that, the error is reported to the user.
  return bin;
}

export function execArgv(
  argv: string[],
  cwd: string,
  opts: RunOptions,
): Promise<{ status: TerminalCommandResult['status']; exitCode: number | null; signal: string | null; stdout: string; stderr: string; durationMs: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let truncatedOut = false;
    let truncatedErr = false;
    let settled = false;

    const child = spawn(resolveExecutable(argv[0]), argv.slice(1), {
      cwd,
      shell: false,
      env: { ...filterEnv(process.env), CI: '1', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const finish = (status: TerminalCommandResult['status'], exitCode: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      resolve({
        status,
        exitCode,
        signal,
        stdout: truncatedOut ? `${stdout}\n... [stdout truncated]` : stdout,
        stderr: truncatedErr ? `${stderr}\n... [stderr truncated]` : stderr,
        durationMs: Date.now() - started,
      });
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish('timeout', null, 'SIGKILL');
    }, opts.timeoutMs);

    const onAbort = () => {
      child.kill('SIGKILL');
      finish('canceled', null, 'SIGKILL');
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stdout) < opts.maxOutputBytes) stdout += chunk.toString('utf8');
      else truncatedOut = true;
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stderr) < opts.maxOutputBytes) stderr += chunk.toString('utf8');
      else truncatedErr = true;
    });
    child.on('error', (err) => {
      finish('error', null, null);
      stderr += `\n${err.message}`;
    });
    child.on('close', (code, sig) => {
      finish(code === 0 ? 'ok' : 'error', code, sig ?? null);
    });
  });
}

export interface TerminalPreview {
  approvalId: string;
  argv: string[];
  cwd: string;
  risk: 'low' | 'medium' | 'high';
  riskReasons: string[];
  blocked: boolean;
  explanation: string;
}

/**
 * EchoShell: approval-gated, project-scoped command execution. Nothing runs
 * automatically - every command is previewed, recorded as an approval, and
 * only executes once that approval is granted.
 */
export class TerminalService {
  constructor(
    private db: Db,
    private events: EventBus,
    private approvals: ApprovalService,
    private modules: ModuleService,
    private projects: ProjectService,
  ) {}

  listSessions(projectId: string): TerminalSession[] {
    this.modules.requireEnabled('echoshell');
    const rows = this.db
      .prepare('SELECT * FROM terminal_sessions WHERE project_id = ? ORDER BY created_at')
      .all(projectId) as any[];
    return rows.map(rowToSession);
  }

  createSession(input: { projectId: string; name?: string; cwd?: string }): TerminalSession {
    this.modules.requireEnabled('echoshell');
    const project = this.projects.get(input.projectId);
    const cwdRel = input.cwd ?? '';
    resolveSessionCwd(project.rootPath, cwdRel);
    const id = newId('term');
    const now = nowIso();
    this.db
      .prepare('INSERT INTO terminal_sessions (id, project_id, name, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.projectId, input.name ?? 'session', cwdRel, now, now);
    this.events.emit({
      type: 'terminal.session.created',
      projectId: input.projectId,
      message: `Terminal session created (cwd: ${cwdRel || '.'})`,
      data: { sessionId: id },
      source: 'terminal',
    });
    return this.getSession(id);
  }

  getSession(id: string): TerminalSession {
    const row = this.db.prepare('SELECT * FROM terminal_sessions WHERE id = ?').get(id);
    if (!row) throw new Error(`Terminal session ${id} not found`);
    return rowToSession(row);
  }

  deleteSession(id: string): void {
    this.modules.requireEnabled('echoshell');
    this.db.prepare('DELETE FROM terminal_sessions WHERE id = ?').run(id);
  }

  /** Parse a user-typed command line into argv without invoking a shell. */
  static parseCommandLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quote: '"' | "'" | null = null;
    let has = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
        else if (ch === '\\' && quote === '"' && i + 1 < line.length) cur += line[++i];
        else cur += ch;
        has = true;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        has = true;
        continue;
      }
      if (ch === '\\' && i + 1 < line.length) {
        cur += line[++i];
        has = true;
        continue;
      }
      if (/\s/.test(ch)) {
        if (has) {
          out.push(cur);
          cur = '';
          has = false;
        }
        continue;
      }
      cur += ch;
      has = true;
    }
    if (quote) throw new Error('Unterminated quote in command');
    if (has) out.push(cur);
    if (out.some((a) => /^[|;&<>`$]/.test(a) || a === '|')) {
      throw new Error('Shell operators are not supported. Provide a single command and its arguments.');
    }
    return out;
  }

  preview(input: { projectId: string; sessionId?: string; command: string }): TerminalPreview {
    this.modules.requireEnabled('echoshell');
    const project = this.projects.get(input.projectId);
    const session = input.sessionId ? this.getSession(input.sessionId) : null;
    const cwdRel = session?.cwd ?? '';
    const argv = TerminalService.parseCommandLine(input.command);
    if (!argv.length) throw new Error('Command is empty');
    const assessment = assessCommand(argv, cwdRel);
    const resolvedCwd = resolveSessionCwd(project.rootPath, cwdRel);
    const explanation = explainCommand(argv, assessment);

    const approval = this.approvals.create({
      projectId: input.projectId,
      kind: 'command-exec',
      title: `Run command: ${argv[0]} ${argv.slice(1).join(' ')}`.slice(0, 200),
      detail: [
        `Command: ${argv.join(' ')}`,
        `Working directory: ${resolvedCwd}`,
        `Project: ${project.name}`,
        `Risk: ${assessment.risk}`,
        assessment.reasons.length ? `Reasons: ${assessment.reasons.join('; ')}` : 'No elevated risk signals detected.',
        `Session: ${session?.id ?? 'default'}`,
      ].join('\n'),
      payload: { argv, cwdRel, sessionId: session?.id ?? null, risk: assessment.risk, reasons: assessment.reasons },
      risk: assessment.risk,
      source: 'terminal',
    });
    return {
      approvalId: approval.id,
      argv,
      cwd: resolvedCwd,
      risk: assessment.risk,
      riskReasons: assessment.reasons,
      blocked: assessment.blocked,
      explanation,
    };
  }

  async execute(approvalId: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<TerminalCommandResult> {
    this.modules.requireEnabled('echoshell');
    const approval = this.approvals.get(approvalId);
    if (approval.kind !== 'command-exec') throw new Error('Approval is not a command approval');
    if (approval.status !== 'approved') throw new Error(`Approval is ${approval.status}; command not executed`);
    const payload = approval.payload as { argv?: string[]; cwdRel?: string; sessionId?: string };
    const argv = payload.argv ?? [];
    if (!argv.length) throw new Error('Approval payload has no command');
    if (!approval.projectId) throw new Error('Approval is not bound to a project');
    const assessment = assessCommand(argv, payload.cwdRel ?? '');
    if (assessment.blocked) throw new Error(`Command blocked by safety policy: ${assessment.reasons.join('; ')}`);
    const project = this.projects.get(approval.projectId);
    const cwd = resolveSessionCwd(project.rootPath, payload.cwdRel ?? '');

    const result = await execArgv(argv, cwd, {
      timeoutMs: opts.timeoutMs ?? 120_000,
      maxOutputBytes: 512 * 1024,
      signal: opts.signal,
    });

    const id = newId('tcmd');
    this.db
      .prepare(
        `INSERT INTO terminal_commands (id, session_id, project_id, argv, cwd, status, exit_code, signal, duration_ms, stdout, stderr, approval_id, risk, risk_reasons, agent_initiated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        payload.sessionId ?? '',
        approval.projectId,
        JSON.stringify(argv),
        cwd,
        result.status,
        result.exitCode,
        result.signal,
        result.durationMs,
        result.stdout,
        result.stderr,
        approvalId,
        assessment.risk,
        JSON.stringify(assessment.reasons),
        0,
        nowIso(),
      );

    this.events.emit({
      type: 'terminal.command.executed',
      projectId: approval.projectId,
      severity: result.status === 'ok' ? 'info' : 'warn',
      message: `Command ${result.status}: ${argv[0]} (exit ${result.exitCode ?? 'n/a'})`,
      data: { commandId: id, argv, status: result.status, exitCode: result.exitCode, durationMs: result.durationMs, risk: assessment.risk },
      source: 'terminal',
    });

    return {
      id,
      sessionId: payload.sessionId ?? '',
      argv,
      cwd,
      status: result.status,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
      approvalId,
      risk: assessment.risk,
      riskReasons: assessment.reasons,
    };
  }

  history(projectId: string, limit = 100): TerminalCommandResult[] {
    const rows = this.db
      .prepare('SELECT * FROM terminal_commands WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(projectId, limit) as any[];
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      argv: safeParse(r.argv, []),
      cwd: r.cwd,
      status: r.status,
      exitCode: r.exit_code,
      signal: r.signal,
      durationMs: r.duration_ms,
      stdout: r.stdout,
      stderr: r.stderr,
      approvalId: r.approval_id,
      risk: r.risk,
      riskReasons: safeParse(r.risk_reasons, []),
    }));
  }

  /** Deterministic, local explanation of what a command does (no AI needed). */
  explain(command: string): { command: string; argv: string[]; explanation: string; risk: 'low' | 'medium' | 'high'; riskReasons: string[]; blocked: boolean } {
    const argv = TerminalService.parseCommandLine(command);
    const assessment = assessCommand(argv, '');
    return {
      command,
      argv,
      explanation: explainCommand(argv, assessment),
      risk: assessment.risk,
      riskReasons: assessment.reasons,
      blocked: assessment.blocked,
    };
  }
}

const KNOWN = new Map<string, string>([
  ['npm', 'Node.js package manager'],
  ['npx', 'runs a package binary, downloading it if needed'],
  ['node', 'Node.js runtime'],
  ['pnpm', 'fast Node.js package manager'],
  ['yarn', 'Node.js package manager'],
  ['git', 'version control system'],
  ['python', 'Python interpreter'],
  ['python3', 'Python interpreter'],
  ['pytest', 'Python test runner'],
  ['tsc', 'TypeScript compiler'],
  ['vitest', 'Vite test runner'],
  ['jest', 'JavaScript test runner'],
  ['eslint', 'JavaScript/TypeScript linter'],
  ['tsx', 'TypeScript execution runtime'],
  ['ls', 'lists directory contents'],
  ['cat', 'prints file contents'],
  ['grep', 'searches text'],
  ['rg', 'ripgrep text search'],
  ['find', 'searches the filesystem'],
  ['wc', 'counts lines/words/bytes'],
  ['head', 'prints the first lines of a file'],
  ['tail', 'prints the last lines of a file'],
  ['docker', 'container runtime'],
  ['make', 'build automation tool'],
]);

function explainCommand(argv: string[], assessment: CommandAssessment): string {
  if (!argv.length) return 'Empty command.';
  const bin = path.basename(argv[0]);
  const base = KNOWN.get(bin) ?? `executable "${bin}" (not in the local knowledge base)`;
  const parts: string[] = [`Runs ${base}.`];
  if (bin === 'npm' || bin === 'pnpm' || bin === 'yarn') {
    const sub = argv[1];
    const map: Record<string, string> = {
      install: 'installs declared dependencies and writes to node_modules',
      i: 'installs declared dependencies',
      ci: 'installs dependencies from the lockfile',
      test: 'runs the project test script',
      run: 'runs a script defined in package.json',
      build: 'runs the build script',
      lint: 'runs the lint script',
      typecheck: 'runs the typecheck script',
    };
    if (sub && map[sub]) parts.push(`Subcommand "${sub}": ${map[sub]}.`);
  }
  if (bin === 'git') {
    const sub = argv[1];
    const map: Record<string, string> = {
      status: 'shows working tree status (read-only)',
      diff: 'shows unstaged changes (read-only)',
      log: 'shows commit history (read-only)',
      add: 'stages changes in the index',
      commit: 'creates a new commit',
      push: 'uploads commits to a remote repository',
      pull: 'fetches and merges remote changes',
      checkout: 'switches branches or restores files',
      reset: 'moves the branch pointer and may discard work',
    };
    if (sub && map[sub]) parts.push(`Subcommand "${sub}": ${map[sub]}.`);
  }
  if (assessment.reasons.length) parts.push(`Risk signals: ${assessment.reasons.join('; ')}.`);
  else parts.push('No elevated risk signals were detected by the static policy.');
  parts.push(`Overall risk: ${assessment.risk}. A human approval is required before this command runs.`);
  return parts.join(' ');
}

/**
 * Shared execution path for agent-initiated commands: creates an approval,
 * waits for the human decision, and only then executes.
 */
export async function runApprovedCommand(
  ctx: ToolContext,
  argv: string[],
  cwdRel: string,
  assessment: CommandAssessment,
): Promise<TerminalCommandResult> {
  const project = ctx.projects.get(ctx.projectId);
  const resolvedCwd = resolveSessionCwd(project.rootPath, cwdRel);
  const approval = await ctx.approvals.request(
    {
      runId: ctx.runId,
      taskId: ctx.taskId,
      projectId: ctx.projectId,
      kind: 'command-exec',
      title: `Agent ${ctx.agent.name} requests command: ${argv[0]}`.slice(0, 200),
      detail: [
        `Command: ${argv.join(' ')}`,
        `Working directory: ${resolvedCwd}`,
        `Risk: ${assessment.risk}`,
        assessment.reasons.length ? `Reasons: ${assessment.reasons.join('; ')}` : 'No elevated risk signals detected.',
      ].join('\n'),
      payload: { argv, cwdRel, sessionId: null, risk: assessment.risk, reasons: assessment.reasons },
      risk: assessment.risk,
      source: 'agent',
    },
    ctx.approvalTimeoutMs,
  );
  if (approval.status !== 'approved') {
    return {
      id: '',
      sessionId: '',
      argv,
      cwd: resolvedCwd,
      status: 'blocked',
      exitCode: null,
      signal: null,
      durationMs: 0,
      stdout: '',
      stderr: `Approval ${approval.status}`,
      approvalId: approval.id,
      risk: assessment.risk,
      riskReasons: assessment.reasons,
    };
  }

  const result = await execArgv(argv, resolvedCwd, { timeoutMs: 120_000, maxOutputBytes: 256 * 1024 });
  ctx.events?.emit({
    type: 'terminal.command.executed',
    projectId: ctx.projectId,
    runId: ctx.runId,
    taskId: ctx.taskId,
    severity: result.status === 'ok' ? 'info' : 'warn',
    message: `Agent command ${result.status}: ${argv[0]}`,
    data: { argv, status: result.status, exitCode: result.exitCode, risk: assessment.risk, agentInitiated: true },
    source: 'terminal',
  });
  return {
    id: '',
    sessionId: '',
    argv,
    cwd: resolvedCwd,
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    approvalId: approval.id,
    risk: assessment.risk,
    riskReasons: assessment.reasons,
  };
}

function rowToSession(r: any): TerminalSession {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    cwd: r.cwd,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function safeParse<T>(v: string | null, fb: T): T {
  if (!v) return fb;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fb;
  }
}

export { resolveSessionCwd };
export function directoryExists(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}
