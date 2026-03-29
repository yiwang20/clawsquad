import { Router, type Request, type Response } from "express";
import type { CreateTaskRequest, UpdateTaskRequest } from "@clawsquad/shared";
import type { TaskStore } from "../services/TaskStore.js";
import { taskRowToResponse } from "../services/TaskStore.js";
import type { WebSocketHub } from "../ws/WebSocketHub.js";

export function createTasksRouter(
  taskStore: TaskStore,
  wsHub: WebSocketHub
): Router {
  const router = Router({ mergeParams: true });

  // GET /api/squads/:squadId/tasks
  router.get("/", (req: Request, res: Response) => {
    try {
      const tasks = taskStore.listTasks(req.params["squadId"] as string);
      res.json(tasks.map(taskRowToResponse));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // POST /api/squads/:squadId/tasks
  router.post("/", (req: Request, res: Response) => {
    const body = req.body as CreateTaskRequest;
    const squadId = req.params["squadId"] as string;

    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    try {
      const row = taskStore.createTask(
        squadId,
        body.title.trim(),
        body.description?.trim() ?? "",
        null // created from UI, not by an agent
      );
      const task = taskRowToResponse(row);
      wsHub.broadcastTaskEvent(squadId, "task:created", task);
      res.status(201).json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // PATCH /api/squads/:squadId/tasks/:taskId
  router.patch("/:taskId", (req: Request, res: Response) => {
    const squadId = req.params["squadId"] as string;
    const taskId = req.params["taskId"] as string;
    const body = req.body as UpdateTaskRequest;

    if (
      body.status !== undefined &&
      !["pending", "in_progress", "completed"].includes(body.status)
    ) {
      res.status(400).json({ error: "status must be pending, in_progress, or completed" });
      return;
    }

    try {
      const fields: Parameters<TaskStore["updateTask"]>[1] = {};
      if (body.title !== undefined) fields.title = body.title;
      if (body.description !== undefined) fields.description = body.description;
      if (body.status !== undefined) fields.status = body.status;
      if ("assigneeId" in body) fields.assigneeId = body.assigneeId ?? null;
      if (body.dependsOn !== undefined) fields.dependsOn = body.dependsOn;
      const row = taskStore.updateTask(taskId, fields);
      if (!row) {
        res.status(404).json({ error: "Task not found" });
        return;
      }
      const task = taskRowToResponse(row);
      wsHub.broadcastTaskEvent(squadId, "task:updated", task);
      res.json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/squads/:squadId/tasks/:taskId
  router.delete("/:taskId", (req: Request, res: Response) => {
    const squadId = req.params["squadId"] as string;
    const taskId = req.params["taskId"] as string;

    try {
      const deleted = taskStore.deleteTask(taskId);
      if (!deleted) {
        res.status(404).json({ error: "Task not found" });
        return;
      }
      wsHub.broadcastTaskEvent(squadId, "task:deleted", null, taskId);
      res.status(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
