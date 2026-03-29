import { Router, type Request, type Response } from "express";
import type { SendPromptRequest } from "@clawsquad/shared";
import type { ProcessManager, MessageStore } from "../services/types.js";

export function createAgentsRouter(
  processManager: ProcessManager,
  messageStore: MessageStore
): Router {
  const router = Router();

  // GET /api/agents/:id — return agent details with live status
  router.get("/:id", (req: Request, res: Response) => {
    const agentId = req.params["id"] as string;
    try {
      const agent = messageStore.getAgent(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      // Overlay live process status if a process exists
      if (processManager.hasProcess(agentId)) {
        const liveStatus = processManager.getStatus(agentId);
        res.json({ ...agent, status: liveStatus });
      } else {
        res.json(agent);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

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
      if (
        err instanceof Error &&
        err.message.startsWith("No running process for agent")
      ) {
        res.status(409).json({ error: "Agent is not running" });
        return;
      }
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // POST /api/agents/:id/abort — abort current agent turn (REST alt to WebSocket)
  router.post("/:id/abort", (req: Request, res: Response) => {
    const agentId = req.params["id"] as string;
    try {
      const agent = messageStore.getAgent(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      if (!processManager.hasProcess(agentId)) {
        res.status(409).json({ error: "Agent is not running" });
        return;
      }
      processManager.abort(agentId);
      res.status(202).json({ aborted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // GET /api/agents/:id/messages — paginated message history
  router.get("/:id/messages", (req: Request, res: Response) => {
    const agentId = req.params["id"] as string;

    const rawPage = req.query["page"];
    const rawPageSize = req.query["pageSize"];

    const pageNum = rawPage !== undefined ? parseInt(String(rawPage), 10) : 1;
    const pageSizeNum =
      rawPageSize !== undefined ? parseInt(String(rawPageSize), 10) : 50;

    if (!Number.isInteger(pageNum) || pageNum < 1) {
      res.status(400).json({ error: "page must be a positive integer" });
      return;
    }
    if (!Number.isInteger(pageSizeNum) || pageSizeNum < 1) {
      res.status(400).json({ error: "pageSize must be a positive integer" });
      return;
    }

    const page = pageNum;
    const pageSize = Math.min(200, pageSizeNum);

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
