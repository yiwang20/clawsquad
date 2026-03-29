import { QUICK_STARTS } from "../data/quickStarts";

/* ─── Props ─────────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  /** Opens the squad creator with no pre-fill */
  onCreateSquad: () => void;
  /** Opens the squad creator with a quick-start pre-fill */
  onQuickStart?: (template: string) => void;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function EmptyState({ onCreateSquad, onQuickStart }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div
        className="empty-state-icon"
        style={{
          width: "3.5rem",
          height: "3.5rem",
          borderRadius: "var(--radius-xl)",
          background: "var(--color-accent-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "var(--space-2)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8M12 8v8" />
        </svg>
      </div>

      <h2 className="empty-state-title">Build Your Squad</h2>

      <p className="empty-state-description">
        Assemble a team of AI agents, give them a mission, and watch them work
        together. Each agent gets a role and works independently on their part.
      </p>

      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={onCreateSquad}
        style={{ marginTop: "var(--space-2)" }}
      >
        Create Your Squad
      </button>

      {onQuickStart && (
        <>
          <div
            className="divider-label"
            style={{ marginTop: "var(--space-8)", width: "100%", maxWidth: "28rem" }}
          >
            or try a quick start
          </div>

          <div
            className="quick-start-grid"
            style={{ marginTop: "var(--space-4)", width: "100%" }}
          >
            {QUICK_STARTS.map((qs) => (
              <button
                key={qs.title}
                type="button"
                className="quick-start-card"
                onClick={() => onQuickStart(qs.title)}
              >
                <div className="quick-start-card-title">{qs.title}</div>
                <div className="quick-start-card-meta">
                  {qs.agentCount} agents &middot; {qs.roles}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
