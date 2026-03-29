import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { Database } from "../services/Database.js";
import { TaskStore, taskRowToResponse } from "../services/TaskStore.js";

function tempDbPath(): string {
  return path.join(os.tmpdir(), `clawsquad-taskstore-test-${Date.now()}.db`);
}

/** Insert a minimal squad so FK constraints are satisfied. */
function insertSquad(db: Database, id = "squad-1"): void {
  db.insertSquad({
    id,
    name: "Test Squad",
    mission: "Test",
    working_directory: "/tmp",
    created_at: new Date().toISOString(),
  });
}

/** Insert a minimal agent row. */
function insertAgent(db: Database, id: string, squadId = "squad-1"): void {
  db.insertAgent({
    id,
    squad_id: squadId,
    role_name: "Dev",
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

describe("TaskStore", () => {
  let db: Database;
  let store: TaskStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    db = new Database(dbPath);
    db.migrate();
    insertSquad(db);
    store = new TaskStore(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  describe("createTask", () => {
    it("creates a task with correct defaults", () => {
      const row = store.createTask("squad-1", "My Task", "desc", null);
      expect(row.id).toBeTruthy();
      expect(row.squad_id).toBe("squad-1");
      expect(row.title).toBe("My Task");
      expect(row.description).toBe("desc");
      expect(row.status).toBe("pending");
      expect(row.assignee_id).toBeNull();
      expect(row.created_by).toBeNull();
      expect(row.depends_on).toBe("[]");
      expect(row.created_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
    });

    it("stores createdBy when provided", () => {
      insertAgent(db, "agent-1");
      const row = store.createTask("squad-1", "Task", "", "agent-1");
      expect(row.created_by).toBe("agent-1");
    });
  });

  describe("listTasks", () => {
    it("returns empty array when no tasks", () => {
      expect(store.listTasks("squad-1")).toEqual([]);
    });

    it("returns all tasks for a squad ordered by created_at", () => {
      store.createTask("squad-1", "A", "", null);
      store.createTask("squad-1", "B", "", null);
      const tasks = store.listTasks("squad-1");
      expect(tasks.length).toBe(2);
    });
  });

  describe("getTask", () => {
    it("returns undefined for unknown task", () => {
      expect(store.getTask("nonexistent")).toBeUndefined();
    });

    it("returns the task by ID", () => {
      const created = store.createTask("squad-1", "T", "", null);
      const found = store.getTask(created.id);
      expect(found?.id).toBe(created.id);
    });
  });

  describe("claimTask", () => {
    it("claims a pending task and sets assignee + status", () => {
      insertAgent(db, "agent-1");
      const created = store.createTask("squad-1", "T", "", null);
      const result = store.claimTask(created.id, "agent-1");
      expect(result).toBeDefined();
      expect(result!.status).toBe("in_progress");
      expect(result!.assignee_id).toBe("agent-1");
    });

    it("returns undefined for a non-pending task", () => {
      insertAgent(db, "agent-1");
      insertAgent(db, "agent-2");
      const created = store.createTask("squad-1", "T", "", null);
      store.claimTask(created.id, "agent-1"); // now in_progress
      const second = store.claimTask(created.id, "agent-2");
      expect(second).toBeUndefined();
    });

    it("returns undefined for non-existent task", () => {
      expect(store.claimTask("no-such-task", "agent-1")).toBeUndefined();
    });
  });

  describe("completeTask", () => {
    it("marks a task as completed", () => {
      const created = store.createTask("squad-1", "T", "", null);
      const result = store.completeTask(created.id);
      expect(result?.status).toBe("completed");
    });

    it("returns undefined for non-existent task", () => {
      expect(store.completeTask("no-such-task")).toBeUndefined();
    });
  });

  describe("updateTaskStatus", () => {
    it("updates status to a valid value", () => {
      const created = store.createTask("squad-1", "T", "", null);
      const result = store.updateTaskStatus(created.id, "in_progress");
      expect(result?.status).toBe("in_progress");
    });

    it("returns undefined for invalid status", () => {
      const created = store.createTask("squad-1", "T", "", null);
      expect(store.updateTaskStatus(created.id, "bogus")).toBeUndefined();
    });

    it("returns undefined for non-existent task", () => {
      expect(store.updateTaskStatus("no-such-task", "completed")).toBeUndefined();
    });
  });

  describe("updateTask", () => {
    it("updates title and description", () => {
      const created = store.createTask("squad-1", "Old", "old desc", null);
      const result = store.updateTask(created.id, { title: "New", description: "new desc" });
      expect(result?.title).toBe("New");
      expect(result?.description).toBe("new desc");
    });

    it("updates assigneeId to null", () => {
      insertAgent(db, "agent-1");
      const created = store.createTask("squad-1", "T", "", null);
      store.claimTask(created.id, "agent-1");
      const result = store.updateTask(created.id, { assigneeId: null });
      expect(result?.assignee_id).toBeNull();
    });

    it("updates dependsOn", () => {
      const t1 = store.createTask("squad-1", "T1", "", null);
      const t2 = store.createTask("squad-1", "T2", "", null);
      const result = store.updateTask(t2.id, { dependsOn: [t1.id] });
      expect(JSON.parse(result!.depends_on)).toEqual([t1.id]);
    });

    it("returns undefined for non-existent task", () => {
      expect(store.updateTask("no-such-task", { title: "X" })).toBeUndefined();
    });
  });

  describe("deleteTask", () => {
    it("deletes an existing task and returns true", () => {
      const created = store.createTask("squad-1", "T", "", null);
      expect(store.deleteTask(created.id)).toBe(true);
      expect(store.getTask(created.id)).toBeUndefined();
    });

    it("returns false for non-existent task", () => {
      expect(store.deleteTask("no-such-task")).toBe(false);
    });
  });

  describe("taskRowToResponse", () => {
    it("converts snake_case row to camelCase response", () => {
      const row = store.createTask("squad-1", "Title", "Desc", null);
      const resp = taskRowToResponse(row);
      expect(resp.squadId).toBe(row.squad_id);
      expect(resp.title).toBe(row.title);
      expect(resp.assigneeId).toBeNull();
      expect(resp.createdBy).toBeNull();
      expect(Array.isArray(resp.dependsOn)).toBe(true);
      expect(resp.dependsOn).toEqual([]);
      expect(resp.createdAt).toBe(row.created_at);
      expect(resp.updatedAt).toBe(row.updated_at);
    });

    it("parses dependsOn JSON array correctly", () => {
      const t1 = store.createTask("squad-1", "T1", "", null);
      const t2 = store.createTask("squad-1", "T2", "", null);
      const updated = store.updateTask(t2.id, { dependsOn: [t1.id] })!;
      const resp = taskRowToResponse(updated);
      expect(resp.dependsOn).toEqual([t1.id]);
    });
  });
});
