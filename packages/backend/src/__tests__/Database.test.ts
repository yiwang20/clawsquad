import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../services/Database.js";
import type { SquadRow, AgentRow } from "../services/Database.js";
import BetterSqlite3 from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

let _counter = 0;
function tempDbPath(): string {
  return path.join(os.tmpdir(), `clawsquad-test-${Date.now()}-${++_counter}.db`);
}

const squadRow = (): SquadRow => ({
  id: "squad-1",
  name: "Test Squad",
  mission: "Build something great",
  working_directory: "/tmp",
  created_at: new Date().toISOString(),
});

const agentRow = (overrides: Partial<AgentRow> = {}): AgentRow => ({
  id: "agent-1",
  squad_id: "squad-1",
  role_name: "Backend Dev",
  role_description: "Focus on APIs",
  model: "sonnet",
  permission_mode: "bypassPermissions",
  working_directory: "/tmp",
  system_prompt: "You are a Backend Dev.",
  session_id: null,
  status: "idle",
  created_at: new Date().toISOString(),
  last_active_at: null,
  max_budget_usd: null,
  ...overrides,
});

describe("Database", () => {
  let db: Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    db = new Database(dbPath);
    db.migrate();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  describe("squad operations", () => {
    it("inserts and retrieves a squad", () => {
      const row = squadRow();
      db.insertSquad(row);
      const retrieved = db.getSquad(row.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe(row.name);
      expect(retrieved!.mission).toBe(row.mission);
    });

    it("returns undefined for unknown squad", () => {
      expect(db.getSquad("nonexistent")).toBeUndefined();
    });

    it("lists squads ordered by created_at DESC", () => {
      db.insertSquad({ ...squadRow(), id: "s1", created_at: "2024-01-01T00:00:00Z" });
      db.insertSquad({ ...squadRow(), id: "s2", created_at: "2024-01-02T00:00:00Z" });
      const list = db.listSquads();
      expect(list[0]!.id).toBe("s2");
      expect(list[1]!.id).toBe("s1");
    });

    it("updates squad fields", () => {
      db.insertSquad(squadRow());
      db.updateSquad("squad-1", { name: "Renamed", mission: "New mission" });
      const updated = db.getSquad("squad-1");
      expect(updated!.name).toBe("Renamed");
      expect(updated!.mission).toBe("New mission");
    });

    it("deletes a squad and cascades to agents", () => {
      db.insertSquad(squadRow());
      db.insertAgent(agentRow());
      db.deleteSquad("squad-1");
      expect(db.getSquad("squad-1")).toBeUndefined();
      expect(db.getAgent("agent-1")).toBeUndefined();
    });
  });

  describe("agent operations", () => {
    beforeEach(() => {
      db.insertSquad(squadRow());
    });

    it("inserts and retrieves an agent", () => {
      const row = agentRow();
      db.insertAgent(row);
      const retrieved = db.getAgent(row.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.role_name).toBe("Backend Dev");
      expect(retrieved!.role_description).toBe("Focus on APIs");
    });

    it("lists agents by squad in created_at ASC order", () => {
      db.insertAgent(agentRow({ id: "a1", created_at: "2024-01-01T00:00:01Z" }));
      db.insertAgent(agentRow({ id: "a2", created_at: "2024-01-01T00:00:02Z" }));
      const list = db.listAgentsBySquad("squad-1");
      expect(list[0]!.id).toBe("a1");
      expect(list[1]!.id).toBe("a2");
    });

    it("updates agent status", () => {
      db.insertAgent(agentRow());
      const ts = new Date().toISOString();
      db.updateAgentStatus("agent-1", "running", ts);
      const updated = db.getAgent("agent-1");
      expect(updated!.status).toBe("running");
      expect(updated!.last_active_at).toBe(ts);
    });

    it("updates agent session ID", () => {
      db.insertAgent(agentRow());
      db.updateAgentSessionId("agent-1", "sess-abc");
      expect(db.getAgent("agent-1")!.session_id).toBe("sess-abc");
    });

    it("resets running agents to stopped on startup", () => {
      db.insertAgent(agentRow({ id: "a1", status: "running" }));
      db.insertAgent(agentRow({ id: "a2", status: "waiting" }));
      db.insertAgent(agentRow({ id: "a3", status: "idle" }));
      db.resetRunningAgents();
      expect(db.getAgent("a1")!.status).toBe("stopped");
      expect(db.getAgent("a2")!.status).toBe("stopped");
      expect(db.getAgent("a3")!.status).toBe("idle");
    });

    it("deletes an agent", () => {
      db.insertAgent(agentRow());
      db.deleteAgent("agent-1");
      expect(db.getAgent("agent-1")).toBeUndefined();
    });
  });

  describe("message operations", () => {
    beforeEach(() => {
      db.insertSquad(squadRow());
      db.insertAgent(agentRow());
    });

    const msgRow = (overrides = {}) => ({
      agent_id: "agent-1",
      role: "assistant" as const,
      type: "assistant",
      content: JSON.stringify({ type: "assistant", message: "hello" }),
      created_at: new Date().toISOString(),
      ...overrides,
    });

    it("inserts and lists messages", () => {
      db.insertMessage(msgRow());
      db.insertMessage(msgRow());
      const messages = db.listMessages("agent-1", 10, 0);
      expect(messages.length).toBe(2);
    });

    it("counts messages", () => {
      db.insertMessage(msgRow());
      db.insertMessage(msgRow());
      expect(db.countMessages("agent-1")).toBe(2);
    });

    it("paginates messages with limit and offset", () => {
      for (let i = 0; i < 5; i++) {
        db.insertMessage(msgRow({ created_at: `2024-01-01T00:00:0${i}Z` }));
      }
      const page1 = db.listMessages("agent-1", 2, 0);
      const page2 = db.listMessages("agent-1", 2, 2);
      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
    });

    it("cascades delete messages when agent is deleted", () => {
      db.insertMessage(msgRow());
      db.deleteAgent("agent-1");
      expect(db.countMessages("agent-1")).toBe(0);
    });
  });

  describe("migrate — column backfill", () => {
    it("adds max_budget_usd to agents table in an existing database that lacks it", () => {
      // Simulate an old database created before max_budget_usd was added:
      // create the agents table without that column, then run migrate().
      const oldDbPath = path.join(os.tmpdir(), `clawsquad-old-schema-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
      const raw = new BetterSqlite3(oldDbPath);
      raw.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE squads (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, mission TEXT NOT NULL,
          working_directory TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE agents (
          id TEXT PRIMARY KEY,
          squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
          role_name TEXT NOT NULL, role_description TEXT,
          model TEXT NOT NULL DEFAULT 'sonnet',
          permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions',
          working_directory TEXT NOT NULL, system_prompt TEXT NOT NULL DEFAULT '',
          session_id TEXT, status TEXT NOT NULL DEFAULT 'idle',
          created_at TEXT NOT NULL, last_active_at TEXT
          -- max_budget_usd intentionally absent
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          role TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      raw.close();

      const oldDb = new Database(oldDbPath);
      oldDb.migrate(); // should add max_budget_usd without throwing

      // Verify the column is now present by inserting a row that uses it
      oldDb.insertSquad(squadRow());
      expect(() => oldDb.insertAgent(agentRow({ max_budget_usd: 5.0 }))).not.toThrow();
      const retrieved = oldDb.getAgent("agent-1");
      expect(retrieved!.max_budget_usd).toBe(5.0);

      oldDb.close();
      fs.unlinkSync(oldDbPath);
    });
  });
});
