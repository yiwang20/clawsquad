/**
 * Backend entry point.
 *
 * Wires together the concrete service implementations (built in Task #4)
 * and starts the HTTP + WebSocket server.
 */

import { createApp } from "./server.js";
import { Database } from "./services/Database.js";
import { ProcessManager } from "./services/ProcessManager.js";
import { SquadManager } from "./services/SquadManager.js";
import { MessageStore } from "./services/MessageStore.js";
import { TaskStore } from "./services/TaskStore.js";
import { AgentMessageStore } from "./services/AgentMessageStore.js";
import { DB_PATH } from "@clawsquad/shared";

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  db.migrate();

  const messageStore = new MessageStore(db);
  const processManager = new ProcessManager(db, messageStore);
  const squadManager = new SquadManager(db, processManager);
  const taskStore = new TaskStore(db);
  const agentMessageStore = new AgentMessageStore(db);

  const { httpServer, wsHub } = createApp({
    processManager,
    squadManager,
    messageStore,
    taskStore,
    agentMessageStore,
    db,
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[server] ${signal} received — shutting down gracefully`);
    wsHub.close();
    await processManager.stopAll();
    db.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] listening on http://0.0.0.0:${PORT}`);
    console.log(`[server] WebSocket available at ws://0.0.0.0:${PORT}/ws`);
  });
}

main().catch((err) => {
  console.error("[server] fatal error:", err);
  process.exit(1);
});
