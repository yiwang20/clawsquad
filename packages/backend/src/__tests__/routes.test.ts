import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { createSquadsRouter } from "../routes/squads.js";
import { createAgentsRouter } from "../routes/agents.js";
import type { SquadManager } from "../services/types.js";
import type { ProcessManager, MessageStore } from "../services/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {
    _status: 200,
    _body: undefined as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
    send() {
      return this;
    },
  };
  return res;
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

/** Call the first matching route handler synchronously. */
function getHandler(router: ReturnType<typeof createSquadsRouter>, method: string, path: string) {
  const layer = (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: (req: Request, res: Response, next: () => void) => void }[] } }[] }).stack.find(
    (l) => l.route?.path === path && l.route?.methods[method]
  );
  if (!layer?.route) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack[0]!.handle;
}

// ─── Squads router ────────────────────────────────────────────────────────────

function makeSquadManager(): SquadManager {
  return {
    createSquad: vi.fn(),
    getSquad: vi.fn().mockReturnValue(null),
    listSquads: vi.fn().mockReturnValue([]),
    updateSquad: vi.fn(),
    deleteSquad: vi.fn().mockResolvedValue(undefined),
    startSquad: vi.fn().mockResolvedValue(undefined),
    stopSquad: vi.fn().mockResolvedValue(undefined),
    addAgent: vi.fn(),
    removeAgent: vi.fn().mockResolvedValue(undefined),
    getSquadIdForAgent: vi.fn(),
    deriveSquadStatus: vi.fn(),
  } as unknown as SquadManager;
}

describe("POST /api/squads — validation", () => {
  let squadManager: SquadManager;
  let router: ReturnType<typeof createSquadsRouter>;

  beforeEach(() => {
    squadManager = makeSquadManager();
    router = createSquadsRouter(squadManager);
  });

  function postSquads(body: unknown) {
    const req = mockReq({ body });
    const res = mockRes();
    getHandler(router, "post", "/")(req as Request, res as unknown as Response, () => {});
    return res;
  }

  it("returns 400 when name is missing", () => {
    const res = postSquads({ mission: "do stuff", agents: [{ roleName: "Dev" }] });
    expect(res._status).toBe(400);
  });

  it("returns 400 when name is whitespace-only", () => {
    const res = postSquads({ name: "   ", mission: "do stuff", agents: [{ roleName: "Dev" }] });
    expect(res._status).toBe(400);
  });

  it("returns 400 when name exceeds 60 characters", () => {
    const res = postSquads({
      name: "x".repeat(61),
      mission: "do stuff",
      agents: [{ roleName: "Dev" }],
    });
    expect(res._status).toBe(400);
  });

  it("returns 400 when mission is missing", () => {
    const res = postSquads({ name: "Squad", agents: [{ roleName: "Dev" }] });
    expect(res._status).toBe(400);
  });

  it("returns 400 when agents is an empty array", () => {
    const res = postSquads({ name: "Squad", mission: "do stuff", agents: [] });
    expect(res._status).toBe(400);
  });

  it("returns 400 when an agent roleName exceeds 60 characters", () => {
    const res = postSquads({
      name: "Squad",
      mission: "do stuff",
      agents: [{ roleName: "r".repeat(61) }],
    });
    expect(res._status).toBe(400);
  });

  it("passes valid request through to squadManager.createSquad", () => {
    vi.mocked(squadManager.createSquad).mockReturnValue({
      id: "s1",
      name: "Squad",
      mission: "do stuff",
      workingDirectory: "/tmp",
      status: "ready",
      agents: [],
      createdAt: new Date().toISOString(),
    });
    const res = postSquads({ name: "Squad", mission: "do stuff", agents: [{ roleName: "Dev" }] });
    expect(squadManager.createSquad).toHaveBeenCalledOnce();
    expect(res._status).toBe(201);
  });
});

// ─── Agents router ────────────────────────────────────────────────────────────

function makeProcessManager(): ProcessManager {
  return {
    spawn: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
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

function makeMessageStore(agentExists = true): MessageStore {
  return {
    getAgent: vi.fn().mockReturnValue(
      agentExists
        ? { id: "agent-1", status: "idle", roleName: "Dev", squadId: "s1" }
        : null
    ),
    getMessages: vi.fn().mockReturnValue({ messages: [], total: 0, page: 1, pageSize: 50 }),
  } as unknown as MessageStore;
}

describe("GET /api/agents/:id/messages — validation", () => {
  let router: ReturnType<typeof createAgentsRouter>;

  beforeEach(() => {
    router = createAgentsRouter(makeProcessManager(), makeMessageStore());
  });

  function getMessages(query: Record<string, string>) {
    const req = mockReq({ params: { id: "agent-1" }, query });
    const res = mockRes();
    getHandler(router as unknown as ReturnType<typeof createSquadsRouter>, "get", "/:id/messages")(
      req as Request,
      res as unknown as Response,
      () => {}
    );
    return res;
  }

  it("returns 400 when pageSize=0", () => {
    const res = getMessages({ pageSize: "0" });
    expect(res._status).toBe(400);
  });

  it("returns 400 when page=abc", () => {
    const res = getMessages({ page: "abc" });
    expect(res._status).toBe(400);
  });
});

describe("POST /api/agents/:id/prompt — validation", () => {
  let processManager: ProcessManager;
  let router: ReturnType<typeof createAgentsRouter>;

  function postPrompt(body: unknown, agentExists = true, isRunning = false) {
    processManager = makeProcessManager();
    if (isRunning) {
      vi.mocked(processManager.hasProcess).mockReturnValue(true);
      vi.mocked(processManager.getStatus).mockReturnValue("running");
    } else if (!agentExists) {
      // sendPrompt throws the "No running process" error to trigger 409
      vi.mocked(processManager.sendPrompt).mockImplementation(() => {
        throw new Error("No running process for agent agent-1");
      });
    }
    router = createAgentsRouter(processManager, makeMessageStore(agentExists));
    const req = mockReq({ params: { id: "agent-1" }, body });
    const res = mockRes();
    getHandler(
      router as unknown as ReturnType<typeof createSquadsRouter>,
      "post",
      "/:id/prompt"
    )(req as Request, res as unknown as Response, () => {});
    return res;
  }

  it("returns 400 when prompt is empty string", () => {
    const res = postPrompt({ prompt: "" });
    expect(res._status).toBe(400);
  });

  it("returns 404 when agent does not exist", () => {
    const res = postPrompt({ prompt: "hello" }, false);
    expect(res._status).toBe(404);
  });

  it("returns 409 when processManager throws no-running-process error", () => {
    processManager = makeProcessManager();
    vi.mocked(processManager.sendPrompt).mockImplementation(() => {
      throw new Error("No running process for agent agent-1");
    });
    router = createAgentsRouter(processManager, makeMessageStore(true));
    const req = mockReq({ params: { id: "agent-1" }, body: { prompt: "hello" } });
    const res = mockRes();
    getHandler(
      router as unknown as ReturnType<typeof createSquadsRouter>,
      "post",
      "/:id/prompt"
    )(req as Request, res as unknown as Response, () => {});
    expect(res._status).toBe(409);
  });
});
