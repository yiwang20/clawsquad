import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Database } from "../services/Database.js";
import { SquadManager } from "../services/SquadManager.js";
import type { ProcessManager } from "../services/ProcessManager.js";
import type { CreateSquadRequest } from "@clawsquad/shared";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function tempDbPath(): string {
  return path.join(os.tmpdir(), `clawsquad-test-${Date.now()}.db`);
}

/** Minimal ProcessManager stub — no processes are ever "running" in these tests. */
function makeProcessManager(): ProcessManager {
  return {
    spawn: vi.fn(),
    start: vi.fn(),
    stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stopAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
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

const createRequest = (overrides: Partial<CreateSquadRequest> = {}): CreateSquadRequest => ({
  name: "Alpha Squad",
  mission: "Build the next web app",
  agents: [
    { roleName: "Backend Dev", roleDescription: "APIs and DB" },
    { roleName: "Frontend Dev" },
  ],
  ...overrides,
});

describe("SquadManager", () => {
  let db: Database;
  let processManager: ProcessManager;
  let manager: SquadManager;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    db = new Database(dbPath);
    db.migrate();
    processManager = makeProcessManager();
    manager = new SquadManager(db, processManager);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  describe("createSquad", () => {
    it("creates a squad with agents and returns Squad", () => {
      const squad = manager.createSquad(createRequest());
      expect(squad.id).toBeTruthy();
      expect(squad.name).toBe("Alpha Squad");
      expect(squad.mission).toBe("Build the next web app");
      expect(squad.status).toBe("ready");
      expect(squad.agents.length).toBe(2);
    });

    it("auto-generates system prompts from mission + role", () => {
      const squad = manager.createSquad(createRequest());
      const beAgent = squad.agents.find((a) => a.roleName === "Backend Dev")!;
      expect(beAgent.systemPrompt).toContain("Backend Dev");
      expect(beAgent.systemPrompt).toContain("Build the next web app");
      expect(beAgent.systemPrompt).toContain("APIs and DB");
    });

    it("uses custom system prompt when provided", () => {
      const req = createRequest({
        agents: [
          { roleName: "Dev", systemPrompt: "Custom prompt" },
        ],
      });
      const squad = manager.createSquad(req);
      expect(squad.agents[0]!.systemPrompt).toBe("Custom prompt");
    });

    it("defaults model to sonnet and permissionMode to bypassPermissions", () => {
      const squad = manager.createSquad(createRequest());
      for (const agent of squad.agents) {
        expect(agent.model).toBe("sonnet");
        expect(agent.permissionMode).toBe("bypassPermissions");
      }
    });

    it("throws if no agents provided", () => {
      expect(() => manager.createSquad(createRequest({ agents: [] }))).toThrow();
    });

    it("throws if more than 10 agents", () => {
      const agents = Array.from({ length: 11 }, (_, i) => ({
        roleName: `Dev ${i}`,
      }));
      expect(() => manager.createSquad(createRequest({ agents }))).toThrow();
    });
  });

  describe("getSquad", () => {
    it("returns null for unknown squad", () => {
      expect(manager.getSquad("nonexistent")).toBeNull();
    });

    it("returns squad with agents", () => {
      const created = manager.createSquad(createRequest());
      const retrieved = manager.getSquad(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.agents.length).toBe(2);
    });
  });

  describe("listSquads", () => {
    it("returns empty array when no squads", () => {
      expect(manager.listSquads()).toEqual([]);
    });

    it("lists all created squads", () => {
      manager.createSquad(createRequest({ name: "Squad A" }));
      manager.createSquad(createRequest({ name: "Squad B" }));
      const list = manager.listSquads();
      expect(list.length).toBe(2);
    });
  });

  describe("updateSquad", () => {
    it("returns null for unknown squad", () => {
      expect(manager.updateSquad("nonexistent", { name: "X" })).toBeNull();
    });

    it("updates squad name and mission", () => {
      const squad = manager.createSquad(createRequest());
      const updated = manager.updateSquad(squad.id, {
        name: "Renamed",
        mission: "New mission",
      });
      expect(updated!.name).toBe("Renamed");
      expect(updated!.mission).toBe("New mission");
    });

    it("rejects whitespace-only name", () => {
      const squad = manager.createSquad(createRequest());
      expect(() => manager.updateSquad(squad.id, { name: "   " })).toThrow(
        "Squad name cannot be empty"
      );
    });
  });

  describe("deleteSquad", () => {
    it("deletes the squad", async () => {
      const squad = manager.createSquad(createRequest());
      await manager.deleteSquad(squad.id);
      expect(manager.getSquad(squad.id)).toBeNull();
    });
  });

  describe("addAgent", () => {
    it("adds an agent to an existing squad", () => {
      const squad = manager.createSquad(createRequest());
      const agent = manager.addAgent(squad.id, { roleName: "Tester" });
      expect(agent.roleName).toBe("Tester");
      expect(agent.squadId).toBe(squad.id);
    });

    it("throws for unknown squad", () => {
      expect(() => manager.addAgent("nonexistent", { roleName: "Dev" })).toThrow();
    });

    it("rejects whitespace-only roleName", () => {
      const squad = manager.createSquad(createRequest());
      expect(() => manager.addAgent(squad.id, { roleName: "   " })).toThrow(
        "Agent role name cannot be empty"
      );
    });
  });

  describe("removeAgent", () => {
    it("removes an agent from a squad", async () => {
      const squad = manager.createSquad(createRequest());
      const agentId = squad.agents[0]!.id;
      await manager.removeAgent(squad.id, agentId);
      const updated = manager.getSquad(squad.id);
      expect(updated!.agents.find((a) => a.id === agentId)).toBeUndefined();
    });
  });

  describe("getSquadIdForAgent", () => {
    it("returns the squad ID for a known agent", () => {
      const squad = manager.createSquad(createRequest());
      const agentId = squad.agents[0]!.id;
      expect(manager.getSquadIdForAgent(agentId)).toBe(squad.id);
    });

    it("returns null for unknown agent", () => {
      expect(manager.getSquadIdForAgent("nonexistent")).toBeNull();
    });
  });

  describe("deriveSquadStatus", () => {
    it("returns ready when all agents are idle", () => {
      const squad = manager.createSquad(createRequest());
      expect(manager.deriveSquadStatus(squad.id)).toBe("ready");
    });

    it("returns error if any agent is in error state", () => {
      const squad = manager.createSquad(createRequest());
      db.updateAgentStatus(squad.agents[0]!.id, "error");
      expect(manager.deriveSquadStatus(squad.id)).toBe("error");
    });

    it("returns active if any agent is waiting", () => {
      const squad = manager.createSquad(createRequest());
      db.updateAgentStatus(squad.agents[0]!.id, "waiting");
      expect(manager.deriveSquadStatus(squad.id)).toBe("active");
    });

    it("returns stopped if all agents are stopped", () => {
      const squad = manager.createSquad(createRequest());
      for (const agent of squad.agents) {
        db.updateAgentStatus(agent.id, "stopped");
      }
      expect(manager.deriveSquadStatus(squad.id)).toBe("stopped");
    });
  });

  describe("startSquad", () => {
    it("calls processManager.spawn for each idle agent", async () => {
      const squad = manager.createSquad(createRequest());
      await manager.startSquad(squad.id);
      expect(processManager.spawn).toHaveBeenCalledTimes(squad.agents.length);
    });

    it("passes initialPrompt derived from mission + roleDescription to spawn", async () => {
      const squad = manager.createSquad(createRequest());
      await manager.startSquad(squad.id);

      // Backend Dev has roleDescription "APIs and DB"
      const beAgent = squad.agents.find((a) => a.roleName === "Backend Dev")!;
      expect(processManager.spawn).toHaveBeenCalledWith(
        beAgent.id,
        expect.anything(),
        "Build the next web app\n\nYour focus: APIs and DB"
      );

      // Frontend Dev has no roleDescription — prompt is just the mission
      const feAgent = squad.agents.find((a) => a.roleName === "Frontend Dev")!;
      expect(processManager.spawn).toHaveBeenCalledWith(
        feAgent.id,
        expect.anything(),
        "Build the next web app"
      );
    });

    it("skips agents that already have a running process", async () => {
      const squad = manager.createSquad(createRequest());
      // Make hasProcess return true for all agents → spawn should never be called
      vi.mocked(processManager.hasProcess).mockReturnValue(true);
      await manager.startSquad(squad.id);
      expect(processManager.spawn).not.toHaveBeenCalled();
    });

    it("throws for unknown squad", async () => {
      await expect(manager.startSquad("nonexistent")).rejects.toThrow();
    });

    it("throws for empty squad", async () => {
      // Can't have empty squad via createSquad, so test via direct DB manipulation
      const squad = manager.createSquad(createRequest({ agents: [{ roleName: "Dev" }] }));
      db.deleteAgent(squad.agents[0]!.id);
      await expect(manager.startSquad(squad.id)).rejects.toThrow();
    });
  });

  describe("stopSquad", () => {
    it("does not throw if no agents are running", async () => {
      const squad = manager.createSquad(createRequest());
      await expect(manager.stopSquad(squad.id)).resolves.toBeUndefined();
    });
  });
});
