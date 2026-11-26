import { useEffect, useState } from 'react';
import {
  IconActivity,
  IconBox,
  IconChartHistogram,
  IconFolders,
  IconPlugConnected,
  IconRobot,
  IconSettings,
  IconTerminal2,
  IconWindowMaximize,
  IconBrain,
  IconStack2,
} from '@tabler/icons-react';
import { useApp } from '../lib/store';
import { request } from '../lib/bridge';
import { Banner, Button, Switch, Tag, timeAgo } from '../components/ui';
import type { ModuleId } from '../lib/types';
import { CORE_MODULES } from '../../shared/types';

interface ModuleMeta {
  id: ModuleId;
  name: string;
  icon: React.ReactNode;
  summary: string;
  detail: string;
  requirements: string[];
  resource: string;
  defaultOn: boolean;
}

const MODULES: ModuleMeta[] = [
  {
    id: 'agent-control',
    name: 'Agent Control Plane',
    icon: <IconRobot size={16} />,
    summary: 'Multi-agent orchestration with task graphs, budgets and approvals.',
    detail:
      'Coordinates agents across dependency-aware task pipelines. Each stage has its own tool grants, permissions, iteration and time limits. Sensitive tools pause for human approval.',
    requirements: ['At least one agent', 'A provider for live execution (demo works without one)'],
    resource: 'Runs in the main process; no background work when idle.',
    defaultOn: true,
  },
  {
    id: 'project-intelligence',
    name: 'Project Intelligence',
    icon: <IconFolders size={16} />,
    summary: 'Local repository scanning, AST symbol extraction and dependency graphs.',
    detail:
      'Parses TypeScript/JavaScript with the TypeScript compiler API and Python via an embedded AST extractor. Builds import edges, reverse-dependency impact analysis and incremental re-indexing.',
    requirements: ['A local project folder', 'python3 for Python symbol extraction (optional)'],
    resource: 'Filesystem reads only; runs a chokidar watcher while a project is open.',
    defaultOn: true,
  },
  {
    id: 'openbridge',
    name: 'OpenBridge',
    icon: <IconPlugConnected size={16} />,
    summary: 'MCP client for external servers plus an internal MCP server.',
    detail:
      'Registers MCP servers over stdio or Streamable HTTP, discovers their tools/resources/prompts, and gates calls behind per-server permissions. Also exposes ARQENIUM intelligence to external MCP clients.',
    requirements: ['Server binaries or URLs you trust', 'Network access for remote servers'],
    resource: 'Child processes or outbound HTTP only for servers you explicitly connect.',
    defaultOn: true,
  },
  {
    id: 'tracex',
    name: 'TraceX',
    icon: <IconChartHistogram size={16} />,
    summary: 'Local execution log with run timelines and tool-call inspection.',
    detail:
      'Persists every orchestration, provider, MCP and approval event into SQLite with redaction applied before write. Powers run timelines and the observability console.',
    requirements: [],
    resource: 'SQLite writes per event; retention is configurable.',
    defaultOn: true,
  },
  {
    id: 'evaluation',
    name: 'Evaluation Lab',
    icon: <IconStack2 size={16} />,
    summary: 'Repeatable suites for deterministic and AI agent checks.',
    detail:
      'Deterministic cases verify fixture and index content offline. AI cases execute through the orchestrator against a chosen agent; objective status and heuristic judgment stay separate.',
    requirements: ['Built-in suites work with no provider', 'An agent and project for AI cases'],
    resource: 'No background work; runs on demand.',
    defaultOn: true,
  },
  {
    id: 'providers',
    name: 'Provider management',
    icon: <IconBrain size={16} />,
    summary: 'Adapter registry for OpenAI-compatible, Anthropic, Gemini and Ollama endpoints.',
    detail:
      'Stores provider configuration and encrypted credentials locally. Capabilities are reported per adapter and only claimed when the adapter implements them.',
    requirements: [],
    resource: 'Outbound HTTPS only when you send a request or run a health check.',
    defaultOn: true,
  },
  {
    id: 'shared-context',
    name: 'Shared project context',
    icon: <IconActivity size={16} />,
    summary: 'Project notes, decisions and conventions injected into agent prompts.',
    detail:
      'Stores user-authored context per project and exposes it to agents as authoritative notes, clearly separated from untrusted retrieved content.',
    requirements: [],
    resource: 'Local storage only.',
    defaultOn: true,
  },
  {
    id: 'echoshell',
    name: 'EchoShell',
    icon: <IconTerminal2 size={16} />,
    summary: 'Optional project-scoped terminal with mandatory approvals.',
    detail:
      'Every command is previewed with its working directory and static risk assessment, stored as an approval, and only executes once approved. No shell is used; output is capped and timeouts apply.',
    requirements: ['Explicit enablement', 'A selected project'],
    resource: 'Spawns short-lived child processes inside the project directory only.',
    defaultOn: false,
  },
  {
    id: 'rebuild-studio',
    name: 'Rebuild Studio',
    icon: <IconWindowMaximize size={16} />,
    summary: 'Optional visual reconstruction from authorised references.',
    detail:
      'Measures palette, bands, gutter and contrast from screenshots (or reads public page markup) and produces a labelled implementation estimate with an export you approve.',
    requirements: ['Explicit enablement', 'A reference you own or may reproduce'],
    resource: 'Local image decoding; one outbound fetch per page capture you request.',
    defaultOn: false,
  },
];

export function Modules() {
  const { modules, refreshModules, toast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshModules();
  }, [refreshModules]);

  async function toggle(id: ModuleId, enabled: boolean) {
    setBusy(id);
    setError(null);
    try {
      await request('modules.set', { id, enabled });
      await refreshModules();
      toast('ok', `${enabled ? 'Enabled' : 'Disabled'} ${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast('err', 'Could not change the module', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title">Modules</h1>
          <p className="page-sub">
            Capabilities are real switches, not labels. Disabling a module stops its operations and removes its
            navigation entry; core modules that the product depends on cannot be turned off.
          </p>
        </div>
        <Tag tone="neutral">
          <IconBox size={11} /> {modules.filter((m) => m.enabled).length} of {modules.length} enabled
        </Tag>
      </div>

      {error ? (
        <Banner tone="err" title="Module change failed">
          {error}
        </Banner>
      ) : null}

      <div className="grid-2">
        {MODULES.map((meta) => {
          const state = modules.find((m) => m.id === meta.id);
          const enabled = state?.enabled ?? meta.defaultOn;
          const isCore = CORE_MODULES.includes(meta.id);
          return (
            <div key={meta.id} className={`module-card ${enabled ? '' : 'is-off'}`}>
              <div className="module-head">
                <div className="module-icon" style={{ opacity: enabled ? 1 : 0.5 }}>
                  {meta.icon}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="module-name">
                    {meta.name}
                    {isCore ? <Tag tone="neutral">core</Tag> : <Tag tone="warn">optional</Tag>}
                  </div>
                  <div className="mono dim" style={{ fontSize: 10.5 }}>
                    {meta.id}
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  disabled={isCore || busy === meta.id}
                  onChange={(v) => void toggle(meta.id, v)}
                  label={isCore ? 'Core module, always enabled' : `${enabled ? 'Disable' : 'Enable'} ${meta.name}`}
                />
              </div>
              <p className="module-desc">{meta.detail}</p>
              <div className="module-meta">
                <span>
                  <strong style={{ color: 'var(--fg-3)' }}>Requires:</strong> {meta.requirements.length ? meta.requirements.join(' · ') : 'nothing'}
                </span>
              </div>
              <div className="module-meta">
                <span>
                  <strong style={{ color: 'var(--fg-3)' }}>Runtime:</strong> {meta.resource}
                </span>
              </div>
              <div className="row">
                <Tag tone={enabled ? 'ok' : 'neutral'}>{enabled ? 'enabled' : 'disabled'}</Tag>
                {state?.updatedAt ? <span className="mono dim" style={{ fontSize: 10.5 }}>changed {timeAgo(state.updatedAt)}</span> : null}
                {isCore ? (
                  <span className="spacer" />
                ) : (
                  <>
                    <span className="spacer" />
                    <Tag tone={meta.defaultOn ? 'neutral' : 'warn'}>{meta.defaultOn ? 'default on' : 'default off'}</Tag>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Banner tone="info" title="How enablement is enforced">
        Services call a capability check before every operation, so a disabled module throws a clear error instead of
        silently continuing. Optional modules that spawn processes or make network requests (EchoShell, Rebuild Studio,
        OpenBridge) are off or inactive unless you explicitly enable and connect them.
      </Banner>

      <div className="row">
        <Button variant="ghost" size="sm" onClick={() => void refreshModules()} icon={<IconSettings size={13} />}>
          Reload module state
        </Button>
      </div>
    </div>
  );
}
