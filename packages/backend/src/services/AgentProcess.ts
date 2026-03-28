import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import type { AgentConfig, AgentStatus, StreamMessage } from "@clawsquad/shared";

const KILL_TIMEOUT_MS = 5_000;

/**
 * Events emitted by AgentProcess:
 * - "message"  (data: StreamMessage)   — parsed stream-json line from stdout
 * - "status"   (status: AgentStatus)   — status transition
 * - "error"    (message: string)       — non-fatal error (e.g. malformed JSON)
 * - "exit"     (code: number | null)   — process exited
 */
export declare interface AgentProcess {
  on(event: "message", listener: (data: StreamMessage) => void): this;
  on(event: "status", listener: (status: AgentStatus) => void): this;
  on(event: "error", listener: (message: string) => void): this;
  on(event: "exit", listener: (code: number | null) => void): this;
  emit(event: "message", data: StreamMessage): boolean;
  emit(event: "status", status: AgentStatus): boolean;
  emit(event: "error", message: string): boolean;
  emit(event: "exit", code: number | null): boolean;
}

export class AgentProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private lineBuffer = "";
  /** Prompts queued while the agent is mid-turn. */
  private promptQueue: string[] = [];
  private _status: AgentStatus = "idle";

  constructor(private readonly config: AgentConfig) {
    super();
  }

  get status(): AgentStatus {
    return this._status;
  }

  /**
   * Spawn the Claude Code CLI process.
   * The system prompt is passed via `--system-prompt`.
   * The optional initialPrompt is sent via stdin after the process starts.
   */
  start(initialPrompt?: string): void {
    if (this.proc !== null) return;

    const workingDir = expandTilde(this.config.workingDirectory);

    // Auto-create the working directory if it doesn't exist (e.g. ~/clawsquad-workspace)
    try {
      fs.mkdirSync(workingDir, { recursive: true });
    } catch (err) {
      this.emit("error", `Cannot create working directory ${workingDir}: ${(err as Error).message}`);
      this.setStatus("error");
      return;
    }

    const args = this.buildArgs();

    this.proc = spawn("claude", args, {
      cwd: workingDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.proc.stdout!.setEncoding("utf8");
    this.proc.stdout!.on("data", (chunk: string) => this.processChunk(chunk));

    this.proc.stderr!.setEncoding("utf8");
    this.proc.stderr!.on("data", (chunk: string) => {
      process.stderr.write(`[agent:${this.config.id}] ${chunk}`);
    });

    this.proc.on("error", (err) => {
      this.emit("error", `Failed to spawn claude: ${err.message}`);
      this.setStatus("error");
    });

    this.proc.on("exit", (code, signal) => {
      const exitCode = code ?? (signal != null ? 1 : 0);
      if (this._status !== "stopped") {
        this.setStatus("error");
      }
      this.emit("exit", exitCode);
      this.proc = null;
    });

    this.setStatus("running");

    if (initialPrompt) {
      // Deliver the initial prompt via stdin immediately
      this.writeToStdin(initialPrompt);
    }
  }

  /**
   * Send a follow-up prompt to the agent.
   * If the agent is currently running, the prompt is queued and delivered
   * when the current turn completes (→ waiting state).
   */
  sendPrompt(prompt: string): void {
    if (this._status === "waiting") {
      this.writeToStdin(prompt);
    } else if (this._status === "running") {
      this.promptQueue.push(prompt);
    } else {
      this.emit(
        "error",
        `Cannot send prompt — agent status is '${this._status}'`
      );
    }
  }

  /** Send SIGINT to gracefully abort the current turn. */
  abort(): void {
    if (this.proc?.pid != null) {
      process.kill(this.proc.pid, "SIGINT");
    }
  }

  /** Send SIGTERM to terminate the process, with SIGKILL fallback after 5 s. */
  kill(): Promise<void> {
    return new Promise((resolve) => {
      if (this.proc == null) {
        resolve();
        return;
      }
      this.setStatus("stopped");

      const timeout = setTimeout(() => {
        // Process didn't respond to SIGTERM — force kill
        this.proc?.kill("SIGKILL");
        resolve();
      }, KILL_TIMEOUT_MS);

      this.proc.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.proc.kill("SIGTERM");
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private buildArgs(): string[] {
    const args: string[] = [
      "--print",
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--include-partial-messages",
      "--model",
      this.config.model,
      "--permission-mode",
      this.config.permissionMode,
      "--verbose",
    ];

    if (this.config.sessionId) {
      args.push("--resume", this.config.sessionId);
    }

    if (this.config.systemPrompt) {
      args.push("--system-prompt", this.config.systemPrompt);
    }

    if (this.config.maxBudgetUsd != null) {
      args.push("--max-turns-cost", String(this.config.maxBudgetUsd));
    }

    return args;
  }

  private processChunk(chunk: string): void {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split("\n");
    this.lineBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed !== "") {
        this.parseLine(trimmed);
      }
    }
  }

  private parseLine(line: string): void {
    let msg: StreamMessage;
    try {
      msg = JSON.parse(line) as StreamMessage;
    } catch {
      this.emit("error", `Malformed JSON from stdout: ${line.slice(0, 200)}`);
      return;
    }

    this.emit("message", msg);

    // The "result" message type signals turn completion in stream-json format
    if (msg.type === "result") {
      this.setStatus("waiting");
      this.drainQueue();
    }
  }

  private writeToStdin(prompt: string): void {
    if (this.proc?.stdin == null) {
      this.emit("error", "Cannot write to stdin — process not running");
      return;
    }
    const payload = JSON.stringify({ type: "user", content: prompt }) + "\n";
    this.proc.stdin.write(payload);
    this.setStatus("running");
  }

  private drainQueue(): void {
    if (this.promptQueue.length > 0) {
      const next = this.promptQueue.shift()!;
      this.writeToStdin(next);
    }
  }

  private setStatus(status: AgentStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.emit("status", status);
  }
}

/** Expand a leading ~ to the user's home directory. */
function expandTilde(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return os.homedir() + p.slice(1);
  }
  return p;
}
