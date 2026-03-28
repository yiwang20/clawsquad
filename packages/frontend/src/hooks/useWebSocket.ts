import { useEffect, useRef, useState, useCallback } from "react";
import type { WSServerMessage } from "@clawsquad/shared";
import {
  WS_PATH,
  WS_RECONNECT_BASE_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
  WS_RECONNECT_MULTIPLIER,
} from "@clawsquad/shared";
import { useSquadStore, registerWsSend } from "../stores/squadStore";

// The store serialises messages to JSON strings before calling wsSend.
// registerWsSend receives (msg: string) and sends it on the socket.


// ─── Types ────────────────────────────────────────────────────────────────────

export type WsStatus = "connecting" | "connected" | "disconnected";

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages a single WebSocket connection to the backend.
 *
 * - Auto-reconnects with exponential backoff on close/error.
 * - On open: registers the send function with the store so sendPrompt/abortAgent work.
 * - On open: re-subscribes to the currently active squad (if any).
 * - On message: routes server messages to the Zustand store.
 */
export function useWebSocket(): { status: WsStatus } {
  const [status, setStatus] = useState<WsStatus>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const unmountedRef = useRef(false);

  const updateAgentStatus = useSquadStore((s) => s.updateAgentStatus);
  const updateSquadStatus = useSquadStore((s) => s.updateSquadStatus);
  const addOutput = useSquadStore((s) => s.addOutput);
  const fetchSquads = useSquadStore((s) => s.fetchSquads);
  const activeSquadId = useSquadStore((s) => s.activeSquadId);

  // Keep a stable ref to activeSquadId for use inside WS callbacks
  const activeSquadIdRef = useRef(activeSquadId);
  useEffect(() => {
    activeSquadIdRef.current = activeSquadId;
  }, [activeSquadId]);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const wsUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${WS_PATH}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      if (unmountedRef.current) {
        ws.close();
        return;
      }

      // Track whether this is a reconnect (attempts > 0) before resetting the counter.
      const isReconnect = reconnectAttemptsRef.current > 0;
      reconnectAttemptsRef.current = 0;
      setStatus("connected");

      // Register send function with the store.
      // The store pre-serialises messages, so we receive a raw JSON string.
      registerWsSend((msg: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      });

      // Re-subscribe to the active squad (reconnect recovery).
      // Reset prevSquadIdRef so the subscription effect won't send a spurious
      // unsubscribe on the new connection.
      const squadId = activeSquadIdRef.current;
      prevSquadIdRef.current = squadId;
      if (squadId) {
        ws.send(JSON.stringify({ type: "subscribe:squad", squadId }));
      }

      // On reconnect, re-fetch squad list from REST API to reconcile any state
      // changes that occurred while the WebSocket was disconnected (e.g. backend
      // restart that cleared or modified the DB).  Without this, the store can
      // hold stale "active" squads that no longer exist in the backend, causing
      // a "Squad not found" 404 when the user clicks them.
      if (isReconnect) {
        fetchSquads().catch((err: unknown) => {
          console.warn("[ws] failed to re-sync squads after reconnect:", err);
        });
      }
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: WSServerMessage;
      try {
        msg = JSON.parse(event.data) as WSServerMessage;
      } catch {
        console.warn("[ws] received non-JSON message:", event.data);
        return;
      }

      switch (msg.type) {
        case "agent:output":
          addOutput(msg.agentId, msg.data);
          break;
        case "agent:status":
          updateAgentStatus(msg.agentId, msg.status);
          break;
        case "agent:error":
          console.error(`[ws] agent:error ${msg.agentId}:`, msg.error);
          break;
        case "squad:status":
          updateSquadStatus(msg.squadId, msg.status);
          break;
        default: {
          // Exhaustiveness check: log unknown types in dev
          const _: never = msg;
          console.warn("[ws] unknown message type:", _);
        }
      }
    };

    ws.onerror = (event) => {
      console.error("[ws] error:", event);
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;

      // Deregister send function
      registerWsSend(null);
      setStatus("disconnected");

      // Schedule reconnect with exponential backoff
      const attempts = reconnectAttemptsRef.current;
      const delay = Math.min(
        WS_RECONNECT_BASE_DELAY_MS *
          Math.pow(WS_RECONNECT_MULTIPLIER, attempts),
        WS_RECONNECT_MAX_DELAY_MS
      );
      reconnectAttemptsRef.current = attempts + 1;

      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) connect();
      }, delay);
    };
  }, [addOutput, updateAgentStatus, updateSquadStatus, fetchSquads]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;

      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const ws = wsRef.current;
      if (ws) {
        // Prevent onclose from scheduling another reconnect
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
      }

      registerWsSend(null);
    };
    // connect is stable (memoised). Only run on mount/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the previous squadId so we can unsubscribe before subscribing to a new one
  const prevSquadIdRef = useRef<string | null>(null);

  // When the active squad changes, unsubscribe the old squad then subscribe to the new one
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const prev = prevSquadIdRef.current;
    if (prev && prev !== activeSquadId) {
      ws.send(JSON.stringify({ type: "unsubscribe:squad", squadId: prev }));
    }
    if (activeSquadId) {
      ws.send(JSON.stringify({ type: "subscribe:squad", squadId: activeSquadId }));
    }
    prevSquadIdRef.current = activeSquadId;
  }, [activeSquadId]);

  return { status };
}
