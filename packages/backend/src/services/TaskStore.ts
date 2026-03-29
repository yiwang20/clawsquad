import { v4 as uuidv4 } from "uuid";
import type { Database, TaskRow } from "./Database.js";

export type { TaskRow };

export class TaskStore {
  constructor(private readonly db: Database) {}

  createTask(
    squadId: string,
    title: string,
    description: string,
    createdBy: string | null
  ): TaskRow {
    const now = new Date().toISOString();
    const row: TaskRow = {
      id: uuidv4(),
      squad_id: squadId,
      title,
      description,
      status: "pending",
      assignee_id: null,
      created_by: createdBy,
      depends_on: "[]",
      created_at: now,
      updated_at: now,
    };
    this.db.insertTask(row);
    return row;
  }

  listTasks(squadId: string): TaskRow[] {
    return this.db.listTasksBySquad(squadId);
  }

  getTask(taskId: string): TaskRow | undefined {
    return this.db.getTask(taskId);
  }

  /**
   * Claim a task for the given agent — sets status to `in_progress` and assignee_id.
   * Returns undefined if the task does not exist or is not in `pending` state.
   */
  claimTask(taskId: string, agentId: string): TaskRow | undefined {
    const existing = this.db.getTask(taskId);
    if (!existing || existing.status !== "pending") return undefined;
    const now = new Date().toISOString();
    this.db.updateTask(taskId, { status: "in_progress", assignee_id: agentId }, now);
    return this.db.getTask(taskId);
  }

  completeTask(taskId: string): TaskRow | undefined {
    const existing = this.db.getTask(taskId);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    this.db.updateTask(taskId, { status: "completed" }, now);
    return this.db.getTask(taskId);
  }

  updateTaskStatus(taskId: string, status: string): TaskRow | undefined {
    const existing = this.db.getTask(taskId);
    if (!existing) return undefined;
    const validStatuses = ["pending", "in_progress", "completed"];
    if (!validStatuses.includes(status)) return undefined;
    const now = new Date().toISOString();
    this.db.updateTask(taskId, { status: status as TaskRow["status"] }, now);
    return this.db.getTask(taskId);
  }

  updateTask(
    taskId: string,
    fields: {
      title?: string;
      description?: string;
      status?: TaskRow["status"];
      assigneeId?: string | null;
      dependsOn?: string[];
    }
  ): TaskRow | undefined {
    const existing = this.db.getTask(taskId);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const dbFields: Parameters<Database["updateTask"]>[1] = {};
    if (fields.title !== undefined) dbFields.title = fields.title;
    if (fields.description !== undefined) dbFields.description = fields.description;
    if (fields.status !== undefined) dbFields.status = fields.status;
    if ("assigneeId" in fields) dbFields.assignee_id = fields.assigneeId ?? null;
    if (fields.dependsOn !== undefined) dbFields.depends_on = JSON.stringify(fields.dependsOn);
    this.db.updateTask(taskId, dbFields, now);
    return this.db.getTask(taskId);
  }

  deleteTask(taskId: string): boolean {
    const existing = this.db.getTask(taskId);
    if (!existing) return false;
    this.db.deleteTask(taskId);
    return true;
  }
}

/** Convert a TaskRow to the camelCase TaskResponse shape. */
export function taskRowToResponse(row: TaskRow) {
  return {
    id: row.id,
    squadId: row.squad_id,
    title: row.title,
    description: row.description,
    status: row.status,
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
    dependsOn: JSON.parse(row.depends_on) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
