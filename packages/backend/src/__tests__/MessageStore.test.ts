import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../services/Database.js";
import { MessageStore } from "../services/MessageStore.js";
import type { SquadRow, AgentRow } from "../services/Database.js";
import type { StreamMessage } from "@clawsquad/shared";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

let _counter = 0;
function tempDbPath(): string {
  return path.join(os.tmpdir(), `clawsquad-test-${Date.now()}-${++_counter}.db`);
}

describe("MessageStore", () => {
  let db: Database;
  let store: MessageStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    db = new Database(dbPath);
    db.migrate();

    const squadRow: SquadRow = {
      id: "squad-1",
      name: "Test Squad",
      mission: "Test mission",
      working_directory: "/tmp",
      created_at: new Date().toISOString(),
    };
    db.insertSquad(squadRow);

    const agentRow: AgentRow = {
      id: "agent-1",
      squad_id: "squad-1",
      role_name: "Dev",
      role_description: null,
      model: "sonnet",
      permission_mode: "bypassPermissions",
      working_directory: "/tmp",
      system_prompt: "You are a Dev.",
      session_id: null,
      status: "idle",
      created_at: new Date().toISOString(),
      last_active_at: null,
      max_budget_usd: null,
    };
    db.insertAgent(agentRow);

    store = new MessageStore(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  describe("getAgent", () => {
    it("returns agent for known ID", () => {
      const agent = store.getAgent("agent-1");
      expect(agent).not.toBeNull();
      expect(agent!.id).toBe("agent-1");
      expect(agent!.roleName).toBe("Dev");
      expect(agent!.roleDescription).toBeNull();
    });

    it("returns null for unknown ID", () => {
      expect(store.getAgent("nonexistent")).toBeNull();
    });
  });

  describe("saveMessage", () => {
    it("persists a message and retrieves it", () => {
      const content: StreamMessage = {
        type: "assistant",
        message: { role: "assistant", content: "Hello" },
      };
      store.saveMessage("agent-1", "assistant", "assistant", content);

      const result = store.getMessages("agent-1", { page: 1, pageSize: 10 });
      expect(result.messages.length).toBe(1);
      expect(result.messages[0]!.type).toBe("assistant");
      expect(result.messages[0]!.role).toBe("assistant");
      expect(JSON.parse(result.messages[0]!.content)).toMatchObject(content);
    });
  });

  describe("getMessages", () => {
    beforeEach(() => {
      for (let i = 0; i < 5; i++) {
        store.saveMessage("agent-1", "assistant", "assistant", {
          type: "assistant",
          index: i,
        });
      }
    });

    it("returns correct total", () => {
      const result = store.getMessages("agent-1", { page: 1, pageSize: 10 });
      expect(result.total).toBe(5);
    });

    it("paginates results", () => {
      const page1 = store.getMessages("agent-1", { page: 1, pageSize: 2 });
      const page2 = store.getMessages("agent-1", { page: 2, pageSize: 2 });
      expect(page1.messages.length).toBe(2);
      expect(page2.messages.length).toBe(2);
      expect(page1.messages[0]!.id).not.toBe(page2.messages[0]!.id);
    });

    it("returns empty for last page beyond data", () => {
      const result = store.getMessages("agent-1", { page: 10, pageSize: 10 });
      expect(result.messages.length).toBe(0);
      expect(result.total).toBe(5);
    });
  });
});
