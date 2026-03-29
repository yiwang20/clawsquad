# V2: Agent Coordination — Design Document

## Problem Statement

ClawSquad V1 agents are isolated: each is an independent Claude CLI process sharing a working directory but with **no mechanism to coordinate**. They cannot divide work, share status, or communicate. This leads to duplicated effort, conflicting changes, and no visibility into squad-level progress.

V2 adds four capabilities — Task Board, Agent Messaging, CLI Command Injection, and Progress Dashboard — that let agents self-organize through a simple command protocol embedded in their output stream.

## Scope & Constraints

- **In scope:** Task CRUD, agent-to-agent messaging, CLI command parsing, progress UI
- **Out of scope:** Task dependencies/blocking (deferred to V3), agent auto-scaling, external integrations
- **Must not break:** Existing squad/agent CRUD, process lifecycle, WebSocket streaming, session resume
- **Architecture constraint:** Agents communicate via `[COMMAND]` markers in stdout, parsed by the backend. No direct IPC, no sidecar processes, no modifications to the Claude CLI itself.
- **Storage:** SQLite (existing `better-sqlite3` setup)
- **CLI format:** `claude --print --output-format stream-json --input-format stream-json`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  ┌──────────┐ ┌──────────────┐ ┌───────────────────────┐   │
│  │ TaskBoard │ │ AgentInbox   │ │ ProgressDashboard     │   │
│  │ (Kanban)  │ │ (Messages)   │ │ (Charts / Indicators) │   │
│  └────┬─────┘ └──────┬───────┘ └───────────┬───────────┘   │
│       │               │                     │                │
│       └───────────────┼─────────────────────┘                │
│                       │ WebSocket + REST                     │
├───────────────────────┼─────────────────────────────────────┤
│                    Backend (Express)                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              CommandInterceptor                       │    │
│  │  Listens to ProcessManager "agent:message" events    │    │
│  │  Parses [COMMAND ...] patterns from assistant text   │    │
│  │  Executes: TaskStore / AgentMessageStore mutations   │    │
│  │  Notifies: WebSocketHub for real-time UI updates     │    │
│  └──────────────────────┬──────────────────────────────┘    │
│           ┌──────────────┼──────────────┐                    │
│     ┌─────┴─────┐  ┌────┴────┐  ┌──────┴──────────┐        │
│     │ TaskStore  │  │AgentMsg │  │ ProcessManager   │        │
│     │ (SQLite)   │  │Store    │  │ (existing)       │        │
│     └────────────┘  └─────────┘  └─────────────────┘        │
├──────────────────────────────────────────────────────────────┤
│                    SQLite Database                            │
│  tasks | agent_messages | squads | agents | messages         │
└──────────────────────────────────────────────────────────────┘
```

**Key flow:** Agent stdout -> ProcessManager emits `agent:message` -> CommandInterceptor scans text content for `[COMMAND ...]` patterns -> executes side effects (DB writes, WS broadcasts) -> agent continues unaware.

---

## 1. Database Schema Changes

The existing schema already has placeholder `tasks` and `agent_messages` tables. We need to **evolve** them slightly and add a `dependencies` column to tasks.

### tasks table (modify existing)

```sql
-- Drop and recreate (V2 migration) — or ALTER TABLE if data must be preserved.
-- Since V1 never wrote to this table, a DROP + CREATE is safe.
DROP TABLE IF EXISTS tasks;

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  squad_id    TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | in_progress | completed
  assignee_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_by  TEXT REFERENCES agents(id) ON DELETE SET NULL,
  depends_on  TEXT DEFAULT '[]',                  -- JSON array of task IDs
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_squad ON tasks(squad_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
```

**Design decisions:**
- `depends_on` stored as JSON array string rather than a join table. Simpler, and we never need to query "all tasks that depend on X" in SQL — the frontend renders it client-side.
- `created_by` tracks which agent created the task (useful for progress dashboard).
- Status enum is `pending | in_progress | completed`. Kept minimal — no `blocked` status in V2 (dependencies are informational only).

### agent_messages table (modify existing)

```sql
DROP TABLE IF EXISTS agent_messages;

CREATE TABLE IF NOT EXISTS agent_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  squad_id      TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  from_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent_id   TEXT REFERENCES agents(id) ON DELETE CASCADE,  -- NULL = broadcast
  content       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_messages_squad ON agent_messages(squad_id, created_at);
```

**Design decisions:**
- Removed `status` column — V1 had `pending`/`read` but we don't need read receipts. Messages are fire-and-forget; the receiving agent sees them when polled via the injected `[CHECK_MESSAGES]` command.
- `to_agent_id = NULL` means broadcast to all agents in the squad.
- Changed `ON DELETE SET NULL` to `ON DELETE CASCADE` for `from_agent_id` — if an agent is removed, its messages should be cleaned up.

---

## 2. Backend Service Changes

### 2a. New service: `TaskStore` (`packages/backend/src/services/TaskStore.ts`)

Thin wrapper over Database for task CRUD. Follows the same pattern as `MessageStore`.

```typescript
export interface TaskRow {
  id: string;
  squad_id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignee_id: string | null;
  created_by: string | null;
  depends_on: string;  // JSON array
  created_at: string;
  updated_at: string;
}

export interface TaskStore {
  createTask(squadId: string, title: string, description: string, createdBy: string | null): TaskRow;
  listTasks(squadId: string): TaskRow[];
  getTask(taskId: string): TaskRow | undefined;
  claimTask(taskId: string, agentId: string): TaskRow | undefined;
  completeTask(taskId: string): TaskRow | undefined;
  updateTaskStatus(taskId: string, status: string): TaskRow | undefined;
}
```

Methods are synchronous (better-sqlite3 is sync). Each mutation returns the updated row so callers can broadcast it.

### 2b. New service: `AgentMessageStore` (`packages/backend/src/services/AgentMessageStore.ts`)

```typescript
export interface AgentMessageRow {
  id: number;
  squad_id: string;
  from_agent_id: string;
  to_agent_id: string | null;
  content: string;
  created_at: string;
}

export interface AgentMessageStore {
  sendMessage(squadId: string, fromAgentId: string, toAgentId: string, content: string): AgentMessageRow;
  broadcastMessage(squadId: string, fromAgentId: string, content: string): AgentMessageRow;
  getMessagesForAgent(agentId: string, since?: string): AgentMessageRow[];
  getSquadMessages(squadId: string, limit?: number): AgentMessageRow[];
}
```

`getMessagesForAgent` returns messages where `to_agent_id = agentId OR to_agent_id IS NULL` (direct + broadcasts), ordered by `created_at ASC`. The optional `since` parameter filters to messages after a given timestamp (so agents only see new messages).

### 2c. New service: `CommandInterceptor` (`packages/backend/src/services/CommandInterceptor.ts`)

This is the **core new component**. It:

1. Listens to `ProcessManager` `agent:message` events
2. For messages with `type === "assistant"`, extracts text content and scans for `[COMMAND ...]` patterns
3. Executes the corresponding action
4. Broadcasts updates via WebSocketHub

```typescript
export class CommandInterceptor {
  constructor(
    private processManager: ProcessManager,
    private taskStore: TaskStore,
    private agentMessageStore: AgentMessageStore,
    private squadManager: SquadManager,
    private wsHub: WebSocketHub,
    private db: Database
  ) {
    this.processManager.on("agent:message", this.handleMessage.bind(this));
  }

  private handleMessage(agentId: string, data: StreamMessage): void {
    // Only scan assistant text messages for commands
    if (data.type !== "assistant") return;

    const text = this.extractText(data);
    if (!text) return;

    const commands = this.parseCommands(text);
    for (const cmd of commands) {
      this.executeCommand(agentId, cmd);
    }
  }

  private extractText(data: StreamMessage): string | null {
    // stream-json assistant messages have content as string or content blocks
    if (typeof data.content === "string") return data.content;
    if (Array.isArray(data.content)) {
      return data.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
    }
    return null;
  }
}
```

**Command parsing** uses a simple regex: `/\[([A-Z_]+)(?:\s+(.+?))?\]/g`

This matches `[COMMAND]` or `[COMMAND arg1 arg2 ...]`. Arguments are split by whitespace, with quoted strings preserved.

### 2d. Modify `SquadManager.generateSystemPrompt()`

The system prompt generator must be updated to inject the coordination commands documentation. See Section 5 for the full template.

### 2e. Modify `Database.migrate()`

Add a V2 migration step that drops and recreates the placeholder `tasks` and `agent_messages` tables with the new schema. Since V1 never wrote to these tables, this is safe.

```typescript
migrate(): void {
  this.db.exec(SCHEMA);  // V1 schema (CREATE IF NOT EXISTS — idempotent)
  this.migrateV2();       // Drop+recreate placeholder tables
  this.addColumnIfMissing("agents", "max_budget_usd", "REAL");
  this.resetRunningAgents();
}

private migrateV2(): void {
  // Safe to drop — V1 never wrote to these tables
  this.db.exec(`
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS agent_messages;

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      assignee_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      created_by TEXT REFERENCES agents(id) ON DELETE SET NULL,
      depends_on TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_squad ON tasks(squad_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

    CREATE TABLE IF NOT EXISTS agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
      from_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      to_agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_squad ON agent_messages(squad_id, created_at);
  `);
}
```

---

## 3. API Endpoint Additions

### Task endpoints (new router: `packages/backend/src/routes/tasks.ts`)

Mount at `/api/squads/:squadId/tasks`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/squads/:squadId/tasks` | List all tasks for a squad |
| `POST` | `/api/squads/:squadId/tasks` | Create a task (from UI) |
| `PATCH` | `/api/squads/:squadId/tasks/:taskId` | Update task (status, assignee, etc.) |
| `DELETE` | `/api/squads/:squadId/tasks/:taskId` | Delete a task |

Request/response shapes:

```typescript
// POST /api/squads/:squadId/tasks
interface CreateTaskRequest {
  title: string;
  description?: string;
  assigneeId?: string;
  dependsOn?: string[];
}

// PATCH /api/squads/:squadId/tasks/:taskId
interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  assigneeId?: string | null;
  dependsOn?: string[];
}

// Response shape (all endpoints)
interface TaskResponse {
  id: string;
  squadId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  assigneeId: string | null;
  createdBy: string | null;
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Agent message endpoints (new router: `packages/backend/src/routes/agentMessages.ts`)

Mount at `/api/squads/:squadId/messages`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/squads/:squadId/messages` | List all inter-agent messages for a squad |
| `GET` | `/api/squads/:squadId/messages?agentId=X` | Messages for a specific agent |

These are read-only from the UI. Agents create messages via CLI commands; the UI only displays them.

### WebSocket additions

New server-to-client message types:

```typescript
// Add to WSServerMessage union
| { type: "task:created"; squadId: string; task: TaskResponse }
| { type: "task:updated"; squadId: string; task: TaskResponse }
| { type: "task:deleted"; squadId: string; taskId: string }
| { type: "agent_message:created"; squadId: string; message: AgentMessageRow }
```

These are broadcast to all clients subscribed to the squad.

---

## 4. Frontend Component Additions

### 4a. `TaskBoard` component (`packages/frontend/src/components/TaskBoard.tsx`)

Kanban-style board with three columns: Pending, In Progress, Completed.

- Each card shows: title, description (truncated), assignee badge (agent role name + color), dependency indicators
- Cards are draggable between columns (optional V2 enhancement — can start with click-to-update)
- "Add Task" button at top of Pending column (creates via REST, not via agent command)
- Real-time updates via WebSocket `task:*` events

### 4b. `AgentInbox` component (`packages/frontend/src/components/AgentInbox.tsx`)

A panel (or tab) on the Squad Detail page showing inter-agent messages.

- Chronological message list with sender/recipient badges
- Filter by agent (show messages to/from a specific agent)
- Broadcast messages highlighted differently
- Auto-scrolls to latest

### 4c. `ProgressDashboard` component (`packages/frontend/src/components/ProgressDashboard.tsx`)

Summary panel at the top of Squad Detail page:

- **Task progress bar:** X of Y tasks completed (segmented by status)
- **Agent utilization:** For each agent, show current status + assigned task count
- **Activity feed:** Recent task state changes and messages (last 10 events)

### 4d. Modifications to existing components

- **`SquadDetailPage.tsx`:** Add TabBar or sections for "Agents" | "Tasks" | "Messages" | "Progress"
- **`squadStore.ts`:** Add state for `tasks: Map<string, TaskResponse[]>` (keyed by squadId), `agentMessages: Map<string, AgentMessageRow[]>`, and corresponding fetch/update actions
- **`useWebSocket.ts`:** Handle new `task:*` and `agent_message:*` event types
- **Shared types (`types.ts`):** Add `TaskResponse`, `AgentMessageRow`, `CreateTaskRequest`, `UpdateTaskRequest` to shared package

---

## 5. System Prompt Template for CLI Command Injection

This replaces the current `SquadManager.generateSystemPrompt()` output. The commands section is appended to every agent's system prompt.

```
You are the {roleName} on a squad working on: {mission}.
{roleDescription ? `Your specific focus: ${roleDescription}.` : ''}

## Your Squad

You are working alongside other agents in this squad:
{for each other agent: "- {roleName} (ID: {id}): {roleDescription || 'General'}"}

## Coordination Commands

You can coordinate with your squad by including these commands in your responses.
The system will detect and execute them automatically. Place each command on its own line.

### Task Management
- `[TASK_CREATE "title" "description"]` — Create a new task on the squad task board
- `[TASK_LIST]` — Show all current tasks and their statuses
- `[TASK_CLAIM taskId]` — Claim a task and mark it as in-progress
- `[TASK_COMPLETE taskId]` — Mark a task as completed
- `[TASK_UPDATE taskId "status"]` — Update task status (pending/in_progress/completed)

### Communication
- `[SEND_MESSAGE agentId "message text"]` — Send a message to a specific agent
- `[BROADCAST "message text"]` — Send a message to all agents in the squad
- `[CHECK_MESSAGES]` — Check your inbox for new messages

### Guidelines
- Break your work into tasks early so the squad has visibility.
- Claim tasks before starting work to avoid duplication.
- Mark tasks complete when done.
- Use SEND_MESSAGE to ask specific agents for help or share findings.
- Use BROADCAST for announcements that affect the whole squad.
- Check messages periodically to stay coordinated.

When your current task is complete, summarize what you accomplished and check for new tasks or messages.
```

**How commands reach agents:** When an agent outputs `[CHECK_MESSAGES]`, the `CommandInterceptor` reads the agent's inbox and **injects the messages as a follow-up prompt** via `ProcessManager.sendPrompt()`. Similarly, `[TASK_LIST]` causes the interceptor to send the current task list as a prompt. This creates a request-response loop without modifying the Claude CLI.

**Important:** The interceptor must NOT inject responses while the agent is mid-turn (status = "running"). It queues the response and delivers it when the agent reaches "waiting" state. This is already handled by `AgentProcess.sendPrompt()` which queues prompts during running state.

---

## 6. Detailed Command Execution Logic

For each command the `CommandInterceptor` handles:

| Command | Action | Response injected to agent |
|---------|--------|---------------------------|
| `[TASK_CREATE "t" "d"]` | `taskStore.createTask(squadId, t, d, agentId)` + WS broadcast | `"Task created: {id} — {title}"` |
| `[TASK_LIST]` | `taskStore.listTasks(squadId)` | Formatted task list as prompt |
| `[TASK_CLAIM id]` | `taskStore.claimTask(id, agentId)` + WS broadcast | `"Task {id} claimed."` or error |
| `[TASK_COMPLETE id]` | `taskStore.completeTask(id)` + WS broadcast | `"Task {id} marked complete."` |
| `[TASK_UPDATE id "s"]` | `taskStore.updateTaskStatus(id, s)` + WS broadcast | `"Task {id} updated to {s}."` |
| `[SEND_MESSAGE id "t"]` | `agentMessageStore.sendMessage(...)` + WS broadcast | `"Message sent to {roleName}."` |
| `[BROADCAST "t"]` | `agentMessageStore.broadcastMessage(...)` + WS broadcast | `"Broadcast sent."` |
| `[CHECK_MESSAGES]` | `agentMessageStore.getMessagesForAgent(agentId, lastChecked)` | Formatted message list or `"No new messages."` |

**Response injection format:** The response is sent as a user-role prompt to the agent via `processManager.sendPrompt(agentId, responseText)`. This appears in the agent's conversation as if a user sent it, keeping the agent in its normal conversational flow.

**Error handling:** If a command fails (e.g., task not found), inject an error message: `"[ERROR] Task {id} not found."` — the agent can then self-correct.

---

## 7. Implementation Plan

Tasks are ordered by dependency. Each task includes files to create/modify, acceptance criteria, and estimated scope.

### Phase 1: Data Layer (no dependencies)

#### Task 1.1: V2 Database Migration
**Files:** `packages/backend/src/services/Database.ts`
**What:** Add `migrateV2()` method. Drop and recreate `tasks` and `agent_messages` tables with new schema. Call from `migrate()`.
**Acceptance criteria:** Server starts cleanly. New tables exist with correct columns and indexes. Existing tables unaffected.

#### Task 1.2: TaskStore Service
**Files:** Create `packages/backend/src/services/TaskStore.ts`, add interface to `packages/backend/src/services/types.ts`
**What:** Implement `TaskStore` class with `createTask`, `listTasks`, `getTask`, `claimTask`, `completeTask`, `updateTaskStatus` methods. All methods are synchronous (better-sqlite3).
**Acceptance criteria:** Unit tests pass for all CRUD operations including edge cases (claim already-claimed task, complete non-existent task).

#### Task 1.3: AgentMessageStore Service
**Files:** Create `packages/backend/src/services/AgentMessageStore.ts`, add interface to `packages/backend/src/services/types.ts`
**What:** Implement `AgentMessageStore` class with `sendMessage`, `broadcastMessage`, `getMessagesForAgent`, `getSquadMessages` methods.
**Acceptance criteria:** Unit tests pass. Broadcast messages returned for all agents. Direct messages only returned for recipient.

### Phase 2: Shared Types (depends on Phase 1 design)

#### Task 2.1: Shared Type Definitions
**Files:** `packages/shared/src/types.ts`
**What:** Add `TaskResponse`, `CreateTaskRequest`, `UpdateTaskRequest`, `AgentMessageResponse` types. Add new `WSServerMessage` variants for `task:created`, `task:updated`, `task:deleted`, `agent_message:created`.
**Acceptance criteria:** Shared package compiles. Types are importable from both frontend and backend.

### Phase 3: API Layer (depends on Phase 1 + 2)

#### Task 3.1: Task REST Endpoints
**Files:** Create `packages/backend/src/routes/tasks.ts`, modify `packages/backend/src/server.ts`
**What:** Implement GET/POST/PATCH/DELETE for `/api/squads/:squadId/tasks`. Wire into Express app.
**Acceptance criteria:** All endpoints return correct responses. 404 for missing squad/task. Validation for required fields.

#### Task 3.2: Agent Message REST Endpoints
**Files:** Create `packages/backend/src/routes/agentMessages.ts`, modify `packages/backend/src/server.ts`
**What:** Implement GET endpoints for `/api/squads/:squadId/agent-messages`. Support `?agentId=X` filter.
**Acceptance criteria:** Returns messages filtered correctly. Broadcasts included in per-agent queries.

#### Task 3.3: WebSocket Event Broadcasting
**Files:** `packages/backend/src/ws/WebSocketHub.ts`
**What:** Add helper methods `broadcastTaskEvent` and `broadcastAgentMessageEvent` that send the new event types to squad subscribers.
**Acceptance criteria:** Clients subscribed to a squad receive task and message events in real-time.

### Phase 4: Command Interceptor (depends on Phase 1 + 3)

#### Task 4.1: CommandInterceptor Service
**Files:** Create `packages/backend/src/services/CommandInterceptor.ts`, modify `packages/backend/src/server.ts`
**What:** Implement the core command parsing and execution engine. Register as listener on ProcessManager events. Wire into server startup.
**Acceptance criteria:**
- Correctly parses all command types from assistant text
- Executes TASK_CREATE, TASK_LIST, TASK_CLAIM, TASK_COMPLETE, TASK_UPDATE
- Executes SEND_MESSAGE, BROADCAST, CHECK_MESSAGES
- Injects response prompts back to agents
- Broadcasts WS events for all mutations
- Handles malformed commands gracefully (logs warning, continues)
**Guardrails:**
- Must not modify `AgentProcess` or `ProcessManager` internals
- Must not block the event loop (all DB ops are sync via better-sqlite3, which is fine)
- Must validate that agent belongs to the squad before executing squad-scoped commands

#### Task 4.2: System Prompt Update
**Files:** `packages/backend/src/services/SquadManager.ts`
**What:** Update `generateSystemPrompt()` to include coordination commands documentation and squad member list.
**Acceptance criteria:** New agents get the updated prompt. Prompt includes teammate list with IDs and roles. All commands are documented.

### Phase 5: Frontend — Data Layer (depends on Phase 2 + 3)

#### Task 5.1: Store Extensions
**Files:** `packages/frontend/src/stores/squadStore.ts`
**What:** Add `tasks` and `agentMessages` state maps. Add fetch/create/update/delete actions for tasks. Add fetch action for agent messages.
**Acceptance criteria:** Store correctly manages task and message state. Optimistic updates where appropriate.

#### Task 5.2: WebSocket Handler Updates
**Files:** `packages/frontend/src/hooks/useWebSocket.ts`
**What:** Handle `task:created`, `task:updated`, `task:deleted`, `agent_message:created` events. Update store state accordingly.
**Acceptance criteria:** Real-time task and message updates appear without page refresh.

### Phase 6: Frontend — UI Components (depends on Phase 5)

#### Task 6.1: TaskBoard Component
**Files:** Create `packages/frontend/src/components/TaskBoard.tsx`
**What:** Three-column kanban board (Pending / In Progress / Completed). Task cards with title, description preview, assignee badge. "Add Task" form. Click-to-update status.
**Acceptance criteria:** Renders tasks in correct columns. Create task works. Status updates reflect immediately. Assignee shown with agent role name.

#### Task 6.2: AgentInbox Component
**Files:** Create `packages/frontend/src/components/AgentInbox.tsx`
**What:** Chronological message list. Sender/recipient badges. Broadcast indicator. Optional agent filter dropdown.
**Acceptance criteria:** Messages display correctly. Broadcasts distinguished visually. Filter works.

#### Task 6.3: ProgressDashboard Component
**Files:** Create `packages/frontend/src/components/ProgressDashboard.tsx`
**What:** Task completion progress bar. Per-agent status + task count indicators. Recent activity feed (last 10 task changes + messages).
**Acceptance criteria:** Progress bar accurate. Agent cards show correct counts. Activity feed updates in real-time.

#### Task 6.4: SquadDetailPage Integration
**Files:** `packages/frontend/src/pages/SquadDetailPage.tsx`
**What:** Add tab navigation: "Agents" (existing) | "Tasks" | "Messages" | "Overview" (progress dashboard). Fetch tasks and messages on mount. Subscribe to new WS events.
**Acceptance criteria:** All tabs render correctly. Data loads on tab switch. Real-time updates work across all tabs.

### Phase 7: Testing & Polish (depends on all above)

#### Task 7.1: Integration Tests
**Files:** Create `packages/backend/src/__tests__/CommandInterceptor.test.ts`, `packages/backend/src/__tests__/TaskStore.test.ts`, `packages/backend/src/__tests__/AgentMessageStore.test.ts`
**What:** Unit tests for all new services. Integration test for command parsing end-to-end.
**Acceptance criteria:** All tests pass. Edge cases covered (malformed commands, missing agents, concurrent claims).

#### Task 7.2: Styles & Responsive Polish
**Files:** `packages/frontend/src/styles/components.css`
**What:** CSS for TaskBoard kanban, message list, progress indicators. Ensure responsive on different screen sizes.
**Acceptance criteria:** Components look consistent with existing design. Usable on tablet-width screens.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agents don't reliably output `[COMMAND]` syntax | Medium | High | Clear, prominent documentation in system prompt. Test with multiple models (sonnet/opus). Consider few-shot examples in prompt. |
| Command parsing picks up false positives from code output | Low | Medium | Only scan `type: "assistant"` messages (not tool_use/tool_result). Commands use ALL_CAPS with brackets — unlikely in normal code. |
| Response injection creates conversation confusion | Medium | Medium | Keep injected responses short and clearly formatted. Prefix with `[SYSTEM]` to distinguish from user input. |
| High message volume overwhelms SQLite | Low | Low | SQLite WAL mode handles concurrent reads well. Agent message volume is bounded by turn speed (~1-5 per minute per agent). |
| Agents claim same task simultaneously | Medium | Low | `claimTask()` uses a single SQL UPDATE with `WHERE status = 'pending'` — SQLite's serialized writes prevent double-claims. Return error if already claimed. |

---

## Key Design Decisions

1. **Commands in stdout vs. tool_use:** We embed commands in assistant text output rather than using Claude's native tool_use mechanism. This avoids needing to modify the Claude CLI's tool definitions. The trade-off is less structured parsing, but the command syntax is simple enough that regex works reliably.

2. **Response injection via sendPrompt:** When an agent runs `[TASK_LIST]`, the result is sent back as a user prompt. This keeps the agent in its normal conversational loop without any special IPC mechanism. The prompt queue in `AgentProcess` ensures responses are delivered at the right time.

3. **No task dependencies enforcement in V2:** The `depends_on` field is stored but not enforced (agents can claim a task even if its dependencies aren't complete). This keeps the implementation simple. V3 can add enforcement + visual blocking indicators.

4. **Squad-scoped commands only:** An agent can only interact with tasks and agents in its own squad. The `CommandInterceptor` validates this on every command execution.

5. **Frontend tabs vs. single page:** Using tabs on the Squad Detail page keeps the existing agent grid intact while adding new views. This is less risky than a full page redesign and lets users focus on one aspect at a time.
