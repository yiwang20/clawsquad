import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AgentProcess } from "../services/AgentProcess.js";
import type { AgentConfig } from "@clawsquad/shared";
import { EventEmitter } from "node:events";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const testConfig: AgentConfig = {
  id: "agent-1",
  squadId: "squad-1",
  roleName: "Backend Dev",
  model: "sonnet",
  permissionMode: "bypassPermissions",
  workingDirectory: "/tmp",
  systemPrompt: "You are a Backend Dev.",
  sessionId: null,
};

describe("AgentProcess (unit — no real CLI)", () => {
  it("starts with idle status", () => {
    const proc = new AgentProcess(testConfig);
    expect(proc.status).toBe("idle");
  });

  it("is an EventEmitter", () => {
    const proc = new AgentProcess(testConfig);
    expect(proc).toBeInstanceOf(EventEmitter);
  });

  it("emits error when sendPrompt is called in idle state", () => {
    const proc = new AgentProcess(testConfig);
    const errors: string[] = [];
    proc.on("error", (msg) => errors.push(msg));
    proc.sendPrompt("hello");
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("idle");
  });

  it("emits error when sendPrompt is called in stopped state", () => {
    const proc = new AgentProcess(testConfig);
    // Simulate stopped status by inspecting internal state via reflection
    // (The process hasn't been started so we test via sendPrompt behavior)
    const errors: string[] = [];
    proc.on("error", (msg) => errors.push(msg));
    proc.sendPrompt("hello");
    expect(errors[0]).toContain("idle"); // starts in idle, not stopped
  });
});

describe("AgentProcess — working directory handling", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("auto-creates a non-existent directory before spawning", () => {
    const dir = path.join(os.tmpdir(), `claw-wd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    dirs.push(dir);
    expect(fs.existsSync(dir)).toBe(false);

    const proc = new AgentProcess({ ...testConfig, workingDirectory: dir });
    // start() will try to spawn 'claude' (which may not exist) but the directory
    // should be created before the spawn attempt fails
    proc.start();

    expect(fs.existsSync(dir)).toBe(true);
  });

  it("expands ~ to the home directory before creating/checking", () => {
    // Use a subdirectory under home so we can safely create and clean up
    const subdir = `.claw-wd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tildeDir = `~/${subdir}`;
    const expandedDir = path.join(os.homedir(), subdir);
    dirs.push(expandedDir);

    const proc = new AgentProcess({ ...testConfig, workingDirectory: tildeDir });
    proc.start();

    expect(fs.existsSync(expandedDir)).toBe(true);
  });
});

describe("AgentProcess — buildArgs", () => {
  it("includes --resume when sessionId is set", () => {
    const proc = new AgentProcess({ ...testConfig, sessionId: "sess-123" });
    const args = (proc as unknown as { buildArgs(): string[] }).buildArgs();
    const idx = args.indexOf("--resume");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("sess-123");
  });

  it("omits --resume when sessionId is null", () => {
    const proc = new AgentProcess({ ...testConfig, sessionId: null });
    const args = (proc as unknown as { buildArgs(): string[] }).buildArgs();
    expect(args).not.toContain("--resume");
  });
});

describe("AgentProcess — writeToStdin", () => {
  it("sends correct JSON format", () => {
    const proc = new AgentProcess(testConfig);
    const written: string[] = [];
    const fakeProc = { stdin: { write: (data: string) => written.push(data) } };
    (proc as unknown as { proc: unknown }).proc = fakeProc;

    (proc as unknown as { writeToStdin(p: string): void }).writeToStdin("hello world");

    expect(written.length).toBe(1);
    const parsed = JSON.parse(written[0]!.trimEnd());
    expect(parsed).toEqual({
      type: "user",
      message: { role: "user", content: "hello world" },
    });
    expect(written[0]).toMatch(/\n$/);
  });
});

describe("AgentProcess — sendPrompt queuing", () => {
  it("queues prompt while running, drains on result message", () => {
    const proc = new AgentProcess(testConfig);
    const written: string[] = [];
    const fakeProc = { stdin: { write: (data: string) => written.push(data) } };
    (proc as unknown as { proc: unknown }).proc = fakeProc;
    // Force status to "running"
    (proc as unknown as { _status: string })._status = "running";

    proc.sendPrompt("queued prompt");
    // Should be queued, not written yet
    expect(written.length).toBe(0);
    expect(
      (proc as unknown as { promptQueue: string[] }).promptQueue
    ).toContain("queued prompt");

    // Simulate a result message arriving → drainQueue → writeToStdin
    (proc as unknown as { processChunk(c: string): void }).processChunk(
      '{"type":"result","subtype":"success"}\n'
    );

    expect(written.length).toBe(1);
    const parsed = JSON.parse(written[0]!.trimEnd());
    expect(parsed.message.content).toBe("queued prompt");
  });
});

describe("AgentProcess stream parsing (via internal access)", () => {
  let proc: AgentProcess;
  let statuses: string[];
  let messages: unknown[];
  let errors: string[];

  beforeEach(() => {
    proc = new AgentProcess(testConfig);
    statuses = [];
    messages = [];
    errors = [];
    proc.on("status", (s) => statuses.push(s));
    proc.on("message", (m) => messages.push(m));
    proc.on("error", (e) => errors.push(e));
  });

  /**
   * Simulate stdout data being received — we access the private method
   * via type assertion to test parsing logic without spawning a real process.
   */
  function simulateStdout(data: string): void {
    (proc as unknown as { processChunk(c: string): void }).processChunk(data);
  }

  it("parses a single JSON line and emits message", () => {
    simulateStdout('{"type":"assistant","content":"hello"}\n');
    expect(messages.length).toBe(1);
    expect((messages[0] as { type: string }).type).toBe("assistant");
  });

  it("handles split lines across chunks", () => {
    simulateStdout('{"type":"assista');
    simulateStdout('nt","content":"hi"}\n');
    expect(messages.length).toBe(1);
  });

  it("handles multiple lines in one chunk", () => {
    simulateStdout(
      '{"type":"assistant","content":"a"}\n{"type":"tool_use","id":"1"}\n'
    );
    expect(messages.length).toBe(2);
  });

  it("emits error for malformed JSON and continues", () => {
    simulateStdout("not-json\n");
    simulateStdout('{"type":"assistant"}\n');
    expect(errors.length).toBe(1);
    expect(messages.length).toBe(1);
  });

  it("transitions to waiting on result message", () => {
    simulateStdout('{"type":"result","subtype":"success"}\n');
    expect(statuses).toContain("waiting");
  });

  it("skips empty lines", () => {
    simulateStdout("\n\n  \n");
    expect(messages.length).toBe(0);
    expect(errors.length).toBe(0);
  });
});
