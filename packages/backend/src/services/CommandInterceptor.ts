import type { StreamMessage } from "@clawsquad/shared";
import type { ProcessManager, SquadManager } from "./types.js";
import type { TaskStore } from "./TaskStore.js";
import { taskRowToResponse } from "./TaskStore.js";
import type { AgentMessageStore } from "./AgentMessageStore.js";
import { agentMessageRowToResponse } from "./AgentMessageStore.js";
import type { WebSocketHub } from "../ws/WebSocketHub.js";
import type { Database } from "./Database.js";

/** Parsed command extracted from an agent's assistant text. */
interface ParsedCommand {
  name: string;
  args: string[];
}

/**
 * CommandInterceptor listens to ProcessManager "agent:message" events,
 * scans assistant text for [COMMAND ...] patterns, executes the corresponding
 * DB operations, and injects response prompts back to the agent.
 */
export class CommandInterceptor {
  constructor(
    private readonly processManager: ProcessManager,
    private readonly taskStore: TaskStore,
    private readonly agentMessageStore: AgentMessageStore,
    private readonly squadManager: SquadManager,
    private readonly wsHub: WebSocketHub,
    private readonly db: Database
  ) {
    this.processManager.on("agent:message", this.handleMessage.bind(this));
  }

  // ─── Core event handler ───────────────────────────────────────────────────

  private handleMessage(agentId: string, data: StreamMessage): void {
    if (data.type !== "assistant") return;

    const text = this.extractText(data);
    if (!text) return;

    const commands = this.parseCommands(text);
    for (const cmd of commands) {
      try {
        this.executeCommand(agentId, cmd);
      } catch (err) {
        console.warn(
          `[CommandInterceptor] Error executing ${cmd.name} for agent ${agentId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  // ─── Command parsing ──────────────────────────────────────────────────────

  private extractText(data: StreamMessage): string | null {
    if (typeof data.content === "string") return data.content;
    if (Array.isArray(data.content)) {
      return (data.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
    }
    return null;
  }

  private parseCommands(text: string): ParsedCommand[] {
    const results: ParsedCommand[] = [];
    // Matches [COMMAND] or [COMMAND arg1 "quoted arg" arg3 ...]
    const cmdRegex = /\[([A-Z_]+)(?:\s+(.+?))?\]/g;
    let match: RegExpExecArray | null;
    while ((match = cmdRegex.exec(text)) !== null) {
      const name = match[1]!;
      const rawArgs = match[2] ?? "";
      const args = rawArgs.trim() ? this.splitArgs(rawArgs.trim()) : [];
      results.push({ name, args });
    }
    return results;
  }

  /** Split args by whitespace, preserving double-quoted strings as single tokens. */
  private splitArgs(raw: string): string[] {
    const args: string[] = [];
    const re = /"([^"]*)"|\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      args.push(m[1] !== undefined ? m[1] : m[0]!);
    }
    return args;
  }

  // ─── Command execution ────────────────────────────────────────────────────

  private executeCommand(agentId: string, cmd: ParsedCommand): void {
    const squadId = this.squadManager.getSquadIdForAgent(agentId);
    if (!squadId) {
      console.warn(`[CommandInterceptor] Agent ${agentId} not found in any squad`);
      return;
    }

    switch (cmd.name) {
      case "TASK_CREATE":
        this.handleTaskCreate(agentId, squadId, cmd.args);
        break;
      case "TASK_LIST":
        this.handleTaskList(agentId, squadId);
        break;
      case "TASK_CLAIM":
        this.handleTaskClaim(agentId, squadId, cmd.args);
        break;
      case "TASK_COMPLETE":
        this.handleTaskComplete(agentId, squadId, cmd.args);
        break;
      case "TASK_UPDATE":
        this.handleTaskUpdate(agentId, squadId, cmd.args);
        break;
      case "SEND_MESSAGE":
        this.handleSendMessage(agentId, squadId, cmd.args);
        break;
      case "BROADCAST":
        this.handleBroadcast(agentId, squadId, cmd.args);
        break;
      case "CHECK_MESSAGES":
        this.handleCheckMessages(agentId);
        break;
      default:
        // Unknown command — ignore silently
        break;
    }
  }

  // ─── Task command handlers ────────────────────────────────────────────────

  private handleTaskCreate(agentId: string, squadId: string, args: string[]): void {
    const title = args[0];
    const description = args[1] ?? "";
    if (!title) {
      this.injectResponse(agentId, "[ERROR] TASK_CREATE requires a title argument.");
      return;
    }
    const row = this.taskStore.createTask(squadId, title, description, agentId);
    const task = taskRowToResponse(row);
    this.wsHub.broadcastTaskEvent(squadId, "task:created", task);
    this.injectResponse(agentId, `[SYSTEM] Task created: ${row.id} — ${row.title}`);
  }

  private handleTaskList(agentId: string, squadId: string): void {
    const tasks = this.taskStore.listTasks(squadId);
    if (tasks.length === 0) {
      this.injectResponse(agentId, "[SYSTEM] No tasks on the board.");
      return;
    }
    const lines = tasks.map(
      (t) =>
        `- [${t.status.toUpperCase()}] ${t.id}: ${t.title}` +
        (t.assignee_id ? ` (assigned: ${t.assignee_id})` : "")
    );
    this.injectResponse(agentId, `[SYSTEM] Current tasks:\n${lines.join("\n")}`);
  }

  private handleTaskClaim(agentId: string, squadId: string, args: string[]): void {
    const taskId = args[0];
    if (!taskId) {
      this.injectResponse(agentId, "[ERROR] TASK_CLAIM requires a task ID.");
      return;
    }
    const row = this.taskStore.claimTask(taskId, agentId);
    if (!row) {
      this.injectResponse(
        agentId,
        `[ERROR] Task ${taskId} not found or is not in pending state.`
      );
      return;
    }
    this.wsHub.broadcastTaskEvent(squadId, "task:updated", taskRowToResponse(row));
    this.injectResponse(agentId, `[SYSTEM] Task ${taskId} claimed.`);
  }

  private handleTaskComplete(agentId: string, squadId: string, args: string[]): void {
    const taskId = args[0];
    if (!taskId) {
      this.injectResponse(agentId, "[ERROR] TASK_COMPLETE requires a task ID.");
      return;
    }
    const row = this.taskStore.completeTask(taskId);
    if (!row) {
      this.injectResponse(agentId, `[ERROR] Task ${taskId} not found.`);
      return;
    }
    this.wsHub.broadcastTaskEvent(squadId, "task:updated", taskRowToResponse(row));
    this.injectResponse(agentId, `[SYSTEM] Task ${taskId} marked complete.`);
  }

  private handleTaskUpdate(agentId: string, squadId: string, args: string[]): void {
    const taskId = args[0];
    const status = args[1];
    if (!taskId || !status) {
      this.injectResponse(agentId, "[ERROR] TASK_UPDATE requires a task ID and status.");
      return;
    }
    const row = this.taskStore.updateTaskStatus(taskId, status);
    if (!row) {
      this.injectResponse(
        agentId,
        `[ERROR] Task ${taskId} not found or status "${status}" is invalid.`
      );
      return;
    }
    this.wsHub.broadcastTaskEvent(squadId, "task:updated", taskRowToResponse(row));
    this.injectResponse(agentId, `[SYSTEM] Task ${taskId} updated to ${status}.`);
  }

  // ─── Messaging command handlers ───────────────────────────────────────────

  private handleSendMessage(agentId: string, squadId: string, args: string[]): void {
    const toAgentId = args[0];
    const content = args[1];
    if (!toAgentId || !content) {
      this.injectResponse(
        agentId,
        "[ERROR] SEND_MESSAGE requires a target agent ID and message text."
      );
      return;
    }
    // Validate target agent belongs to this squad
    const targetSquadId = this.squadManager.getSquadIdForAgent(toAgentId);
    if (targetSquadId !== squadId) {
      this.injectResponse(agentId, `[ERROR] Agent ${toAgentId} not found in this squad.`);
      return;
    }
    const row = this.agentMessageStore.sendMessage(squadId, agentId, toAgentId, content);
    this.wsHub.broadcastAgentMessageEvent(squadId, agentMessageRowToResponse(row));
    // Look up the target agent's role name for a friendly response
    const targetAgent = this.db.getAgent(toAgentId);
    const targetName = targetAgent?.role_name ?? toAgentId;
    this.injectResponse(agentId, `[SYSTEM] Message sent to ${targetName}.`);
  }

  private handleBroadcast(agentId: string, squadId: string, args: string[]): void {
    const content = args[0];
    if (!content) {
      this.injectResponse(agentId, "[ERROR] BROADCAST requires a message text.");
      return;
    }
    const row = this.agentMessageStore.broadcastMessage(squadId, agentId, content);
    this.wsHub.broadcastAgentMessageEvent(squadId, agentMessageRowToResponse(row));
    this.injectResponse(agentId, "[SYSTEM] Broadcast sent.");
  }

  private handleCheckMessages(agentId: string): void {
    const messages = this.agentMessageStore.getMessagesForAgent(agentId);
    if (messages.length === 0) {
      this.injectResponse(agentId, "[SYSTEM] No new messages.");
      return;
    }
    const lines = messages.map((m) => {
      const sender = this.db.getAgent(m.from_agent_id);
      const senderName = sender?.role_name ?? m.from_agent_id;
      const recipient = m.to_agent_id ? "you" : "all";
      return `- From ${senderName} (to ${recipient}): ${m.content}`;
    });
    this.injectResponse(agentId, `[SYSTEM] Messages:\n${lines.join("\n")}`);
  }

  // ─── Response injection ───────────────────────────────────────────────────

  private injectResponse(agentId: string, text: string): void {
    try {
      this.processManager.sendPrompt(agentId, text);
    } catch (err) {
      console.warn(
        `[CommandInterceptor] Failed to inject response for agent ${agentId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}
