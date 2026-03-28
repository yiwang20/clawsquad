import { useEffect, useCallback, useState, useRef } from "react";
import { useSquadStore, ApiError } from "../stores/squadStore";
import { toast } from "../stores/toastStore";
import { StatusBadge } from "../components/StatusBadge";
import { OutputFeed } from "../components/OutputFeed";

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
  const sendPrompt = useSquadStore((s) => s.sendPrompt);
  const abortAgent = useSquadStore((s) => s.abortAgent);
  const startAgent = useSquadStore((s) => s.startAgent);
  const stopAgent = useSquadStore((s) => s.stopAgent);

  const [promptText, setPromptText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`; // max ~4 lines
  }, [promptText]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = promptText.trim();
    if (!text || !agent) return;
    sendPrompt(agentId, text);
    setPromptText("");
  }, [promptText, agent, sendPrompt, agentId]);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

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
  const canSend =
    agent.status === "running" || agent.status === "waiting";
  const canStart =
    agent.status === "idle" || agent.status === "stopped";
  const canStop =
    agent.status === "running" || agent.status === "waiting";

  const disabledReason =
    agent.status === "idle"
      ? "Start the agent to send prompts"
      : agent.status === "stopped"
        ? "Agent is stopped — restart to continue"
        : agent.status === "error"
          ? "Agent encountered an error — restart to retry"
          : null;

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
              className="btn btn-success btn-sm"
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
      {canSend ? (
        <div className="prompt-input-container">
          <textarea
            ref={textareaRef}
            className="prompt-input"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message... (Enter to send, Shift+Enter for newline)"
            rows={1}
          />
          <div className="prompt-actions">
            <button
              type="button"
              className="prompt-send-btn"
              disabled={!promptText.trim()}
              onClick={handleSend}
              title="Send prompt"
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M14 2L7 9M14 2l-4.5 12-2-5.5L2 6.5 14 2z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isRunning && (
              <button
                type="button"
                className="prompt-abort-btn"
                onClick={handleAbort}
                title="Abort current task"
                aria-label="Abort"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect
                    x="3"
                    y="3"
                    width="8"
                    height="8"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="prompt-input-disabled-overlay">
          <StatusBadge status={agent.status} variant="dot" size="sm" />
          <span>{disabledReason}</span>
        </div>
      )}
    </div>
  );
}
