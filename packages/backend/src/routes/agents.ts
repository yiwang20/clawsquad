import { Router, type Request, type Response } from "express";
import type { SendPromptRequest } from "@clawsquad/shared";
import type { ProcessManager, MessageStore } from "../services/types.js";

export function createAgentsRouter(
  processManager: ProcessManager,
  messageStore: MessageStore
): Router {
  const router = Router();

  // POST /api/agents/:id/start — start an individual agent
  router.post("/:id/start", async (req: Request, res: Response) => {
    const agentId = req.params["id"] as string;
    try {
      const agent = messageStore.getAgent(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      await processManager.start(agentId);
      const updated = messageStore.getAgent(agentId);
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // POST /api/agents/:id/stop — stop an individual agent
  router.post("/:id/stop", async (req: Request, res: Response) => {
    const agentId = req.params["id"] as string;
    try {
      const agent = messageStore.getAgent(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      await processManager.stop(agentId);
      const updated = messageStore.getAgent(agentId);
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // POST /api/agents/:id/prompt — send prompt via REST (alternative to WebSocket)
  router.post("/:id/prompt", (req: Request, res: Response) => {
    const agentId = req.params["id"] as string;
    const body = req.body as SendPromptRequest;

    if (!body.prompt || typeof body.prompt !== "string") {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    try {
      const agent = messageStore.getAgent(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      processManager.sendPrompt(agentId, body.prompt);
      res.status(202).json({ queued: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // GET /api/agents/:id/messages — paginated message history
  router.get("/:id/messages", (req: Request, res: Response) => {
    const agentId = req.params["id"] as string;

    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(String(req.query["pageSize"] ?? "50"), 10))
    );

    try {
      const agent = messageStore.getAgent(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const result = messageStore.getMessages(agentId, { page, pageSize });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
