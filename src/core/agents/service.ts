import type { Db } from '../db/database';
import type { EventBus } from '../events/bus';
import type { Agent, AgentRole } from '../../shared/types';
import { ROLE_TEMPLATES } from '../../shared/catalog';
import { newId, nowIso } from '../../shared/ids';

export interface CreateAgentInput {
  projectId: string | null;
  name: string;
  role: AgentRole;
  description?: string;
  systemPrompt?: string;
  modelRef?: string | null;
  tools?: string[];
  permissions?: Partial<Agent['permissions']>;
  maxIterations?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_PERMISSIONS: Agent['permissions'] = {
  canReadFiles: true,
  canWriteFiles: false,
  canRunCommands: false,
  autoApprove: [],
};

/**
 * Agent registry. Agents are explicit configurations - role, prompt, tools,
 * permissions and limits - not just labels on a shared chatbot prompt.
 */
export class AgentService {
  /**
   * @param projectExists optional guard so agents cannot reference a project id
   *   that was never registered (the DB has no cross-project FK by design).
   */
  constructor(
    private db: Db,
    private events: EventBus,
    private projectExists: (id: string) => boolean = () => true,
  ) {}

  private assertProject(projectId: string | null): void {
    if (projectId && this.projectExists && !this.projectExists(projectId)) {
      throw new Error(`Project ${projectId} not found`);
    }
  }

  list(projectId?: string): Agent[] {
    const rows = (
      projectId
        ? this.db.prepare('SELECT * FROM agents WHERE project_id = ? OR project_id IS NULL ORDER BY created_at').all(projectId)
        : this.db.prepare('SELECT * FROM agents ORDER BY created_at').all()
    ) as any[];
    return rows.map(rowToAgent);
  }

  get(id: string): Agent {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    if (!row) throw new Error(`Agent ${id} not found`);
    return rowToAgent(row);
  }

  find(id: string | null | undefined): Agent | null {
    if (!id) return null;
    try {
      return this.get(id);
    } catch {
      return null;
    }
  }

  create(input: CreateAgentInput): Agent {
    this.assertProject(input.projectId);
    const id = newId('agent');
    const now = nowIso();
    const template = ROLE_TEMPLATES.find((t) => t.role === input.role);
    const permissions: Agent['permissions'] = { ...DEFAULT_PERMISSIONS, ...input.permissions };
    // Implementers are the only role that may write by default; an explicit
    // `permissions.canWriteFiles` from the caller always wins.
    if (input.role === 'implementer' && input.permissions?.canWriteFiles === undefined) {
      permissions.canWriteFiles = true;
    }
    const tools = input.tools?.length ? input.tools : (template?.tools ?? ['project_structure', 'search_symbols', 'read_file']);
    this.db
      .prepare(
        `INSERT INTO agents (id, project_id, name, role, description, system_prompt, model_ref, tools, permissions, max_iterations, timeout_ms, max_retries, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.name,
        input.role,
        input.description ?? template?.description ?? '',
        input.systemPrompt ?? template?.systemPrompt ?? '',
        input.modelRef ?? null,
        JSON.stringify(tools),
        JSON.stringify(permissions),
        input.maxIterations ?? 8,
        input.timeoutMs ?? 120_000,
        input.maxRetries ?? 1,
        now,
        now,
      );
    this.events.emit({
      type: 'agent.created',
      projectId: input.projectId,
      agentId: id,
      message: `Agent ${input.name} (${input.role}) created`,
      data: { id, role: input.role, tools },
      source: 'agents',
    });
    return this.get(id);
  }

  update(id: string, patch: Partial<Omit<CreateAgentInput, 'projectId'>>): Agent {
    const current = this.get(id);
    const permissions = patch.permissions ? { ...current.permissions, ...patch.permissions } : current.permissions;
    const tools = patch.tools ?? current.tools;
    this.db
      .prepare(
        `UPDATE agents SET name = ?, role = ?, description = ?, system_prompt = ?, model_ref = ?, tools = ?,
           permissions = ?, max_iterations = ?, timeout_ms = ?, max_retries = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        patch.name ?? current.name,
        patch.role ?? current.role,
        patch.description ?? current.description,
        patch.systemPrompt ?? current.systemPrompt,
        patch.modelRef !== undefined ? patch.modelRef : current.modelRef,
        JSON.stringify(tools),
        JSON.stringify(permissions),
        patch.maxIterations ?? current.maxIterations,
        patch.timeoutMs ?? current.timeoutMs,
        patch.maxRetries ?? current.maxRetries,
        nowIso(),
        id,
      );
    this.events.emit({
      type: 'agent.updated',
      projectId: current.projectId,
      agentId: id,
      message: `Agent ${patch.name ?? current.name} updated`,
      source: 'agents',
    });
    return this.get(id);
  }

  delete(id: string): void {
    const agent = this.get(id);
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    this.events.emit({
      type: 'agent.deleted',
      projectId: agent.projectId,
      agentId: id,
      message: `Agent ${agent.name} deleted`,
      source: 'agents',
    });
  }

  templates(): typeof ROLE_TEMPLATES {
    return ROLE_TEMPLATES;
  }
}

function rowToAgent(r: any): Agent {
  let tools: string[] = [];
  try {
    tools = JSON.parse(r.tools ?? '[]');
  } catch {
    tools = [];
  }
  let permissions: Agent['permissions'] = { ...DEFAULT_PERMISSIONS };
  try {
    permissions = { ...DEFAULT_PERMISSIONS, ...JSON.parse(r.permissions ?? '{}') };
  } catch {
    permissions = { ...DEFAULT_PERMISSIONS };
  }
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    role: r.role,
    description: r.description,
    systemPrompt: r.system_prompt,
    modelRef: r.model_ref,
    tools,
    permissions,
    maxIterations: r.max_iterations,
    timeoutMs: r.timeout_ms,
    maxRetries: r.max_retries,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
