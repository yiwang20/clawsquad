import { useEffect, useCallback, useState } from "react";
import { useSquadStore, ApiError } from "../stores/squadStore";
import { AGENTS_PATH, type AgentStatus } from "@clawsquad/shared";
import { toast } from "../stores/toastStore";
import { StatusBadge } from "../components/StatusBadge";
import { OutputFeed } from "../components/OutputFeed";
import { PromptInput } from "../components/PromptInput";

/* ─── Props ─────────────────────────────────────────────────────────────────── */

interface AgentDetailPageProps {
  squadId: string;
  agentId: string;
  onNavigateHome: () => void;
  onNavigateToSquad: (squadId: string) => void;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function AgentDetailPage({
  squadId,
  agentId,
  onNavigateHome,
  onNavigateToSquad,
}: AgentDetailPageProps) {
  const squad = useSquadStore((s) => s.squads.get(squadId));
  const agent = useSquadStore((s) => s.agents.get(agentId));
  const outputMessages = useSquadStore(
    (s) => s.outputBuffers.get(agentId) ?? [],
  );
  const fetchSquad = useSquadStore((s) => s.fetchSquad);
  const fetchAgentMessages = useSquadStore((s) => s.fetchAgentMessages);
  const sendPrompt = useSquadStore((s) => s.sendPrompt);
  const abortAgent = useSquadStore((s) => s.abortAgent);
  const startAgent = useSquadStore((s) => s.startAgent);
  const stopAgent = useSquadStore((s) => s.stopAgent);

  const [actionLoading, setActionLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Fetch squad (and agents) on mount if not already loaded
  useEffect(() => {
    if (squad) return;
    setNotFound(false);
    fetchSquad(squadId).catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        toast.error("Failed to load agent details");
      }
    });
  }, [squad, fetchSquad, squadId]);

  // Fetch historical messages on mount if the output buffer is empty
  useEffect(() => {
    if (outputMessages.length > 0) return;
    fetchAgentMessages(agentId).catch(() => {
      // Non-fatal — live WS messages will still arrive
    });
  }, [agentId, fetchAgentMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll agent status every 5 seconds as fallback when WS might miss events
  useEffect(() => {
    if (!agent) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${AGENTS_PATH}/${agentId}`);
        if (res.ok) {
          const data = await res.json() as { status: string };
          const currentAgent = useSquadStore.getState().agents.get(agentId);
          if (currentAgent && currentAgent.status !== data.status) {
            useSquadStore.getState().updateAgentStatus(agentId, data.status as AgentStatus);
          }
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [agentId, agent]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleSendPrompt = useCallback(
    (text: string) => {
      sendPrompt(agentId, text);
    },
    [sendPrompt, agentId],
  );

  const handleAbort = useCallback(() => {
    abortAgent(agentId);
  }, [abortAgent, agentId]);

  const handleStart = useCallback(async () => {
    setActionLoading(true);
    try {
      await startAgent(agentId);
    } catch {
      toast.error("Failed to start agent");
    } finally {
      setActionLoading(false);
    }
  }, [startAgent, agentId]);

  const handleStop = useCallback(async () => {
    setActionLoading(true);
    try {
      await stopAgent(agentId);
    } catch {
      toast.error("Failed to stop agent");
    } finally {
      setActionLoading(false);
    }
  }, [stopAgent, agentId]);

  // ── Not found ────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="main" style={{ textAlign: "center", paddingTop: "var(--space-16)" }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
          Agent not found
        </div>
        <div style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)", marginBottom: "var(--space-6)" }}>
          This agent or squad may have been deleted.
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigateToSquad(squadId)}>
            Back to Squad
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNavigateHome}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Agent not found (squad loaded but agent absent) ─────────────────────
  if (squad && !agent) {
    return (
      <div className="main" style={{ textAlign: "center", paddingTop: "var(--space-16)" }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
          Agent not found
        </div>
        <div style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)", marginBottom: "var(--space-6)" }}>
          This agent may have been deleted or the link is invalid.
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigateToSquad(squadId)}>
            Back to Squad
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNavigateHome}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (!agent || !squad) {
    return (
      <div className="main">
        <div className="loading-state">
          <div className="loading-state-spinner" />
          <span>Loading agent…</span>
        </div>
      </div>
    );
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const isRunning = agent.status === "running";
  const canStart =
    agent.status === "idle" || agent.status === "stopped" || agent.status === "error";
  const canStop =
    agent.status === "running" || agent.status === "waiting";

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="main" style={{ padding: 0, display: "flex", flexDirection: "column", height: "calc(100vh - var(--header-height))" }}>
      {/* Breadcrumb bar */}
      <div
        style={{
          padding: "var(--space-3) var(--space-6)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <nav className="breadcrumbs">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigateHome();
            }}
          >
            Home
          </a>
          <span className="breadcrumbs-separator">/</span>
          <a
            href={`/squads/${squadId}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigateToSquad(squadId);
            }}
          >
            {squad.name}
          </a>
          <span className="breadcrumbs-separator">/</span>
          <span className="breadcrumbs-current">{agent.roleName}</span>
        </nav>
      </div>

      {/* Agent header */}
      <div className="agent-detail-header" style={{ padding: "var(--space-3) var(--space-6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
          <h1
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--color-text-primary)",
            }}
          >
            {agent.roleName}
          </h1>
          <StatusBadge status={agent.status} />
          <span className="model-badge">{agent.model}</span>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
          {canStart && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={actionLoading}
              onClick={handleStart}
            >
              {actionLoading ? "Starting..." : agent.status === "idle" ? "Start" : "Restart"}
            </button>
          )}
          {canStop && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={actionLoading}
              onClick={handleStop}
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Output feed — takes all available space */}
      <div className="agent-detail-output">
        <OutputFeed
          messages={outputMessages}
          isRunning={isRunning}
          height="100%"
        />
      </div>

      {/* Prompt input — pinned at bottom */}
      <PromptInput
        agentStatus={agent.status}
        onSend={handleSendPrompt}
        onAbort={handleAbort}
      />
    </div>
  );
}
