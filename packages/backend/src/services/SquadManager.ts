import { v4 as uuidv4 } from "uuid";
import type {
  Squad,
  Agent,
  AgentConfig,
  AgentStatus,
  SquadStatus,
  CreateSquadRequest,
  UpdateSquadRequest,
  AddAgentRequest,
} from "@clawsquad/shared";
import {
  DEFAULT_MODEL,
  DEFAULT_PERMISSION_MODE,
  DEFAULT_WORKSPACE_DIR,
  MAX_AGENTS_PER_SQUAD,
} from "@clawsquad/shared";
import type { Database } from "./Database.js";
import type { AgentRow, SquadRow } from "./Database.js";
import type { ProcessManager } from "./ProcessManager.js";

export class SquadManager {
  constructor(
    private readonly db: Database,
    private readonly processManager: ProcessManager
  ) {}

  // ─── Squad CRUD ───────────────────────────────────────────────────────────

  createSquad(req: CreateSquadRequest): Squad {
    const name = req.name.trim();
    if (!name) {
      throw new Error("Squad name cannot be empty");
    }
    if (req.agents.length === 0) {
      throw new Error("A squad must have at least one agent");
    }
    if (req.agents.length > MAX_AGENTS_PER_SQUAD) {
      throw new Error(`A squad cannot have more than ${MAX_AGENTS_PER_SQUAD} agents`);
    }

    const squadId = uuidv4();
    const now = new Date().toISOString();
    const workingDirectory = req.workingDirectory ?? DEFAULT_WORKSPACE_DIR;

    this.db.insertSquad({
      id: squadId,
      name,
      mission: req.mission,
      working_directory: workingDirectory,
      created_at: now,
    });

    // Pre-assign IDs so we can build the teammate list for each agent's system prompt.
    const agentMeta = req.agents.map((agentInput) => ({
      id: uuidv4(),
      input: agentInput,
    }));

    const agents: Agent[] = agentMeta.map(({ id: agentId, input: agentInput }) => {
      const teammates = agentMeta
        .filter((m) => m.id !== agentId)
        .map((m) => ({
          id: m.id,
          roleName: m.input.roleName,
          roleDescription: m.input.roleDescription ?? null,
        }));

      const systemPrompt =
        agentInput.systemPrompt ??
        this.generateSystemPrompt(req.mission, agentInput.roleName, agentInput.roleDescription, teammates);

      const agentRow: AgentRow = {
        id: agentId,
        squad_id: squadId,
        role_name: agentInput.roleName,
        role_description: agentInput.roleDescription ?? null,
        model: agentInput.model ?? DEFAULT_MODEL,
        permission_mode: agentInput.permissionMode ?? DEFAULT_PERMISSION_MODE,
        working_directory: agentInput.workingDirectory ?? workingDirectory,
        system_prompt: systemPrompt,
        session_id: null,
        status: "idle",
        created_at: now,
        last_active_at: null,
        max_budget_usd: agentInput.maxBudgetUsd ?? null,
      };

      this.db.insertAgent(agentRow);
      return rowToAgent(agentRow);
    });

    return {
      id: squadId,
      name,
      mission: req.mission,
      workingDirectory,
      status: "ready",
      agents,
      createdAt: now,
    };
  }

  getSquad(squadId: string): Squad | null {
    const squadRow = this.db.getSquad(squadId);
    if (!squadRow) return null;

    const agentRows = this.db.listAgentsBySquad(squadId);
    const agents = agentRows.map((row) => {
      const agent = rowToAgent(row);
      // Use live process status when a process is running
      if (this.processManager.hasProcess(agent.id)) {
        agent.status = this.processManager.getStatus(agent.id);
      }
      return agent;
    });

    return {
      ...rowToSquad(squadRow),
      status: deriveSquadStatus(agents),
      agents,
    };
  }

  listSquads(): Squad[] {
    return this.db.listSquads().map((squadRow) => {
      const agentRows = this.db.listAgentsBySquad(squadRow.id);
      const agents = agentRows.map((row) => {
        const agent = rowToAgent(row);
        if (this.processManager.hasProcess(agent.id)) {
          agent.status = this.processManager.getStatus(agent.id);
        }
        return agent;
      });
      return {
        ...rowToSquad(squadRow),
        status: deriveSquadStatus(agents),
        agents,
      };
    });
  }

  updateSquad(squadId: string, req: UpdateSquadRequest): Squad | null {
    const existing = this.db.getSquad(squadId);
    if (!existing) return null;

    let name: string | undefined;
    if (req.name !== undefined) {
      name = req.name.trim();
      if (!name) {
        throw new Error("Squad name cannot be empty");
      }
    }

    this.db.updateSquad(squadId, {
      ...(name !== undefined && { name }),
      ...(req.mission !== undefined && { mission: req.mission }),
    });

    return this.getSquad(squadId);
  }

  async deleteSquad(squadId: string): Promise<void> {
    // Stop all running agents before deleting (CASCADE removes agent rows)
    const agents = this.db.listAgentsBySquad(squadId);
    const stops = agents
      .filter((a) => this.processManager.hasProcess(a.id))
      .map((a) => this.processManager.stop(a.id));
    await Promise.all(stops);

    this.db.deleteSquad(squadId);
  }

  // ─── Squad lifecycle ──────────────────────────────────────────────────────

  /** Start all idle/stopped agents in a squad. */
  async startSquad(squadId: string): Promise<void> {
    const squadRow = this.db.getSquad(squadId);
    if (!squadRow) {
      throw new Error(`Squad not found: ${squadId}`);
    }

    const agentRows = this.db.listAgentsBySquad(squadId);
    if (agentRows.length === 0) {
      throw new Error(`Squad ${squadId} has no agents`);
    }

    for (const row of agentRows) {
      if (!this.processManager.hasProcess(row.id)) {
        const config = rowToAgentConfig(row);
        const initialPrompt = row.role_description
          ? `${squadRow.mission}\n\nYour focus: ${row.role_description}`
          : squadRow.mission;
        this.processManager.spawn(row.id, config, initialPrompt);
      }
    }
  }

  /** Stop all running agents in a squad. */
  async stopSquad(squadId: string): Promise<void> {
    const agentRows = this.db.listAgentsBySquad(squadId);
    const stops = agentRows
      .filter((row) => this.processManager.hasProcess(row.id))
      .map((row) => this.processManager.stop(row.id));
    await Promise.all(stops);
  }

  // ─── Agent management ─────────────────────────────────────────────────────

  addAgent(squadId: string, req: AddAgentRequest): Agent {
    const roleName = req.roleName.trim();
    if (!roleName) {
      throw new Error("Agent role name cannot be empty");
    }

    const squadRow = this.db.getSquad(squadId);
    if (!squadRow) {
      throw new Error(`Squad not found: ${squadId}`);
    }

    const existingAgents = this.db.listAgentsBySquad(squadId);
    if (existingAgents.length >= MAX_AGENTS_PER_SQUAD) {
      throw new Error(`Squad already has the maximum of ${MAX_AGENTS_PER_SQUAD} agents`);
    }

    const agentId = uuidv4();
    const now = new Date().toISOString();
    const teammates = existingAgents.map((a) => ({
      id: a.id,
      roleName: a.role_name,
      roleDescription: a.role_description,
    }));
    const systemPrompt =
      req.systemPrompt ??
      this.generateSystemPrompt(squadRow.mission, roleName, req.roleDescription, teammates);

    const agentRow: AgentRow = {
      id: agentId,
      squad_id: squadId,
      role_name: roleName,
      role_description: req.roleDescription ?? null,
      model: req.model ?? DEFAULT_MODEL,
      permission_mode: req.permissionMode ?? DEFAULT_PERMISSION_MODE,
      working_directory: req.workingDirectory ?? squadRow.working_directory,
      system_prompt: systemPrompt,
      session_id: null,
      status: "idle",
      created_at: now,
      last_active_at: null,
      max_budget_usd: req.maxBudgetUsd ?? null,
    };

    this.db.insertAgent(agentRow);
    return rowToAgent(agentRow);
  }

  async removeAgent(squadId: string, agentId: string): Promise<void> {
    if (this.processManager.hasProcess(agentId)) {
      await this.processManager.stop(agentId);
    }
    this.db.deleteAgent(agentId);
  }

  // ─── Status helpers ───────────────────────────────────────────────────────

  /** Returns the squadId that owns the given agent, or null. */
  getSquadIdForAgent(agentId: string): string | null {
    const row = this.db.getAgent(agentId);
    return row?.squad_id ?? null;
  }

  /** Derive current squad status from live agent statuses. */
  deriveSquadStatus(squadId: string): SquadStatus {
    const agentRows = this.db.listAgentsBySquad(squadId);
    const statuses: AgentStatus[] = agentRows.map((row) => {
      if (this.processManager.hasProcess(row.id)) {
        return this.processManager.getStatus(row.id);
      }
      return row.status as AgentStatus;
    });

    return deriveSquadStatus(
      statuses.map((status) => ({ status } as Agent))
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private generateSystemPrompt(
    mission: string,
    roleName: string,
    roleDescription?: string,
    teammates: Array<{ id: string; roleName: string; roleDescription: string | null }> = []
  ): string {
    const lines: string[] = [
      `You are the ${roleName} on a squad working on: ${mission}.`,
    ];
    if (roleDescription) {
      lines.push(`Your specific focus: ${roleDescription}.`);
    }

    if (teammates.length > 0) {
      lines.push("", "## Your Squad", "", "You are working alongside other agents in this squad:");
      for (const t of teammates) {
        const focus = t.roleDescription ?? "General";
        lines.push(`- ${t.roleName} (ID: ${t.id}): ${focus}`);
      }
    }

    lines.push(
      "",
      "## Coordination Commands",
      "",
      "You can coordinate with your squad by including these commands in your responses.",
      "The system will detect and execute them automatically. Place each command on its own line.",
      "",
      "### Task Management",
      '- `[TASK_CREATE "title" "description"]` — Create a new task on the squad task board',
      "- `[TASK_LIST]` — Show all current tasks and their statuses",
      "- `[TASK_CLAIM taskId]` — Claim a task and mark it as in-progress",
      "- `[TASK_COMPLETE taskId]` — Mark a task as completed",
      '- `[TASK_UPDATE taskId "status"]` — Update task status (pending/in_progress/completed)',
      "",
      "### Communication",
      '- `[SEND_MESSAGE agentId "message text"]` — Send a message to a specific agent',
      '- `[BROADCAST "message text"]` — Send a message to all agents in the squad',
      "- `[CHECK_MESSAGES]` — Check your inbox for new messages",
      "",
      "### Guidelines",
      "- Break your work into tasks early so the squad has visibility.",
      "- Claim tasks before starting work to avoid duplication.",
      "- Mark tasks complete when done.",
      "- Use SEND_MESSAGE to ask specific agents for help or share findings.",
      "- Use BROADCAST for announcements that affect the whole squad.",
      "- Check messages periodically to stay coordinated.",
      "",
      "When your current task is complete, summarize what you accomplished and check for new tasks or messages.",
    );
    return lines.join("\n");
  }
}

// ─── Pure status derivation ───────────────────────────────────────────────────

/**
 * Derive squad status from an array of agents.
 * This matches the spec in architecture.md exactly.
 */
function deriveSquadStatus(agents: Pick<Agent, "status">[]): SquadStatus {
  if (agents.some((a) => a.status === "error")) return "error";
  if (agents.some((a) => a.status === "running")) return "running";
  if (agents.some((a) => a.status === "waiting")) return "active";
  if (agents.every((a) => a.status === "stopped")) return "stopped";
  return "ready"; // all idle or mixed idle/stopped
}

// ─── Row → domain object mappers ──────────────────────────────────────────────

function rowToSquad(row: SquadRow): Omit<Squad, "status" | "agents"> {
  return {
    id: row.id,
    name: row.name,
    mission: row.mission,
    workingDirectory: row.working_directory,
    createdAt: row.created_at,
  };
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    squadId: row.squad_id,
    roleName: row.role_name,
    roleDescription: row.role_description,
    model: row.model,
    permissionMode: row.permission_mode,
    workingDirectory: row.working_directory,
    systemPrompt: row.system_prompt,
    sessionId: row.session_id,
    status: row.status as AgentStatus,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

function rowToAgentConfig(row: AgentRow): AgentConfig {
  return {
    id: row.id,
    squadId: row.squad_id,
    roleName: row.role_name,
    model: row.model,
    permissionMode: row.permission_mode,
    workingDirectory: row.working_directory,
    systemPrompt: row.system_prompt,
    sessionId: row.session_id,
    ...(row.max_budget_usd != null && { maxBudgetUsd: row.max_budget_usd }),
  };
}
