/**
 * Service interface contracts.
 *
 * These interfaces define the shape that concrete service implementations
 * (ProcessManager, SquadManager, MessageStore) must satisfy. Routes and
 * WebSocketHub depend only on these interfaces — not on the concrete classes —
 * so they can be compiled and tested independently of Task #4's implementations.
 */

import type {
  Agent,
  AgentConfig,
  AgentStatus,
  Squad,
  SquadStatus,
  CreateSquadRequest,
  UpdateSquadRequest,
  AddAgentRequest,
  StreamMessage,
  StoredMessage,
  PaginatedMessagesResponse,
} from "@clawsquad/shared";
import type { EventEmitter } from "events";

// ─── ProcessManager ───────────────────────────────────────────────────────────

/**
 * Events emitted by ProcessManager:
 *   "agent:message"  (agentId: string, data: StreamMessage)
 *   "agent:status"   (agentId: string, status: AgentStatus)
 *   "agent:error"    (agentId: string, error: string)
 */
export interface ProcessManager extends EventEmitter {
  /** Spawn a new CLI process for the given agent config. */
  spawn(agentId: string, config: AgentConfig): void;
  /** Start (or resume) an agent that's idle/stopped. */
  start(agentId: string): Promise<void>;
  /** Gracefully stop a running agent. */
  stop(agentId: string): Promise<void>;
  /** Stop all running agents. */
  stopAll(): Promise<void>;
  /** Send a prompt to an agent (queued if agent is busy). */
  sendPrompt(agentId: string, prompt: string): void;
  /** Send SIGINT to interrupt the current agent turn. */
  abort(agentId: string): void;
  /** Get the current live status of an agent process. */
  getStatus(agentId: string): AgentStatus;
  /** Whether a process exists for the given agent. */
  hasProcess(agentId: string): boolean;
}

// ─── SquadManager ─────────────────────────────────────────────────────────────

export interface SquadManager {
  createSquad(req: CreateSquadRequest): Squad;
  getSquad(squadId: string): Squad | null;
  listSquads(): Squad[];
  updateSquad(squadId: string, req: UpdateSquadRequest): Squad | null;
  deleteSquad(squadId: string): Promise<void>;

  startSquad(squadId: string): Promise<void>;
  stopSquad(squadId: string): Promise<void>;

  addAgent(squadId: string, req: AddAgentRequest): Agent;
  removeAgent(squadId: string, agentId: string): Promise<void>;

  /** Returns the squadId that owns the given agent, or null. */
  getSquadIdForAgent(agentId: string): string | null;
  /** Derive current squad status from live agent statuses. */
  deriveSquadStatus(squadId: string): SquadStatus;
}

// ─── MessageStore ─────────────────────────────────────────────────────────────

export interface MessageStore {
  getAgent(agentId: string): Agent | null;

  /** Persist a stream message from an agent's stdout. */
  saveMessage(
    agentId: string,
    role: StoredMessage["role"],
    type: string,
    content: StreamMessage
  ): void;

  getMessages(
    agentId: string,
    opts: { page: number; pageSize: number }
  ): PaginatedMessagesResponse;
}
