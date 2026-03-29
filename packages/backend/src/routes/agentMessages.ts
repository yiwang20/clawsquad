import { Router, type Request, type Response } from "express";
import type { AgentMessageStore } from "../services/AgentMessageStore.js";
import { agentMessageRowToResponse } from "../services/AgentMessageStore.js";

export function createAgentMessagesRouter(
  agentMessageStore: AgentMessageStore
): Router {
  const router = Router({ mergeParams: true });

  // GET /api/squads/:squadId/agent-messages
  // Optional query param: ?agentId=X — filter to messages for a specific agent
  router.get("/", (req: Request, res: Response) => {
    const squadId = req.params["squadId"] as string;
    const agentId = req.query["agentId"] as string | undefined;

    try {
      const rows = agentId
        ? agentMessageStore.getMessagesForAgent(agentId)
        : agentMessageStore.getSquadMessages(squadId);
      res.json(rows.map(agentMessageRowToResponse));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
