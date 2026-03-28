import type { AgentStatus, SquadStatus } from "@clawsquad/shared";

/* ─── Status label map ──────────────────────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  idle: "Not started",
  ready: "Ready",
  running: "Working\u2026",
  waiting: "Ready for input",
  active: "Active",
  stopped: "Stopped",
  error: "Error",
};

/* ─── Props ─────────────────────────────────────────────────────────────────── */

interface StatusBadgeProps {
  status: AgentStatus | SquadStatus;
  /** @default "md" */
  size?: "sm" | "md";
  /** "dot" renders just the indicator circle; "badge" renders pill with label.
   *  @default "badge" */
  variant?: "dot" | "badge";
  /** Override the default label text */
  label?: string;
  /** Extra content shown after the label (e.g. agent count) */
  suffix?: string;
  className?: string;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function StatusBadge({
  status,
  size = "md",
  variant = "badge",
  label,
  suffix,
  className,
}: StatusBadgeProps) {
  const displayLabel = label ?? STATUS_LABELS[status] ?? status;

  if (variant === "dot") {
    return (
      <span
        className={`status-dot${size === "sm" ? " status-dot-sm" : ""}${className ? ` ${className}` : ""}`}
        data-status={status}
        role="status"
        aria-label={displayLabel}
        title={displayLabel}
      />
    );
  }

  return (
    <span
      className={`status-badge${size === "sm" ? " status-badge-sm" : ""}${className ? ` ${className}` : ""}`}
      data-status={status}
      role="status"
    >
      {displayLabel}
      {suffix && (
        <span style={{ opacity: 0.7, marginLeft: "2px" }}>{suffix}</span>
      )}
    </span>
  );
}
