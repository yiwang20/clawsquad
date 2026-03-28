import { EventEmitter } from "node:events";
import type { AgentConfig, AgentStatus, StreamMessage } from "@clawsquad/shared";
import { AgentProcess } from "./AgentProcess.js";
import type { Database } from "./Database.js";
import type { MessageStore } from "./MessageStore.js";

/**
 * ProcessManager owns the lifecycle of all Claude Code CLI child processes.
 *
 * Events emitted:
 *   "agent:message"  (agentId: string, data: StreamMessage)
 *   "agent:status"   (agentId: string, status: AgentStatus)
 *   "agent:error"    (agentId: string, error: string)
 */
export declare interface ProcessManager {
  on(
    event: "agent:message",
    listener: (agentId: string, data: StreamMessage) => void
  ): this;
  on(
    event: "agent:status",
    listener: (agentId: string, status: AgentStatus) => void
  ): this;
  on(
    event: "agent:error",
    listener: (agentId: string, error: string) => void
  ): this;
  emit(
    event: "agent:message",
    agentId: string,
    data: StreamMessage
  ): boolean;
  emit(
    event: "agent:status",
    agentId: string,
    status: AgentStatus
  ): boolean;
  emit(event: "agent:error", agentId: string, error: string): boolean;
}

export class ProcessManager extends EventEmitter {
  /** Running AgentProcess instances, keyed by agent ID. */
  private processes = new Map<string, AgentProcess>();

  constructor(
    private readonly db: Database,
    private readonly messageStore: MessageStore
  ) {
    super();
  }

  /**
   * Spawn a new AgentProcess for the given agent config and start it immediately.
   * Throws if a process is already running for this agent.
   */
  spawn(agentId: string, config: AgentConfig): void {
    if (this.processes.has(agentId)) {
      throw new Error(`Agent ${agentId} already has a running process`);
    }

    const proc = new AgentProcess(config);
    this.attachListeners(agentId, proc);
    this.processes.set(agentId, proc);

    // proc.start() calls setStatus("running") or setStatus("error") synchronously,
    // which fires the "status" event.  The listener in attachListeners() writes the
    // correct status to the DB.  Do NOT write "running" here afterwards — that would
    // overwrite an "error" status emitted by a failed start() (e.g. missing working dir).
    proc.start();
  }

  /**
   * Start (or resume) an agent that is idle or stopped.
   * Looks up the agent config from the database.
   */
  async start(agentId: string): Promise<void> {
    if (this.processes.has(agentId)) {
      return; // Already running
    }

    const agentRow = this.db.getAgent(agentId);
    if (!agentRow) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const config: AgentConfig = {
      id: agentRow.id,
      squadId: agentRow.squad_id,
      roleName: agentRow.role_name,
      model: agentRow.model,
      permissionMode: agentRow.permission_mode,
      workingDirectory: agentRow.working_directory,
      systemPrompt: agentRow.system_prompt,
      sessionId: agentRow.session_id,
      ...(agentRow.max_budget_usd != null && { maxBudgetUsd: agentRow.max_budget_usd }),
    };

    const proc = new AgentProcess(config);
    this.attachListeners(agentId, proc);
    this.processes.set(agentId, proc);

    // Same as spawn(): let the "status" event listener handle the DB update.
    proc.start();
  }

  /** Gracefully stop a running agent (SIGTERM). */
  async stop(agentId: string): Promise<void> {
    const proc = this.processes.get(agentId);
    if (!proc) return;
    await proc.kill();
    this.processes.delete(agentId);
    this.db.updateAgentStatus(agentId, "stopped", new Date().toISOString());
  }

  /** Stop all running agents. */
  async stopAll(): Promise<void> {
    const stops = Array.from(this.processes.keys()).map((id) => this.stop(id));
    await Promise.all(stops);
  }

  /**
   * Send a prompt to an agent. If the agent is mid-turn, the prompt is queued.
   */
  sendPrompt(agentId: string, prompt: string): void {
    const proc = this.processes.get(agentId);
    if (!proc) {
      throw new Error(`No running process for agent ${agentId}`);
    }
    proc.sendPrompt(prompt);
  }

  /** Send SIGINT to interrupt the agent's current turn. */
  abort(agentId: string): void {
    this.processes.get(agentId)?.abort();
  }

  /**
   * Get the live status of an agent process.
   * Falls back to reading from the DB if no process is registered.
   */
  getStatus(agentId: string): AgentStatus {
    const proc = this.processes.get(agentId);
    if (proc) return proc.status;

    const row = this.db.getAgent(agentId);
    return (row?.status as AgentStatus | undefined) ?? "stopped";
  }

  /** Returns true if a process is currently registered for this agent. */
  hasProcess(agentId: string): boolean {
    return this.processes.has(agentId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private attachListeners(agentId: string, proc: AgentProcess): void {
    proc.on("message", (data) => {
      // Persist messages from assistant turns
      if (
        data.type === "assistant" ||
        data.type === "tool_use" ||
        data.type === "tool_result"
      ) {
        this.messageStore.saveMessage(agentId, "assistant", data.type, data);
      } else if (data.type === "result") {
        this.messageStore.saveMessage(agentId, "assistant", data.type, data);
      }

      // Extract session ID from system init message
      if (
        data.type === "system" &&
        data.subtype === "init" &&
        typeof data["session_id"] === "string"
      ) {
        this.db.updateAgentSessionId(agentId, data["session_id"] as string);
      }

      this.emit("agent:message", agentId, data);
    });

    proc.on("status", (status) => {
      this.db.updateAgentStatus(agentId, status, new Date().toISOString());
      this.emit("agent:status", agentId, status);
    });

    proc.on("error", (message) => {
      this.emit("agent:error", agentId, message);
    });

    proc.on("exit", (code) => {
      this.processes.delete(agentId);
      // If the process exited with an error and wasn't intentionally stopped,
      // the status will already be set to 'error' by the proc's status event.
      // Log for observability.
      if (code !== 0 && code !== null) {
        process.stderr.write(
          `[ProcessManager] agent ${agentId} exited with code ${code}\n`
        );
      }
    });
  }
}
