import { useState, useEffect, useRef } from "react";
import type { AgentMessageResponse } from "@clawsquad/shared";
import { useSquadStore } from "../stores/squadStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ─── MessageRow ───────────────────────────────────────────────────────────────

interface MessageRowProps {
  message: AgentMessageResponse;
  fromName: string;
  toName: string | null;
  isBroadcast: boolean;
}

function MessageRow({ message, fromName, toName, isBroadcast }: MessageRowProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
        padding: "var(--space-3)",
        borderBottom: "1px solid var(--color-border-subtle)",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {/* From badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "1px var(--space-1.5)",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-medium)",
            color: "var(--color-blue-400)",
            background: "rgba(59,130,246,0.1)",
            border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {fromName}
        </span>

        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-disabled)" }}>→</span>

        {/* To badge */}
        {isBroadcast ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "1px var(--space-1.5)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-medium)",
              color: "var(--color-orange-400)",
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            All
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "1px var(--space-1.5)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-medium)",
              color: "var(--color-purple-400)",
              background: "rgba(168,85,247,0.08)",
              border: "1px solid rgba(168,85,247,0.2)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {toName ?? "Unknown"}
          </span>
        )}

        {isBroadcast && (
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-orange-400)",
              fontStyle: "italic",
            }}
          >
            broadcast
          </span>
        )}

        <span
          style={{
            marginLeft: "auto",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-disabled)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatTime(message.createdAt)}
        </span>
      </div>

      {/* Message content */}
      <p
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--color-text-secondary)",
          lineHeight: "var(--leading-relaxed)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message.content}
      </p>
    </div>
  );
}

// ─── AgentInbox ───────────────────────────────────────────────────────────────

export interface AgentInboxProps {
  squadId: string;
}

export function AgentInbox({ squadId }: AgentInboxProps) {
  const messages = useSquadStore((s) => s.agentMessages.get(squadId) ?? []);
  const agents = useSquadStore((s) => s.agents);
  const squad = useSquadStore((s) => s.squads.get(squadId));

  const [filterAgentId, setFilterAgentId] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Build name lookup from squad agents
  const squadAgents = (squad?.agents ?? []).map((a) => agents.get(a.id) ?? a);
  const nameById = new Map(squadAgents.map((a) => [a.id, a.roleName]));

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Filter messages
  const visible: AgentMessageResponse[] = filterAgentId
    ? messages.filter(
        (m) =>
          m.fromAgentId === filterAgentId ||
          m.toAgentId === filterAgentId ||
          m.toAgentId === null, // broadcasts always visible when filtering
      )
    : messages;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
          Filter:
        </span>
        <select
          className="form-input"
          value={filterAgentId}
          onChange={(e) => setFilterAgentId(e.target.value)}
          style={{ fontSize: "var(--text-sm)", maxWidth: "16rem" }}
        >
          <option value="">All agents</option>
          {squadAgents.map((a) => (
            <option key={a.id} value={a.id}>{a.roleName}</option>
          ))}
        </select>
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--color-text-disabled)" }}>
          {visible.length} {visible.length === 1 ? "message" : "messages"}
        </span>
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {visible.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--color-text-disabled)",
              fontSize: "var(--text-sm)",
              fontStyle: "italic",
            }}
          >
            No messages yet.
          </div>
        ) : (
          visible.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              fromName={nameById.get(m.fromAgentId) ?? m.fromAgentId.slice(0, 8)}
              toName={m.toAgentId ? (nameById.get(m.toAgentId) ?? m.toAgentId.slice(0, 8)) : null}
              isBroadcast={m.toAgentId === null}
            />
          ))
        )}
        <div ref={bottomRef} style={{ height: 1 }} aria-hidden="true" />
      </div>
    </div>
  );
}
