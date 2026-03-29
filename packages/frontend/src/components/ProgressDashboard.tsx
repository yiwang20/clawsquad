import { useMemo } from "react";
import type { AgentStatus } from "@clawsquad/shared";
import { useSquadStore } from "../stores/squadStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusDot(status: AgentStatus): string {
  switch (status) {
    case "running": return "var(--color-blue-400)";
    case "waiting": return "var(--color-green-400)";
    case "error":   return "var(--color-red-400)";
    case "stopped": return "var(--color-orange-400)";
    default:        return "var(--color-text-disabled)";
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  pending: number;
  inProgress: number;
  completed: number;
  total: number;
}

function ProgressBar({ pending, inProgress, completed, total }: ProgressBarProps) {
  const completedPct = total > 0 ? (completed / total) * 100 : 0;
  const inProgressPct = total > 0 ? (inProgress / total) * 100 : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--color-text-primary)" }}>
          Task Progress
        </span>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
          {completed} / {total} completed
        </span>
      </div>

      {/* Segmented progress bar */}
      <div
        style={{
          height: 8,
          borderRadius: "var(--radius-full)",
          background: "var(--color-bg-elevated)",
          overflow: "hidden",
          display: "flex",
        }}
      >
        <div
          style={{
            width: `${completedPct}%`,
            background: "var(--color-green-500)",
            transition: "width var(--duration-slow) var(--ease-default)",
          }}
        />
        <div
          style={{
            width: `${inProgressPct}%`,
            background: "var(--color-blue-500)",
            transition: "width var(--duration-slow) var(--ease-default)",
          }}
        />
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-2)" }}>
        {[
          { label: "Completed",   count: completed,  color: "var(--color-green-400)" },
          { label: "In Progress", count: inProgress, color: "var(--color-blue-400)"  },
          { label: "Pending",     count: pending,    color: "var(--color-text-disabled)" },
        ].map(({ label, count, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "var(--space-1.5)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
              {label}: {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ProgressDashboard ────────────────────────────────────────────────────────

export interface ProgressDashboardProps {
  squadId: string;
}

export function ProgressDashboard({ squadId }: ProgressDashboardProps) {
  const tasks = useSquadStore((s) => s.tasks.get(squadId) ?? []);
  const agentMessages = useSquadStore((s) => s.agentMessages.get(squadId) ?? []);
  const agents = useSquadStore((s) => s.agents);
  const squad = useSquadStore((s) => s.squads.get(squadId));

  const squadAgents = useMemo(
    () => (squad?.agents ?? []).map((a) => agents.get(a.id) ?? a),
    [squad, agents],
  );

  // Task stats
  const pending    = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const completed  = tasks.filter((t) => t.status === "completed").length;
  const total      = tasks.length;

  // Per-agent task counts
  const taskCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.assigneeId) counts.set(t.assigneeId, (counts.get(t.assigneeId) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  // Recent activity: last 10 items from tasks (by updatedAt) + messages (by createdAt), merged
  const recentActivity = useMemo(() => {
    type Item =
      | { kind: "task";    time: string; label: string }
      | { kind: "message"; time: string; label: string };

    const items: Item[] = [
      ...tasks.map((t) => ({
        kind: "task" as const,
        time: t.updatedAt,
        label: `Task "${t.title}" → ${t.status.replace("_", " ")}`,
      })),
      ...agentMessages.slice(-20).map((m) => {
        const fromName = agents.get(m.fromAgentId)?.roleName ?? m.fromAgentId.slice(0, 8);
        const toName = m.toAgentId
          ? (agents.get(m.toAgentId)?.roleName ?? m.toAgentId.slice(0, 8))
          : "all";
        return {
          kind: "message" as const,
          time: m.createdAt,
          label: `${fromName} → ${toName}: ${m.content.slice(0, 60)}${m.content.length > 60 ? "…" : ""}`,
        };
      }),
    ];

    return items
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10);
  }, [tasks, agentMessages, agents]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Task progress */}
      <div className="card">
        <ProgressBar
          pending={pending}
          inProgress={inProgress}
          completed={completed}
          total={total}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
        {/* Agent utilization */}
        <div className="card">
          <h3
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--color-text-primary)",
              marginBottom: "var(--space-3)",
            }}
          >
            Agent Utilization
          </h3>
          {squadAgents.length === 0 ? (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-disabled)", fontStyle: "italic" }}>
              No agents.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {squadAgents.map((agent) => {
                const taskCount = taskCountByAgent.get(agent.id) ?? 0;
                return (
                  <div
                    key={agent.id}
                    style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: statusDot(agent.status),
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {agent.roleName}
                    </span>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                      {taskCount} {taskCount === 1 ? "task" : "tasks"}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: statusDot(agent.status),
                        flexShrink: 0,
                        minWidth: "3.5rem",
                        textAlign: "right",
                      }}
                    >
                      {agent.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card">
          <h3
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--color-text-primary)",
              marginBottom: "var(--space-3)",
            }}
          >
            Recent Activity
          </h3>
          {recentActivity.length === 0 ? (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-disabled)", fontStyle: "italic" }}>
              No activity yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {recentActivity.map((item, idx) => (
                <div
                  key={idx}
                  style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}
                >
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      color: item.kind === "task" ? "var(--color-green-400)" : "var(--color-blue-400)",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {item.kind === "task" ? "✓" : "↗"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.label}
                    </p>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-disabled)" }}>
                      {formatTime(item.time)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
