import type { Agent, StreamMessage } from "@clawsquad/shared";
import { StatusBadge } from "./StatusBadge";

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

/** Extract a plain-text preview from recent output messages. */
function getOutputPreview(
  messages: StreamMessage[] | undefined,
  maxLines: number = 3,
): string {
  if (!messages || messages.length === 0) return "";

  // Walk backwards to find the latest assistant text
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.type === "assistant" && typeof msg.content === "string") {
      const lines = msg.content.trim().split("\n");
      return lines.slice(0, maxLines).join("\n");
    }
    // Also handle content_block_delta with text
    if (
      msg.type === "content_block_delta" &&
      typeof msg.text === "string"
    ) {
      const lines = msg.text.trim().split("\n");
      return lines.slice(0, maxLines).join("\n");
    }
  }
  return "";
}

/* ─── Props ─────────────────────────────────────────────────────────────────── */

interface AgentCardProps {
  agent: Agent;
  /** Recent output messages for this agent (from the store's output buffer) */
  outputMessages?: StreamMessage[];
  onClick: (squadId: string, agentId: string) => void;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function AgentCard({ agent, outputMessages, onClick }: AgentCardProps) {
  const preview = getOutputPreview(outputMessages);
  const isActive =
    agent.status === "running" || agent.status === "waiting";

  return (
    <div
      className="card card-compact card-interactive status-border"
      data-status={agent.status}
      onClick={() => onClick(agent.squadId, agent.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(agent.squadId, agent.id);
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

      {/* Footer: model badge */}
      <div
        className="card-footer"
        style={{ borderTop: "none", paddingTop: "var(--space-2)", marginTop: "var(--space-1)" }}
      >
        <span className="model-badge">{agent.model}</span>
      </div>
    </div>
  );
}
