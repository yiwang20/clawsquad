import BetterSqlite3 from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { AgentStatus } from "@clawsquad/shared";

export interface SquadRow {
  id: string;
  name: string;
  mission: string;
  working_directory: string;
  created_at: string;
}

export interface AgentRow {
  id: string;
  squad_id: string;
  role_name: string;
  role_description: string | null;
  model: string;
  permission_mode: string;
  working_directory: string;
  system_prompt: string;
  session_id: string | null;
  status: string;
  created_at: string;
  last_active_at: string | null;
  /** Optional spend cap in USD, stored as NULL when not set. */
  max_budget_usd: number | null;
}

export interface MessageRow {
  id: number;
  agent_id: string;
  role: string;
  type: string;
  content: string;
  created_at: string;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS squads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mission TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  role_description TEXT,
  model TEXT NOT NULL DEFAULT 'sonnet',
  permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions',
  working_directory TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at TEXT NOT NULL,
  last_active_at TEXT,
  max_budget_usd REAL
);

CREATE INDEX IF NOT EXISTS idx_agents_squad ON agents(squad_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id, created_at);

-- V2 placeholder: squad templates
CREATE TABLE IF NOT EXISTS squad_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  mission_template TEXT NOT NULL,
  agent_configs TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- V2 placeholder: agent-to-agent messaging
CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  from_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  to_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent_id, status);

-- V2 placeholder: task board
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  owner_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_squad ON tasks(squad_id, status);
`;

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new BetterSqlite3(dbPath);
  }

  /** Run schema migrations and reset in-flight agent statuses. Called once on startup. */
  migrate(): void {
    this.db.exec(SCHEMA);
    // Add columns introduced after the initial schema — CREATE TABLE IF NOT EXISTS
    // is a no-op on existing databases, so new columns must be added via ALTER TABLE.
    this.addColumnIfMissing("agents", "max_budget_usd", "REAL");
    // On server restart, agents stuck in 'running'/'waiting' must be reset to 'stopped'
    // so users can cleanly restart them rather than seeing stale "running" state.
    this.resetRunningAgents();
  }

  /**
   * Add a column to a table if it doesn't already exist.
   * Uses PRAGMA table_info to check — SQLite has no ALTER TABLE ADD COLUMN IF NOT EXISTS.
   */
  private addColumnIfMissing(table: string, column: string, type: string): void {
    const columns = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) {
      this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    }
  }

  // ─── Squad operations ──────────────────────────────────────────────────────

  insertSquad(row: SquadRow): void {
    this.db
      .prepare(
        `INSERT INTO squads (id, name, mission, working_directory, created_at)
         VALUES (@id, @name, @mission, @working_directory, @created_at)`
      )
      .run(row);
  }

  getSquad(id: string): SquadRow | undefined {
    return this.db
      .prepare(`SELECT * FROM squads WHERE id = ?`)
      .get(id) as SquadRow | undefined;
  }

  listSquads(): SquadRow[] {
    return this.db
      .prepare(`SELECT * FROM squads ORDER BY created_at DESC`)
      .all() as SquadRow[];
  }

  updateSquad(id: string, fields: Partial<Pick<SquadRow, "name" | "mission">>): void {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (fields.name !== undefined) { updates.push("name = ?"); params.push(fields.name); }
    if (fields.mission !== undefined) { updates.push("mission = ?"); params.push(fields.mission); }
    if (updates.length === 0) return;
    params.push(id);
    this.db.prepare(`UPDATE squads SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  }

  deleteSquad(id: string): void {
    this.db.prepare(`DELETE FROM squads WHERE id = ?`).run(id);
  }

  // ─── Agent operations ──────────────────────────────────────────────────────

  insertAgent(row: AgentRow): void {
    this.db
      .prepare(
        `INSERT INTO agents
           (id, squad_id, role_name, role_description, model, permission_mode,
            working_directory, system_prompt, session_id, status, created_at, last_active_at,
            max_budget_usd)
         VALUES
           (@id, @squad_id, @role_name, @role_description, @model, @permission_mode,
            @working_directory, @system_prompt, @session_id, @status, @created_at, @last_active_at,
            @max_budget_usd)`
      )
      .run(row);
  }

  getAgent(id: string): AgentRow | undefined {
    return this.db
      .prepare(`SELECT * FROM agents WHERE id = ?`)
      .get(id) as AgentRow | undefined;
  }

  listAgentsBySquad(squadId: string): AgentRow[] {
    return this.db
      .prepare(`SELECT * FROM agents WHERE squad_id = ? ORDER BY created_at ASC`)
      .all(squadId) as AgentRow[];
  }

  updateAgentStatus(id: string, status: AgentStatus, lastActiveAt?: string): void {
    if (lastActiveAt !== undefined) {
      this.db
        .prepare(`UPDATE agents SET status = ?, last_active_at = ? WHERE id = ?`)
        .run(status, lastActiveAt, id);
    } else {
      this.db.prepare(`UPDATE agents SET status = ? WHERE id = ?`).run(status, id);
    }
  }

  updateAgentSessionId(id: string, sessionId: string): void {
    this.db
      .prepare(`UPDATE agents SET session_id = ? WHERE id = ?`)
      .run(sessionId, id);
  }

  deleteAgent(id: string): void {
    this.db.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
  }

  /**
   * On server restart, reset any agents stuck in 'running' or 'waiting' back to 'stopped'.
   * Called once during startup after migrate().
   */
  resetRunningAgents(): void {
    this.db
      .prepare(
        `UPDATE agents SET status = 'stopped' WHERE status IN ('running', 'waiting')`
      )
      .run();
  }

  // ─── Message operations ────────────────────────────────────────────────────

  insertMessage(row: Omit<MessageRow, "id">): number {
    const result = this.db
      .prepare(
        `INSERT INTO messages (agent_id, role, type, content, created_at)
         VALUES (@agent_id, @role, @type, @content, @created_at)`
      )
      .run(row);
    return result.lastInsertRowid as number;
  }

  listMessages(
    agentId: string,
    limit: number,
    offset: number
  ): MessageRow[] {
    return this.db
      .prepare(
        `SELECT * FROM messages WHERE agent_id = ?
         ORDER BY created_at ASC
         LIMIT ? OFFSET ?`
      )
      .all(agentId, limit, offset) as MessageRow[];
  }

  countMessages(agentId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM messages WHERE agent_id = ?`)
      .get(agentId) as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}
