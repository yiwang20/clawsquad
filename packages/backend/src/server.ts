import express from "express";
import { createServer } from "http";
import { SQUADS_PATH, AGENTS_PATH } from "@clawsquad/shared";
import { createSquadsRouter } from "./routes/squads.js";
import { createAgentsRouter } from "./routes/agents.js";
import { createTasksRouter } from "./routes/tasks.js";
import { createAgentMessagesRouter } from "./routes/agentMessages.js";
import { WebSocketHub } from "./ws/WebSocketHub.js";
import type { ProcessManager, SquadManager, MessageStore } from "./services/types.js";
import type { TaskStore } from "./services/TaskStore.js";
import type { AgentMessageStore } from "./services/AgentMessageStore.js";
import { CommandInterceptor } from "./services/CommandInterceptor.js";
import type { Database } from "./services/Database.js";

export interface ServerServices {
  processManager: ProcessManager;
  squadManager: SquadManager;
  messageStore: MessageStore;
  taskStore: TaskStore;
  agentMessageStore: AgentMessageStore;
  db: Database;
}

export function createApp(services: ServerServices) {
  const { processManager, squadManager, messageStore, taskStore, agentMessageStore, db } = services;

  const app = express();

  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  const httpServer = createServer(app);

  // WebSocket hub (mounts at WS_PATH = "/ws") — must be created before routes that reference it
  const wsHub = new WebSocketHub(httpServer, processManager, squadManager);

  // REST routes
  app.use(SQUADS_PATH, createSquadsRouter(squadManager));
  app.use(AGENTS_PATH, createAgentsRouter(processManager, messageStore));
  // Task routes: /api/squads/:squadId/tasks
  app.use(`${SQUADS_PATH}/:squadId/tasks`, createTasksRouter(taskStore, wsHub));
  // Agent message routes: /api/squads/:squadId/agent-messages
  app.use(`${SQUADS_PATH}/:squadId/agent-messages`, createAgentMessagesRouter(agentMessageStore));

  // 404 handler for unknown API routes
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Command interceptor — listens on processManager events, no HTTP involvement
  new CommandInterceptor(processManager, taskStore, agentMessageStore, squadManager, wsHub, db);

  return { app, httpServer, wsHub };
}
