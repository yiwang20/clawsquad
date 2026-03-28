import type { Squad } from "@clawsquad/shared";
import { useSquadStore } from "../stores/squadStore";
import { StatusBadge } from "./StatusBadge";

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ─── Props ─────────────────────────────────────────────────────────────────── */

interface SquadCardProps {
  squad: Squad;
  onClick: (squadId: string) => void;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function SquadCard({ squad, onClick }: SquadCardProps) {
  const liveAgents = useSquadStore((s) => s.agents);

  // Merge embedded squad.agents with live store data so role names always
  // reflect the most up-to-date agent records, regardless of squad status.
  const agentChips = squad.agents.map((a) => liveAgents.get(a.id) ?? a);
  const agentCount = agentChips.length;

  return (
    <div
      className="card card-interactive"
      onClick={() => onClick(squad.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(squad.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${squad.name} — ${squad.status}`}
    >
      {/* Header: name + status badge */}
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          <div className="card-title">{squad.name}</div>
        </div>
        <StatusBadge
          status={squad.status}
          suffix={`(${agentCount})`}
        />
      </div>

      {/* Mission preview (truncated to ~2 lines via CSS) */}
      <div className="card-description">{squad.mission}</div>

      {/* Footer: role chips + timestamp */}
      <div className="card-footer">
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          {agentChips.map((agent) => (
            <span key={agent.id} className="role-chip">
              {agent.roleName}
            </span>
          ))}
        </div>
        <span
          className="agent-count"
          title={new Date(squad.createdAt).toLocaleString()}
        >
          {formatRelativeDate(squad.createdAt)}
        </span>
      </div>
    </div>
  );
}
