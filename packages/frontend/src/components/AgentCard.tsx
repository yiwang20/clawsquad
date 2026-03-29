import { useNavigate } from "react-router-dom";
import type { Agent, StreamMessage } from "@clawsquad/shared";
import { useSquadStore } from "../stores/squadStore";
import { StatusBadge } from "./StatusBadge";

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

/** Extract plain text from a StreamMessage (handles all known shapes). */
function extractText(msg: StreamMessage): string {
  // Direct string content
  if (typeof msg.content === "string") return msg.content;
  // content_block_delta with text
  if (typeof (msg as Record<string, unknown>).text === "string")
    return (msg as Record<string, unknown>).text as string;
  // Claude stream-json: message.content is an array of content blocks
  const message = (msg as Record<string, unknown>).message as
    | { content?: Array<{ type: string; text?: string }> }
    | undefined;
  if (message?.content && Array.isArray(message.content)) {
    return message.content
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
  }
  // result with a result string
  if (msg.type === "result" && typeof (msg as Record<string, unknown>).result === "string")
    return (msg as Record<string, unknown>).result as string;
  return "";
}

/** Extract a plain-text preview from recent output messages. */
function getOutputPreview(
  messages: StreamMessage[] | undefined,
  maxLines: number = 3,
): string {
  if (!messages || messages.length === 0) return "";

  // Walk backwards to find the latest assistant text
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.type === "assistant" || msg.type === "content_block_delta") {
      const text = extractText(msg);
      if (text) {
        const lines = text.trim().split("\n");
        return lines.slice(0, maxLines).join("\n");
      }
    }
  }
  return "";
}

/* ─── Props ─────────────────────────────────────────────────────────────────── */

interface AgentCardProps {
  agent: Agent;
  /** Recent output messages for this agent (from the store's output buffer) */
  outputMessages?: StreamMessage[];
  /** Called when the user clicks the Restart button on an error/stopped agent */
  onRestart?: (agentId: string) => void;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function AgentCard({ agent, outputMessages, onRestart }: AgentCardProps) {
  const navigate = useNavigate();
  const storeMessages = useSquadStore((s) => s.outputBuffers.get(agent.id));
  const preview = getOutputPreview(outputMessages ?? storeMessages);
  const isActive =
    agent.status === "running" || agent.status === "waiting";

  const handleCardClick = () => {
    navigate(`/squads/${agent.squadId}/agents/${agent.id}`);
  };

  return (
    <div
      className="card card-compact card-interactive status-border"
      data-status={agent.status}
      style={{ cursor: "pointer" }}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${agent.roleName} — ${agent.status}`}
    >
      {/* Header: role name + status */}
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          <div className="card-title">{agent.roleName}</div>
          {agent.roleDescription && (
            <div className="card-subtitle">{agent.roleDescription}</div>
          )}
        </div>
        <StatusBadge status={agent.status} size="sm" />
      </div>

      {/* Output preview */}
      {preview ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            lineHeight: "var(--leading-relaxed)",
            color: "var(--color-text-tertiary)",
            whiteSpace: "pre-wrap",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            marginTop: "var(--space-2)",
          }}
        >
          {preview}
        </div>
      ) : (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-disabled)",
            fontStyle: "italic",
            marginTop: "var(--space-2)",
          }}
        >
          {agent.status === "idle"
            ? "Waiting to start"
            : agent.status === "running"
              ? "Processing..."
              : "No output yet"}
        </div>
      )}

      {/* Typing indicator for running agents */}
      {agent.status === "running" && (
        <div className="typing-indicator" style={{ marginTop: "var(--space-1)" }}>
          <span />
          <span />
          <span />
        </div>
      )}

      {/* Footer: model badge + restart button */}
      <div
        className="card-footer"
        style={{ borderTop: "none", paddingTop: "var(--space-2)", marginTop: "var(--space-1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <span className="model-badge">{agent.model}</span>
        {onRestart && (agent.status === "error" || agent.status === "stopped") && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onRestart(agent.id);
            }}
          >
            Restart
          </button>
        )}
      </div>
    </div>
  );
}
