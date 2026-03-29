import { Router, type Request, type Response } from "express";
import type {
  CreateSquadRequest,
  UpdateSquadRequest,
  AddAgentRequest,
} from "@clawsquad/shared";
import type { SquadManager } from "../services/types.js";

export function createSquadsRouter(squadManager: SquadManager): Router {
  const router = Router();

  // POST /api/squads — create a squad with inline agents
  router.post("/", (req: Request, res: Response) => {
    const body = req.body as CreateSquadRequest;

    if (!body.name || typeof body.name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const name = body.name.trim();
    if (!name) {
      res.status(400).json({ error: "Squad name cannot be empty" });
      return;
    }
    if (name.length > 60) {
      res.status(400).json({ error: "name must be 60 characters or less" });
      return;
    }
    if (!body.mission || typeof body.mission !== "string") {
      res.status(400).json({ error: "mission is required" });
      return;
    }
    if (!Array.isArray(body.agents) || body.agents.length === 0) {
      res.status(400).json({ error: "at least one agent is required" });
      return;
    }
    if (body.agents.length > 10) {
      res.status(400).json({ error: "maximum 10 agents per squad" });
      return;
    }
    for (const agent of body.agents) {
      if (!agent.roleName || typeof agent.roleName !== "string") {
        res.status(400).json({ error: "each agent must have a roleName" });
        return;
      }
      if (agent.roleName.trim().length > 60) {
        res.status(400).json({ error: "roleName must be 60 characters or less" });
        return;
      }
    }

    try {
      const squad = squadManager.createSquad(body);
      res.status(201).json(squad);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // GET /api/squads — list all squads
  router.get("/", (_req: Request, res: Response) => {
    try {
      const squads = squadManager.listSquads();
      res.json(squads);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // GET /api/squads/:id — squad detail with nested agents
  router.get("/:id", (req: Request, res: Response) => {
    try {
      const squad = squadManager.getSquad(req.params["id"] as string);
      if (!squad) {
        res.status(404).json({ error: "Squad not found" });
        return;
      }
      res.json(squad);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // PATCH /api/squads/:id — update squad metadata
  router.patch("/:id", (req: Request, res: Response) => {
    const body = req.body as UpdateSquadRequest;
    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        res.status(400).json({ error: "name must be a string" });
        return;
      }
      const patchedName = body.name.trim();
      if (!patchedName) {
        res.status(400).json({ error: "Squad name cannot be empty" });
        return;
      }
      if (patchedName.length > 60) {
        res.status(400).json({ error: "name must be 60 characters or less" });
        return;
      }
    }
    try {
      const squad = squadManager.updateSquad(req.params["id"] as string, body);
      if (!squad) {
        res.status(404).json({ error: "Squad not found" });
        return;
      }
      res.json(squad);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/squads/:id — stop all agents and delete squad
  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const exists = squadManager.getSquad(req.params["id"] as string);
      if (!exists) {
        res.status(404).json({ error: "Squad not found" });
        return;
      }
      await squadManager.deleteSquad(req.params["id"] as string);
      res.status(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // POST /api/squads/:id/start — start all agents
  router.post("/:id/start", async (req: Request, res: Response) => {
    try {
      const squad = squadManager.getSquad(req.params["id"] as string);
      if (!squad) {
        res.status(404).json({ error: "Squad not found" });
        return;
      }
      await squadManager.startSquad(req.params["id"] as string);
      const updated = squadManager.getSquad(req.params["id"] as string);
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // POST /api/squads/:id/stop — stop all agents
  router.post("/:id/stop", async (req: Request, res: Response) => {
    try {
      const squad = squadManager.getSquad(req.params["id"] as string);
      if (!squad) {
        res.status(404).json({ error: "Squad not found" });
        return;
      }
      await squadManager.stopSquad(req.params["id"] as string);
      const updated = squadManager.getSquad(req.params["id"] as string);
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // POST /api/squads/:squadId/agents — add agent to squad
  router.post("/:squadId/agents", (req: Request, res: Response) => {
    const body = req.body as AddAgentRequest;

    if (!body.roleName || typeof body.roleName !== "string") {
      res.status(400).json({ error: "roleName is required" });
      return;
    }
    const roleName = body.roleName.trim();
    if (!roleName) {
      res.status(400).json({ error: "Agent role name cannot be empty" });
      return;
    }
    if (roleName.length > 60) {
      res.status(400).json({ error: "roleName must be 60 characters or less" });
      return;
    }

    try {
      const squad = squadManager.getSquad(req.params["squadId"] as string);
      if (!squad) {
        res.status(404).json({ error: "Squad not found" });
        return;
      }
      if (squad.agents.length >= 10) {
        res.status(400).json({ error: "maximum 10 agents per squad" });
        return;
      }
      const agent = squadManager.addAgent(
        req.params["squadId"] as string,
        body
      );
      res.status(201).json(agent);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/squads/:squadId/agents/:agentId — remove agent from squad
  router.delete(
    "/:squadId/agents/:agentId",
    async (req: Request, res: Response) => {
      try {
        const squad = squadManager.getSquad(req.params["squadId"] as string);
        if (!squad) {
          res.status(404).json({ error: "Squad not found" });
          return;
        }
        await squadManager.removeAgent(
          req.params["squadId"] as string,
          req.params["agentId"] as string
        );
        res.status(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Internal error";
        res.status(500).json({ error: message });
      }
    }
  );

  return router;
}
