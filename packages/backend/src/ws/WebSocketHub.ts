import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import type {
  WSClientMessage,
  WSServerMessage,
  StreamMessage,
  AgentStatus,
} from "@clawsquad/shared";
import { WS_PATH } from "@clawsquad/shared";
import type { ProcessManager, SquadManager } from "../services/types.js";

/**
 * WebSocketHub manages all WebSocket connections and subscriptions.
 *
 * Subscription model:
 *   - Agent-level: client receives agent:output / agent:status / agent:error
 *   - Squad-level:  client receives squad:status for the whole squad
 *
 * Client → Server message types:
 *   subscribe / unsubscribe          (agentIds)
 *   subscribe:squad / unsubscribe:squad (squadId)
 *   agent:prompt / agent:abort
 *
 * Server → Client message types:
 *   agent:output / agent:status / agent:error / squad:status
 */
export class WebSocketHub {
  private wss: WebSocketServer;

  /** agent subscriptions: socket → Set<agentId> */
  private agentSubs = new Map<WebSocket, Set<string>>();

  /** squad subscriptions: socket → Set<squadId> */
  private squadSubs = new Map<WebSocket, Set<string>>();

  constructor(
    server: HttpServer,
    private processManager: ProcessManager,
    private squadManager: SquadManager
  ) {
    this.wss = new WebSocketServer({ server, path: WS_PATH });
    this.wss.on("connection", this.handleConnection.bind(this));
    this.attachProcessManagerListeners();
  }

  // ─── Connection handling ────────────────────────────────────────────────────

  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    this.agentSubs.set(ws, new Set());
    this.squadSubs.set(ws, new Set());

    ws.on("message", (raw) => {
      let msg: WSClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as WSClientMessage;
      } catch {
        return; // malformed JSON — ignore
      }
      this.handleClientMessage(ws, msg);
    });

    ws.on("close", () => {
      this.agentSubs.delete(ws);
      this.squadSubs.delete(ws);
    });

    ws.on("error", (err) => {
      console.error("[WebSocketHub] client error:", err.message);
    });
  }

  // ─── Client → Server ────────────────────────────────────────────────────────

  private handleClientMessage(ws: WebSocket, msg: WSClientMessage): void {
    switch (msg.type) {
      case "subscribe":
        for (const id of msg.agentIds) this.agentSubs.get(ws)?.add(id);
        break;

      case "unsubscribe":
        for (const id of msg.agentIds) this.agentSubs.get(ws)?.delete(id);
        break;

      case "subscribe:squad":
        this.squadSubs.get(ws)?.add(msg.squadId);
        break;

      case "unsubscribe:squad":
        this.squadSubs.get(ws)?.delete(msg.squadId);
        break;

      case "agent:prompt":
        this.processManager.sendPrompt(msg.agentId, msg.prompt);
        break;

      case "agent:abort":
        this.processManager.abort(msg.agentId);
        break;

      default:
        // Unknown type — ignore
        break;
    }
  }

  // ─── Server → Client ────────────────────────────────────────────────────────

  private send(ws: WebSocket, message: WSServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /** Broadcast to all clients subscribed to a specific agentId. */
  broadcastToAgent(agentId: string, message: WSServerMessage): void {
    for (const [ws, agents] of this.agentSubs) {
      if (agents.has(agentId)) this.send(ws, message);
    }
  }

  /** Broadcast to all clients subscribed to a specific squadId. */
  broadcastToSquad(squadId: string, message: WSServerMessage): void {
    for (const [ws, squads] of this.squadSubs) {
      if (squads.has(squadId)) this.send(ws, message);
    }
  }

  // ─── ProcessManager event listeners ────────────────────────────────────────

  private attachProcessManagerListeners(): void {
    this.processManager.on(
      "agent:message",
      (agentId: string, data: StreamMessage) => {
        this.broadcastToAgent(agentId, {
          type: "agent:output",
          agentId,
          data,
        });
      }
    );

    this.processManager.on(
      "agent:status",
      (agentId: string, status: AgentStatus) => {
        this.broadcastToAgent(agentId, {
          type: "agent:status",
          agentId,
          status,
        });

        // Derive and broadcast squad status whenever any agent changes
        const squadId = this.squadManager.getSquadIdForAgent(agentId);
        if (squadId !== null) {
          this.broadcastToSquad(squadId, {
            type: "squad:status",
            squadId,
            status: this.squadManager.deriveSquadStatus(squadId),
          });
        }
      }
    );

    this.processManager.on(
      "agent:error",
      (agentId: string, error: string) => {
        this.broadcastToAgent(agentId, { type: "agent:error", agentId, error });

        const squadId = this.squadManager.getSquadIdForAgent(agentId);
        if (squadId !== null) {
          this.broadcastToSquad(squadId, {
            type: "squad:status",
            squadId,
            status: this.squadManager.deriveSquadStatus(squadId),
          });
        }
      }
    );
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  close(): void {
    this.wss.close();
  }
}
