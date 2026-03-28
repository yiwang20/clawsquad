import express from "express";
import { createServer } from "http";
import { SQUADS_PATH, AGENTS_PATH } from "@clawsquad/shared";
import { createSquadsRouter } from "./routes/squads.js";
import { createAgentsRouter } from "./routes/agents.js";
import { WebSocketHub } from "./ws/WebSocketHub.js";
import type { ProcessManager, SquadManager, MessageStore } from "./services/types.js";

export interface ServerServices {
  processManager: ProcessManager;
  squadManager: SquadManager;
  messageStore: MessageStore;
}

export function createApp(services: ServerServices) {
  const { processManager, squadManager, messageStore } = services;

  const app = express();

  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // REST routes
  app.use(SQUADS_PATH, createSquadsRouter(squadManager));
  app.use(AGENTS_PATH, createAgentsRouter(processManager, messageStore));

  // 404 handler for unknown API routes
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const httpServer = createServer(app);

  // WebSocket hub (mounts at WS_PATH = "/ws")
  const wsHub = new WebSocketHub(httpServer, processManager, squadManager);

  return { app, httpServer, wsHub };
}
