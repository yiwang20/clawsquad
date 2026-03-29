import { useEffect, useCallback, useState } from "react";
import type { Agent } from "@clawsquad/shared";
import { useSquadStore, ApiError } from "../stores/squadStore";
import { toast } from "../stores/toastStore";
import { AgentCard } from "../components/AgentCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { StatusBadge } from "../components/StatusBadge";
import { TaskBoard } from "../components/TaskBoard";
import { AgentInbox } from "../components/AgentInbox";
import { ProgressDashboard } from "../components/ProgressDashboard";

/* ─── Props ─────────────────────────────────────────────────────────────────── */

interface SquadDetailPageProps {
  squadId: string;
  onNavigateHome: () => void;
}

/* ─── Tab types ─────────────────────────────────────────────────────────────── */

type TabId = "agents" | "tasks" | "messages" | "overview";

const TABS: { id: TabId; label: string }[] = [
  { id: "agents",   label: "Agents"   },
  { id: "tasks",    label: "Tasks"    },
  { id: "messages", label: "Messages" },
  { id: "overview", label: "Overview" },
];

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function SquadDetailPage({
  squadId,
  onNavigateHome,
}: SquadDetailPageProps) {
  const squad = useSquadStore((s) => s.squads.get(squadId));
  const agents = useSquadStore((s) => s.agents);
  const outputBuffers = useSquadStore((s) => s.outputBuffers);
  const fetchSquad = useSquadStore((s) => s.fetchSquad);
  const fetchSquads = useSquadStore((s) => s.fetchSquads);
  const startSquad = useSquadStore((s) => s.startSquad);
  const stopSquad = useSquadStore((s) => s.stopSquad);
  const deleteSquad = useSquadStore((s) => s.deleteSquad);
  const startAgent = useSquadStore((s) => s.startAgent);
  const fetchAgentMessages = useSquadStore((s) => s.fetchAgentMessages);
  const fetchTasks = useSquadStore((s) => s.fetchTasks);
  const fetchSquadMessages = useSquadStore((s) => s.fetchSquadMessages);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("agents");

  // Fetch squad on mount / when squadId changes
  useEffect(() => {
    setNotFound(false);
    fetchSquad(squadId).catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        // Re-sync the full squad list so any stale "active" entry is immediately
        // removed from the store.  Without this, the home page could briefly
        // show the ghost squad again before its own fetchSquads() completes.
        fetchSquads().catch(() => {});
      } else {
        toast.error("Failed to load squad details");
      }
    });
  }, [fetchSquad, fetchSquads, squadId]);

  // Fetch output messages for each agent so AgentCard previews are populated.
  // Only fetch for agents whose buffer is not yet loaded.
  useEffect(() => {
    if (!squad) return;
    for (const agent of squad.agents) {
      const buf = outputBuffers.get(agent.id);
      // Fetch if buffer doesn't exist OR is empty (e.g. WS created an empty entry)
      if (!buf || buf.length === 0) {
        fetchAgentMessages(agent.id).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad?.id, fetchAgentMessages]);

  // Fetch V2 tasks and agent messages on mount
  useEffect(() => {
    fetchTasks(squadId).catch(() => {});
    fetchSquadMessages(squadId).catch(() => {});
  }, [squadId, fetchTasks, fetchSquadMessages]);

  // Poll squad + agent statuses every 5 seconds as fallback for missed WS events
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSquad(squadId).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [squadId, fetchSquad]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    setActionLoading("start");
    try {
      await startSquad(squadId);
    } catch {
      toast.error("Failed to start squad");
    } finally {
      setActionLoading(null);
    }
  }, [startSquad, squadId]);

  const handleStop = useCallback(async () => {
    setActionLoading("stop");
    try {
      await stopSquad(squadId);
    } catch {
      toast.error("Failed to stop squad");
    } finally {
      setActionLoading(null);
    }
  }, [stopSquad, squadId]);

  const handleDeleteConfirmed = useCallback(async () => {
    setActionLoading("delete");
    try {
      await deleteSquad(squadId);
      onNavigateHome();
    } catch {
      toast.error("Failed to delete squad");
      setActionLoading(null);
      setShowDeleteConfirm(false);
    }
  }, [deleteSquad, squadId, onNavigateHome]);

  // ── Not found ────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="main" style={{ textAlign: "center", paddingTop: "var(--space-16)" }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
          Squad not found
        </div>
        <div style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)", marginBottom: "var(--space-6)" }}>
          This squad may have been deleted or the link is invalid.
        </div>
        <button type="button" className="btn btn-secondary" onClick={onNavigateHome}>
          Back to Home
        </button>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (!squad) {
    return (
      <div className="main">
        <div className="loading-state">
          <div className="loading-state-spinner" />
          <span>Loading squad…</span>
        </div>
      </div>
    );
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const squadAgents: Agent[] = squad.agents
    .map((a) => agents.get(a.id) ?? a)
    .sort((a, b) => a.roleName.localeCompare(b.roleName));

  const canStartStatus =
    squad.status === "ready" || squad.status === "stopped" || squad.status === "error";
  const canStart = canStartStatus && squadAgents.length > 0;
  const canStop =
    squad.status === "running" || squad.status === "active";

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="main">
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete squad?"
          message={`"${squad.name}" and all its agents will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          loading={actionLoading === "delete"}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {/* Breadcrumb */}
      <nav className="breadcrumbs" style={{ marginBottom: "var(--space-4)" }}>
        <a href="/" onClick={(e) => { e.preventDefault(); onNavigateHome(); }}>
          Home
        </a>
        <span className="breadcrumbs-separator">/</span>
        <span className="breadcrumbs-current">{squad.name}</span>
      </nav>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <h1 className="page-title">{squad.name}</h1>
            <StatusBadge
              status={squad.status}
              suffix={`· ${squadAgents.length} ${squadAgents.length === 1 ? "agent" : "agents"}`}
            />
          </div>
          <p className="squad-detail-mission" style={{ marginTop: "var(--space-2)" }}>
            {squad.mission}
          </p>
        </div>

        <div className="page-actions">
          {canStartStatus && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={actionLoading !== null || !canStart}
              title={squadAgents.length === 0 ? "Add agents before starting the squad" : undefined}
              onClick={handleStart}
            >
              {actionLoading === "start" ? "Starting..." : "Start Squad"}
            </button>
          )}
          {canStop && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={actionLoading !== null}
              onClick={handleStop}
            >
              {actionLoading === "stop" ? "Stopping..." : "Stop Squad"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={actionLoading !== null}
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete this squad and all its agents"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="tab-nav" style={{ marginBottom: "var(--space-5)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-nav-item${activeTab === tab.id ? " tab-nav-item-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "agents" && (
        squadAgents.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "var(--space-16) var(--space-4)",
              color: "var(--color-text-tertiary)",
              textAlign: "center",
              gap: "var(--space-2)",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.4 }}
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              <line x1="12" y1="13" x2="12" y2="17" />
              <line x1="10" y1="15" x2="14" y2="15" />
            </svg>
            <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>No agents yet</div>
            <div style={{ fontSize: "var(--text-sm)", maxWidth: "24rem" }}>
              This squad has no agents. Delete and recreate to add agents.
            </div>
          </div>
        ) : (
          <div className="agent-grid">
            {squadAgents.map((agent) => {
              const msgs = outputBuffers.get(agent.id);
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  {...(msgs !== undefined && { outputMessages: msgs })}
                  onRestart={startAgent}
                />
              );
            })}
          </div>
        )
      )}

      {activeTab === "tasks" && (
        <TaskBoard squadId={squadId} />
      )}

      {activeTab === "messages" && (
        <div style={{ height: "calc(100vh - 22rem)", minHeight: "20rem" }}>
          <AgentInbox squadId={squadId} />
        </div>
      )}

      {activeTab === "overview" && (
        <ProgressDashboard squadId={squadId} />
      )}
    </div>
  );
}
