import type {
  AgentStatus,
  SquadStatus,
  PermissionMode,
  DefaultModel,
} from "./constants.js";

// ─── Squad ────────────────────────────────────────────────────────────────────

export interface Squad {
  id: string;
  name: string;
  /** High-level goal shared by all agents in the squad. */
  mission: string;
  /** Derived from agent statuses — not stored in DB. */
  status: SquadStatus;
  workingDirectory: string;
  agents: Agent[];
  createdAt: string;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  squadId: string;
  /** Human-readable role label, e.g. "Backend Dev", "Researcher". */
  roleName: string;
  /** Optional focus area for this role. null when not provided. */
  roleDescription: string | null;
  model: string;
  permissionMode: string;
  workingDirectory: string;
  /** Auto-generated from mission + role, or user-supplied override. */
  systemPrompt: string;
  sessionId: string | null;
  status: AgentStatus;
  createdAt: string;
  lastActiveAt: string | null;
}

/** Config passed to AgentProcess constructor. */
export interface AgentConfig {
  id: string;
  squadId: string;
  roleName: string;
  model: string;
  permissionMode: string;
  workingDirectory: string;
  systemPrompt: string;
  sessionId?: string | null;
  /** Optional spend cap in USD (passed as --max-turns-cost to Claude CLI). */
  maxBudgetUsd?: number;
}

// ─── REST API shapes — Squads ─────────────────────────────────────────────────

/** Per-agent definition inside CreateSquadRequest. */
export interface CreateAgentInput {
  roleName: string;
  roleDescription?: string;
  /** @default "sonnet" */
  model?: string;
  /** @default "bypassPermissions" */
  permissionMode?: string;
  /** Override squad-level working directory for this agent. */
  workingDirectory?: string;
  /** If omitted, auto-generated from squad mission + role. */
  systemPrompt?: string;
  /** Optional spend cap in USD for this agent. */
  maxBudgetUsd?: number;
}

export interface CreateSquadRequest {
  name: string;
  /** High-level goal all agents will share. */
  mission: string;
  /** Defaults to ~/clawsquad-workspace/. */
  workingDirectory?: string;
  /** At least 1, max 10. */
  agents: CreateAgentInput[];
}

export interface UpdateSquadRequest {
  name?: string;
  mission?: string;
}

export interface SquadResponse {
  id: string;
  name: string;
  mission: string;
  status: SquadStatus;
  workingDirectory: string;
  agents: AgentResponse[];
  createdAt: string;
}

/** POST /api/squads/:squadId/agents */
export interface AddAgentRequest {
  roleName: string;
  roleDescription?: string;
  model?: string;
  permissionMode?: string;
  workingDirectory?: string;
  systemPrompt?: string;
  /** Optional spend cap in USD for this agent. */
  maxBudgetUsd?: number;
}

// ─── REST API shapes — Agents ─────────────────────────────────────────────────

export interface AgentResponse {
  id: string;
  squadId: string;
  roleName: string;
  roleDescription: string | null;
  model: string;
  status: AgentStatus;
  permissionMode: string;
  workingDirectory: string;
  /** Always present — auto-generated if user did not supply one. */
  systemPrompt: string;
  sessionId: string | null;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface SendPromptRequest {
  prompt: string;
}

export interface PaginatedMessagesResponse {
  messages: StoredMessage[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Messages / streaming ─────────────────────────────────────────────────────

/**
 * A parsed line from Claude Code's `--output-format stream-json` stdout.
 * Shape varies by `type`; passed through verbatim to the frontend.
 */
export interface StreamMessage {
  type: string;
  subtype?: string;
  [key: string]: unknown;
}

/** A message row as stored in SQLite. */
export interface StoredMessage {
  id: number;
  agentId: string;
  role: "user" | "assistant" | "system" | "tool";
  type: string;
  /** JSON-serialised StreamMessage content. */
  content: string;
  createdAt: string;
}

// ─── V2: Tasks ────────────────────────────────────────────────────────────────

export interface TaskResponse {
  id: string;
  squadId: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  assigneeId: string | null;
  createdBy: string | null;
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  assigneeId?: string;
  dependsOn?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: "pending" | "in_progress" | "completed";
  assigneeId?: string | null;
  dependsOn?: string[];
}

// ─── V2: Agent Messages ───────────────────────────────────────────────────────

export interface AgentMessageResponse {
  id: number;
  squadId: string;
  fromAgentId: string;
  toAgentId: string | null;
  content: string;
  createdAt: string;
}

// ─── WebSocket protocol ───────────────────────────────────────────────────────

// Client → Server
export type WSClientMessage =
  | { type: "agent:prompt"; agentId: string; prompt: string }
  | { type: "agent:abort"; agentId: string }
  | { type: "subscribe"; agentIds: string[] }
  | { type: "unsubscribe"; agentIds: string[] }
  | { type: "subscribe:squad"; squadId: string }
  | { type: "unsubscribe:squad"; squadId: string };

// Server → Client
export type WSServerMessage =
  | { type: "agent:output"; agentId: string; data: StreamMessage }
  | { type: "agent:status"; agentId: string; status: AgentStatus }
  | { type: "agent:error"; agentId: string; error: string }
  | { type: "squad:status"; squadId: string; status: SquadStatus }
  | { type: "task:created"; squadId: string; task: TaskResponse }
  | { type: "task:updated"; squadId: string; task: TaskResponse }
  | { type: "task:deleted"; squadId: string; taskId: string }
  | { type: "agent_message:created"; squadId: string; message: AgentMessageResponse };

// ─── Frontend store ───────────────────────────────────────────────────────────

export interface SquadStore {
  squads: Map<string, Squad>;
  /** All agents across all squads, keyed by agent id. */
  agents: Map<string, Agent>;
  /** Per-agent output history (capped at MAX_OUTPUT_BUFFER_SIZE). */
  outputBuffers: Map<string, StreamMessage[]>;

  // Navigation
  activeSquadId: string | null;
  activeAgentId: string | null;

  // Squad actions
  createSquad(req: CreateSquadRequest): Promise<Squad>;
  deleteSquad(squadId: string): Promise<void>;
  startSquad(squadId: string): Promise<void>;
  stopSquad(squadId: string): Promise<void>;

  // Agent actions
  sendPrompt(agentId: string, prompt: string): void;
  abortAgent(agentId: string): void;
  startAgent(agentId: string): Promise<void>;
  stopAgent(agentId: string): Promise<void>;

  // State updates (called by WebSocket message handler)
  updateAgentStatus(agentId: string, status: AgentStatus): void;
  updateSquadStatus(squadId: string, status: SquadStatus): void;
  addOutput(agentId: string, message: StreamMessage): void;
}

// Re-export constants types for convenience
export type { AgentStatus, SquadStatus, PermissionMode, DefaultModel };
