import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandInterceptor } from "../services/CommandInterceptor.js";
import type { ProcessManager, SquadManager } from "../services/types.js";
import type { TaskStore } from "../services/TaskStore.js";
import type { AgentMessageStore } from "../services/AgentMessageStore.js";
import type { WebSocketHub } from "../ws/WebSocketHub.js";
import type { Database } from "../services/Database.js";
import type { StreamMessage } from "@clawsquad/shared";
import type { TaskRow } from "../services/Database.js";
import type { AgentMessageRow } from "../services/Database.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTaskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "task-1",
    squad_id: "squad-1",
    title: "My Task",
    description: "",
    status: "pending",
    assignee_id: null,
    created_by: null,
    depends_on: "[]",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeAgentMessageRow(overrides: Partial<AgentMessageRow> = {}): AgentMessageRow {
  return {
    id: 1,
    squad_id: "squad-1",
    from_agent_id: "agent-2",
    to_agent_id: "agent-1",
    content: "hello",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeProcessManager(): ProcessManager {
  return {
    spawn: vi.fn(),
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    stopAll: vi.fn().mockResolvedValue(undefined),
    sendPrompt: vi.fn(),
    abort: vi.fn(),
    getStatus: vi.fn().mockReturnValue("idle"),
    hasProcess: vi.fn().mockReturnValue(false),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    emit: vi.fn().mockReturnValue(false),
    addListener: vi.fn().mockReturnThis(),
    removeListener: vi.fn().mockReturnThis(),
    once: vi.fn().mockReturnThis(),
  } as unknown as ProcessManager;
}

function makeSquadManager(squadId: string | null = "squad-1"): SquadManager {
  return {
    getSquadIdForAgent: vi.fn().mockReturnValue(squadId),
  } as unknown as SquadManager;
}

function makeTaskStore(): TaskStore {
  return {
    createTask: vi.fn().mockReturnValue(makeTaskRow()),
    listTasks: vi.fn().mockReturnValue([]),
    getTask: vi.fn().mockReturnValue(makeTaskRow()),
    claimTask: vi.fn().mockReturnValue(makeTaskRow({ status: "in_progress" })),
    completeTask: vi.fn().mockReturnValue(makeTaskRow({ status: "completed" })),
    updateTaskStatus: vi.fn().mockReturnValue(makeTaskRow()),
    updateTask: vi.fn().mockReturnValue(makeTaskRow()),
    deleteTask: vi.fn().mockReturnValue(true),
  } as unknown as TaskStore;
}

function makeAgentMessageStore(): AgentMessageStore {
  return {
    sendMessage: vi.fn().mockReturnValue(makeAgentMessageRow()),
    broadcastMessage: vi.fn().mockReturnValue(makeAgentMessageRow({ to_agent_id: null })),
    getMessagesForAgent: vi.fn().mockReturnValue([]),
    getSquadMessages: vi.fn().mockReturnValue([]),
  } as unknown as AgentMessageStore;
}

function makeWsHub(): WebSocketHub {
  return {
    broadcastTaskEvent: vi.fn(),
    broadcastAgentMessageEvent: vi.fn(),
  } as unknown as WebSocketHub;
}

function makeDb(roleName = "Frontend Dev"): Database {
  return {
    getAgent: vi.fn().mockReturnValue({ role_name: roleName }),
  } as unknown as Database;
}

/** Create an interceptor with the given overrides and return it + all its dependencies. */
function setup(overrides: {
  processManager?: ProcessManager;
  squadManager?: SquadManager;
  taskStore?: TaskStore;
  agentMessageStore?: AgentMessageStore;
  wsHub?: WebSocketHub;
  db?: Database;
} = {}) {
  const processManager = overrides.processManager ?? makeProcessManager();
  const squadManager = overrides.squadManager ?? makeSquadManager();
  const taskStore = overrides.taskStore ?? makeTaskStore();
  const agentMessageStore = overrides.agentMessageStore ?? makeAgentMessageStore();
  const wsHub = overrides.wsHub ?? makeWsHub();
  const db = overrides.db ?? makeDb();
  const interceptor = new CommandInterceptor(
    processManager,
    taskStore,
    agentMessageStore,
    squadManager,
    wsHub,
    db
  );
  return { interceptor, processManager, squadManager, taskStore, agentMessageStore, wsHub, db };
}

/** Access a private method via type assertion. */
type CI = {
  extractText(data: StreamMessage): string | null;
  parseCommands(text: string): Array<{ name: string; args: string[] }>;
  handleMessage(agentId: string, data: StreamMessage): void;
};

function priv(interceptor: CommandInterceptor): CI {
  return interceptor as unknown as CI;
}

/** Simulate the processManager emitting "agent:message" */
function emitMessage(pm: ProcessManager, agentId: string, data: StreamMessage): void {
  const handler = vi.mocked(pm.on).mock.calls.find(([event]) => event === "agent:message")?.[1];
  if (handler) (handler as (id: string, d: StreamMessage) => void)(agentId, data);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CommandInterceptor — extractText", () => {
  let interceptor: CommandInterceptor;

  beforeEach(() => {
    ({ interceptor } = setup());
  });

  it("extracts string content directly", () => {
    const result = priv(interceptor).extractText({ type: "assistant", content: "hello" });
    expect(result).toBe("hello");
  });

  it("extracts text from content blocks array", () => {
    const result = priv(interceptor).extractText({
      type: "assistant",
      content: [
        { type: "text", text: "foo " },
        { type: "tool_use", id: "x" },
        { type: "text", text: "bar" },
      ],
    });
    expect(result).toBe("foo bar");
  });

  it("returns null when content is absent/null", () => {
    expect(priv(interceptor).extractText({ type: "assistant" })).toBeNull();
  });

  it("returns null for non-string non-array content", () => {
    expect(priv(interceptor).extractText({ type: "assistant", content: 42 })).toBeNull();
  });
});

describe("CommandInterceptor — parseCommands", () => {
  let interceptor: CommandInterceptor;

  beforeEach(() => {
    ({ interceptor } = setup());
  });

  it("parses a single command with no args", () => {
    const cmds = priv(interceptor).parseCommands("Some text [TASK_LIST] more text");
    expect(cmds).toEqual([{ name: "TASK_LIST", args: [] }]);
  });

  it("parses a command with unquoted args", () => {
    const cmds = priv(interceptor).parseCommands("[TASK_CLAIM task-123]");
    expect(cmds).toEqual([{ name: "TASK_CLAIM", args: ["task-123"] }]);
  });

  it("parses quoted string args as single tokens", () => {
    const cmds = priv(interceptor).parseCommands('[TASK_CREATE "My Task" "some desc"]');
    expect(cmds).toEqual([{ name: "TASK_CREATE", args: ["My Task", "some desc"] }]);
  });

  it("parses multiple commands from one text", () => {
    const cmds = priv(interceptor).parseCommands("[TASK_LIST]\n[CHECK_MESSAGES]");
    expect(cmds.map((c) => c.name)).toEqual(["TASK_LIST", "CHECK_MESSAGES"]);
  });

  it("returns empty array when no commands present", () => {
    const cmds = priv(interceptor).parseCommands("Normal text without any commands.");
    expect(cmds).toEqual([]);
  });

  it("ignores lowercase brackets (not a command)", () => {
    const cmds = priv(interceptor).parseCommands("[not_a_command]");
    expect(cmds).toEqual([]);
  });
});

describe("CommandInterceptor — ignores non-assistant messages", () => {
  it("does not execute commands from tool_result messages", () => {
    const { interceptor, processManager, taskStore } = setup();
    emitMessage(processManager, "agent-1", {
      type: "tool_result",
      content: "[TASK_LIST]",
    });
    expect(taskStore.listTasks).not.toHaveBeenCalled();
  });

  it("does not execute commands from result messages", () => {
    const { interceptor, processManager, taskStore } = setup();
    emitMessage(processManager, "agent-1", {
      type: "result",
      content: "[TASK_CREATE \"T\" \"D\"]",
    });
    expect(taskStore.createTask).not.toHaveBeenCalled();
  });
});

describe("CommandInterceptor — agent not in squad", () => {
  it("silently skips commands when agent has no squad", () => {
    const { interceptor, processManager, taskStore } = setup({
      squadManager: makeSquadManager(null),
    });
    emitMessage(processManager, "orphan-agent", {
      type: "assistant",
      content: "[TASK_LIST]",
    });
    expect(taskStore.listTasks).not.toHaveBeenCalled();
  });
});

describe("CommandInterceptor — TASK_CREATE", () => {
  it("creates task and injects success response", () => {
    const { interceptor, processManager, taskStore, wsHub } = setup();
    emitMessage(processManager, "agent-1", {
      type: "assistant",
      content: '[TASK_CREATE "Fix bug" "details"]',
    });
    expect(taskStore.createTask).toHaveBeenCalledWith("squad-1", "Fix bug", "details", "agent-1");
    expect(wsHub.broadcastTaskEvent).toHaveBeenCalledWith(
      "squad-1",
      "task:created",
      expect.anything()
    );
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("[SYSTEM] Task created:");
  });

  it("injects error when title is missing", () => {
    const { interceptor, processManager, taskStore } = setup();
    emitMessage(processManager, "agent-1", { type: "assistant", content: "[TASK_CREATE]" });
    expect(taskStore.createTask).not.toHaveBeenCalled();
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("[ERROR]");
  });
});

describe("CommandInterceptor — TASK_LIST", () => {
  it("responds with 'no tasks' when board is empty", () => {
    const { interceptor, processManager } = setup();
    emitMessage(processManager, "agent-1", { type: "assistant", content: "[TASK_LIST]" });
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("No tasks");
  });

  it("lists tasks when board has items", () => {
    const taskStore = makeTaskStore();
    vi.mocked(taskStore.listTasks).mockReturnValue([
      makeTaskRow({ id: "t1", title: "Do stuff", status: "pending" }),
    ]);
    const { interceptor, processManager } = setup({ taskStore });
    emitMessage(processManager, "agent-1", { type: "assistant", content: "[TASK_LIST]" });
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("Do stuff");
    expect(injected).toContain("PENDING");
  });
});

describe("CommandInterceptor — TASK_CLAIM", () => {
  it("claims task and broadcasts update", () => {
    const { interceptor, processManager, taskStore, wsHub } = setup();
    emitMessage(processManager, "agent-1", {
      type: "assistant",
      content: "[TASK_CLAIM task-1]",
    });
    expect(taskStore.claimTask).toHaveBeenCalledWith("task-1", "agent-1");
    expect(wsHub.broadcastTaskEvent).toHaveBeenCalledWith("squad-1", "task:updated", expect.anything());
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("claimed");
  });

  it("injects error when task not found or not pending", () => {
    const taskStore = makeTaskStore();
    vi.mocked(taskStore.claimTask).mockReturnValue(undefined);
    const { interceptor, processManager } = setup({ taskStore });
    emitMessage(processManager, "agent-1", {
      type: "assistant",
      content: "[TASK_CLAIM bad-id]",
    });
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("[ERROR]");
  });

  it("injects error when task ID is missing", () => {
    const { interceptor, processManager, taskStore } = setup();
    emitMessage(processManager, "agent-1", { type: "assistant", content: "[TASK_CLAIM]" });
    expect(taskStore.claimTask).not.toHaveBeenCalled();
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("[ERROR]");
  });
});

describe("CommandInterceptor — TASK_COMPLETE", () => {
  it("completes task and broadcasts update", () => {
    const { interceptor, processManager, taskStore, wsHub } = setup();
    emitMessage(processManager, "agent-1", {
      type: "assistant",
      content: "[TASK_COMPLETE task-1]",
    });
    expect(taskStore.completeTask).toHaveBeenCalledWith("task-1");
    expect(wsHub.broadcastTaskEvent).toHaveBeenCalled();
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("complete");
  });

  it("injects error when task not found", () => {
    const taskStore = makeTaskStore();
    vi.mocked(taskStore.completeTask).mockReturnValue(undefined);
    const { interceptor, processManager } = setup({ taskStore });
    emitMessage(processManager, "agent-1", {
      type: "assistant",
      content: "[TASK_COMPLETE missing]",
    });
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("[ERROR]");
  });
});

describe("CommandInterceptor — SEND_MESSAGE", () => {
  it("sends message and injects confirmation with role name", () => {
    const squadManager = makeSquadManager("squad-1");
    // Both agents are in squad-1
    vi.mocked(squadManager.getSquadIdForAgent)
      .mockReturnValueOnce("squad-1") // sender lookup
      .mockReturnValueOnce("squad-1"); // recipient validation
    const { interceptor, processManager, agentMessageStore, wsHub } = setup({ squadManager });
    emitMessage(processManager, "agent-1", {
      type: "assistant",
      content: '[SEND_MESSAGE agent-2 "need help"]',
    });
    expect(agentMessageStore.sendMessage).toHaveBeenCalledWith(
      "squad-1",
      "agent-1",
      "agent-2",
      "need help"
    );
    expect(wsHub.broadcastAgentMessageEvent).toHaveBeenCalled();
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("[SYSTEM] Message sent to");
  });

  it("injects error when target agent is in a different squad", () => {
    const squadManager = makeSquadManager("squad-1");
    vi.mocked(squadManager.getSquadIdForAgent)
      .mockReturnValueOnce("squad-1")  // sender
      .mockReturnValueOnce("squad-99"); // recipient — different squad
    const { interceptor, processManager, agentMessageStore } = setup({ squadManager });
    emitMessage(processManager, "agent-1", {
      type: "assistant",
      content: '[SEND_MESSAGE other-agent "hi"]',
    });
    expect(agentMessageStore.sendMessage).not.toHaveBeenCalled();
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("[ERROR]");
  });

  it("injects error when args are incomplete", () => {
    const { interceptor, processManager, agentMessageStore } = setup();
    emitMessage(processManager, "agent-1", { type: "assistant", content: "[SEND_MESSAGE]" });
    expect(agentMessageStore.sendMessage).not.toHaveBeenCalled();
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("[ERROR]");
  });
});

describe("CommandInterceptor — BROADCAST", () => {
  it("broadcasts message and injects confirmation", () => {
    const { interceptor, processManager, agentMessageStore, wsHub } = setup();
    emitMessage(processManager, "agent-1", {
      type: "assistant",
      content: '[BROADCAST "all hands"]',
    });
    expect(agentMessageStore.broadcastMessage).toHaveBeenCalledWith(
      "squad-1",
      "agent-1",
      "all hands"
    );
    expect(wsHub.broadcastAgentMessageEvent).toHaveBeenCalled();
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("Broadcast sent");
  });

  it("injects error when content is missing", () => {
    const { interceptor, processManager, agentMessageStore } = setup();
    emitMessage(processManager, "agent-1", { type: "assistant", content: "[BROADCAST]" });
    expect(agentMessageStore.broadcastMessage).not.toHaveBeenCalled();
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("[ERROR]");
  });
});

describe("CommandInterceptor — CHECK_MESSAGES", () => {
  it("injects 'no new messages' when inbox is empty", () => {
    const { interceptor, processManager } = setup();
    emitMessage(processManager, "agent-1", { type: "assistant", content: "[CHECK_MESSAGES]" });
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("No new messages");
  });

  it("formats messages with sender role name", () => {
    const agentMessageStore = makeAgentMessageStore();
    vi.mocked(agentMessageStore.getMessagesForAgent).mockReturnValue([
      makeAgentMessageRow({ from_agent_id: "agent-2", content: "hey", to_agent_id: "agent-1" }),
    ]);
    const db = makeDb("Backend Dev");
    const { interceptor, processManager } = setup({ agentMessageStore, db });
    emitMessage(processManager, "agent-1", { type: "assistant", content: "[CHECK_MESSAGES]" });
    const injected = vi.mocked(processManager.sendPrompt).mock.calls[0]?.[1] ?? "";
    expect(injected).toContain("Backend Dev");
    expect(injected).toContain("hey");
  });
});

describe("CommandInterceptor — injectResponse error swallowing", () => {
  it("does not throw when sendPrompt throws", () => {
    const processManager = makeProcessManager();
    vi.mocked(processManager.sendPrompt).mockImplementation(() => {
      throw new Error("process gone");
    });
    const { interceptor } = setup({ processManager });
    // Should not throw
    expect(() =>
      emitMessage(processManager, "agent-1", { type: "assistant", content: "[TASK_LIST]" })
    ).not.toThrow();
  });
});
