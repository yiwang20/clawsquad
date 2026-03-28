// ─── Squad status ─────────────────────────────────────────────────────────────

/**
 * Derived from agent statuses (not stored in DB — computed at query time):
 * - "ready"   — all agents idle (squad created, not yet started)
 * - "running" — at least one agent is running
 * - "active"  — at least one agent is waiting (between turns, alive)
 * - "stopped" — all agents stopped
 * - "error"   — at least one agent has errored
 */
export type SquadStatus = "ready" | "running" | "active" | "stopped" | "error";

export const SQUAD_STATUS = {
  READY: "ready",
  RUNNING: "running",
  ACTIVE: "active",
  STOPPED: "stopped",
  ERROR: "error",
} as const satisfies Record<string, SquadStatus>;

// ─── Agent status ─────────────────────────────────────────────────────────────

/**
 * - "idle"    — not yet started
 * - "running" — actively processing a prompt turn
 * - "waiting" — between turns, alive and ready for input
 * - "stopped" — process exited cleanly
 * - "error"   — process exited unexpectedly
 */
export type AgentStatus = "idle" | "running" | "waiting" | "stopped" | "error";

export const AGENT_STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  WAITING: "waiting",
  STOPPED: "stopped",
  ERROR: "error",
} as const satisfies Record<string, AgentStatus>;

// ─── Model defaults ───────────────────────────────────────────────────────────

export type DefaultModel = "sonnet" | "opus" | "haiku";

export const DEFAULT_MODEL: DefaultModel = "sonnet";

// ─── Permission modes ─────────────────────────────────────────────────────────

export type PermissionMode = "plan" | "auto" | "bypassPermissions";

export const PERMISSION_MODE = {
  PLAN: "plan",
  AUTO: "auto",
  BYPASS: "bypassPermissions",
} as const satisfies Record<string, PermissionMode>;

/** V1 default: permissive mode avoids requiring a permission-approval UI. */
export const DEFAULT_PERMISSION_MODE: PermissionMode = "bypassPermissions";

// ─── Process / output limits ──────────────────────────────────────────────────

/** Maximum agents per squad. */
export const MAX_AGENTS_PER_SQUAD = 10;

/** Maximum concurrent agent processes across all squads. */
export const MAX_CONCURRENT_AGENTS_TOTAL = 20;

/**
 * Number of StreamMessages to keep in the per-agent in-memory output buffer.
 * Older messages are dropped from memory but remain persisted in SQLite.
 */
export const MAX_OUTPUT_BUFFER_SIZE = 1000;

// ─── API ──────────────────────────────────────────────────────────────────────

export const API_BASE_PATH = "/api";

export const SQUADS_PATH = `${API_BASE_PATH}/squads`;

export const AGENTS_PATH = `${API_BASE_PATH}/agents`;

// ─── WebSocket ────────────────────────────────────────────────────────────────

export const WS_PATH = "/ws";

/** Reconnect delay constants for exponential backoff (ms). */
export const WS_RECONNECT_BASE_DELAY_MS = 1_000;
export const WS_RECONNECT_MAX_DELAY_MS = 30_000;
export const WS_RECONNECT_MULTIPLIER = 2;

// ─── SQLite ───────────────────────────────────────────────────────────────────

export const DB_PATH = "./data/clawsquad.db";

// ─── Workspace ────────────────────────────────────────────────────────────────

/** Default working directory for non-dev squads. Created on first run. */
export const DEFAULT_WORKSPACE_DIR = "~/clawsquad-workspace";
