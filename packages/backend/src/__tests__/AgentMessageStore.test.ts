import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { Database } from "../services/Database.js";
import { AgentMessageStore, agentMessageRowToResponse } from "../services/AgentMessageStore.js";

function tempDbPath(): string {
  return path.join(os.tmpdir(), `clawsquad-agentmsg-test-${Date.now()}.db`);
}

function insertSquad(db: Database, id = "squad-1"): void {
  db.insertSquad({
    id,
    name: "Test Squad",
    mission: "Test",
    working_directory: "/tmp",
    created_at: new Date().toISOString(),
  });
}

function insertAgent(db: Database, id: string, squadId = "squad-1"): void {
  db.insertAgent({
    id,
    squad_id: squadId,
    role_name: `Agent ${id}`,
    role_description: null,
    model: "sonnet",
    permission_mode: "bypassPermissions",
    working_directory: "/tmp",
    system_prompt: "",
    session_id: null,
    status: "idle",
    created_at: new Date().toISOString(),
    last_active_at: null,
    max_budget_usd: null,
  });
}

describe("AgentMessageStore", () => {
  let db: Database;
  let store: AgentMessageStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    db = new Database(dbPath);
    db.migrate();
    insertSquad(db);
    insertAgent(db, "agent-1");
    insertAgent(db, "agent-2");
    insertAgent(db, "agent-3");
    store = new AgentMessageStore(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  describe("sendMessage", () => {
    it("creates a direct message with correct fields", () => {
      const row = store.sendMessage("squad-1", "agent-1", "agent-2", "hello");
      expect(row.id).toBeGreaterThan(0);
      expect(row.squad_id).toBe("squad-1");
      expect(row.from_agent_id).toBe("agent-1");
      expect(row.to_agent_id).toBe("agent-2");
      expect(row.content).toBe("hello");
      expect(row.created_at).toBeTruthy();
    });
  });

  describe("broadcastMessage", () => {
    it("creates a broadcast message with to_agent_id = null", () => {
      const row = store.broadcastMessage("squad-1", "agent-1", "attention all");
      expect(row.to_agent_id).toBeNull();
      expect(row.content).toBe("attention all");
    });
  });

  describe("getMessagesForAgent", () => {
    it("returns direct messages addressed to the agent", () => {
      store.sendMessage("squad-1", "agent-1", "agent-2", "direct to 2");
      const msgs = store.getMessagesForAgent("agent-2");
      expect(msgs.length).toBe(1);
      expect(msgs[0]!.content).toBe("direct to 2");
    });

    it("returns broadcast messages for the agent", () => {
      store.broadcastMessage("squad-1", "agent-1", "broadcast");
      const msgs = store.getMessagesForAgent("agent-2");
      expect(msgs.length).toBe(1);
      expect(msgs[0]!.content).toBe("broadcast");
    });

    it("includes both direct and broadcast messages", () => {
      store.sendMessage("squad-1", "agent-1", "agent-2", "direct");
      store.broadcastMessage("squad-1", "agent-1", "broadcast");
      const msgs = store.getMessagesForAgent("agent-2");
      expect(msgs.length).toBe(2);
    });

    it("does not return messages sent to a different agent", () => {
      store.sendMessage("squad-1", "agent-1", "agent-3", "only for 3");
      const msgs = store.getMessagesForAgent("agent-2");
      expect(msgs.length).toBe(0);
    });

    it("filters by since timestamp", () => {
      // Insert "old" message with an explicit past timestamp via the DB directly
      const past = new Date(Date.now() - 2000).toISOString();
      db.insertAgentMessage({
        squad_id: "squad-1",
        from_agent_id: "agent-1",
        to_agent_id: "agent-2",
        content: "old",
        created_at: past,
      });
      const since = new Date(Date.now() - 1000).toISOString();
      store.sendMessage("squad-1", "agent-1", "agent-2", "new");
      const msgs = store.getMessagesForAgent("agent-2", since);
      expect(msgs.length).toBe(1);
      expect(msgs[0]!.content).toBe("new");
    });

    it("returns messages ordered by created_at ASC", () => {
      store.sendMessage("squad-1", "agent-1", "agent-2", "first");
      store.sendMessage("squad-1", "agent-1", "agent-2", "second");
      const msgs = store.getMessagesForAgent("agent-2");
      expect(msgs[0]!.content).toBe("first");
      expect(msgs[1]!.content).toBe("second");
    });
  });

  describe("getSquadMessages", () => {
    it("returns all messages for a squad", () => {
      store.sendMessage("squad-1", "agent-1", "agent-2", "msg1");
      store.broadcastMessage("squad-1", "agent-2", "msg2");
      const msgs = store.getSquadMessages("squad-1");
      expect(msgs.length).toBe(2);
    });

    it("respects the limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        store.broadcastMessage("squad-1", "agent-1", `msg${i}`);
      }
      const msgs = store.getSquadMessages("squad-1", 3);
      expect(msgs.length).toBe(3);
    });

    it("returns empty array when no messages", () => {
      expect(store.getSquadMessages("squad-1")).toEqual([]);
    });
  });

  describe("agentMessageRowToResponse", () => {
    it("converts snake_case row to camelCase response", () => {
      const row = store.sendMessage("squad-1", "agent-1", "agent-2", "hi");
      const resp = agentMessageRowToResponse(row);
      expect(resp.id).toBe(row.id);
      expect(resp.squadId).toBe("squad-1");
      expect(resp.fromAgentId).toBe("agent-1");
      expect(resp.toAgentId).toBe("agent-2");
      expect(resp.content).toBe("hi");
      expect(resp.createdAt).toBe(row.created_at);
    });

    it("maps null toAgentId for broadcasts", () => {
      const row = store.broadcastMessage("squad-1", "agent-1", "all");
      const resp = agentMessageRowToResponse(row);
      expect(resp.toAgentId).toBeNull();
    });
  });
});
