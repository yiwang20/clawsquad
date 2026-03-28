# ClawSquad - Technical Architecture Design

## Problem Statement

ClawSquad is a web application that lets users assemble **squads** of AI agents, each with a defined role, and run them together on a mission. Each agent is backed by a Claude Code CLI session running in non-interactive mode. Users need to see all agents' activity in real-time, send follow-up prompts, and manage squad lifecycle through a browser UI. The tool must be accessible to both developers and non-technical users.

## Scope & Constraints

- **MVP scope**: Single user, local machine. No multi-tenancy or remote execution.
- **Squad-first model**: The unit of work is a squad (group of agents with a shared mission), not an individual agent.
- **Agents = Claude Code CLI processes**: We wrap the CLI, not the API directly. This gives us tool use, file editing, and all Claude Code capabilities for free.
- **Real-time**: Users must see agent output as it streams, not after completion.
- **Persistence**: Squads, agents, and message history survive page refresh; app restart can resume sessions.
- **Tech stack**: React (Vite + TypeScript) frontend, Node.js (TypeScript) backend.
- **Max 10 agents per squad**. Each agent is a CLI process consuming memory and API budget.
- **No agent-to-agent communication in V1**. Agents share a mission but work independently. Data model keeps the door open for V2 messaging.
- **Permissive agent mode in V1**. Agents default to `bypassPermissions` to avoid needing a permission approval UI.
- **Differentiation**: Squad-first UX (not task-board-first like ClawTeam), non-technical-user friendly, superior real-time streaming UI. V2 adds predefined squad templates.

## Architecture Overview

```
┌──────────────────────────────────────────┐
│            React Frontend                │
│         (Vite + TypeScript)              │
│                                          │
│  SquadList → SquadDetail → AgentDetail   │
│  (Home)      (Agent cards)  (Full output)│
│                                          │
└──────────────┬───────────────────────────┘
               │ Single WebSocket connection
               │
┌──────────────┼───────────────────────────┐
│              ▼                            │
│   WebSocket Hub                          │
│      │                                   │
│   Express REST API                       │
│      │                                   │
│   SquadManager                           │
│      │                                   │
│   ProcessManager                         │
│    ┌──┴──┬──────┐                        │
│    │     │      │                        │
│  Agent  Agent  Agent  ...                │
│  (CLI)  (CLI)  (CLI)                     │
│                                          │
│   Node.js Backend                        │
└──────────────────────────────────────────┘
```

### Component Breakdown

1. **React Frontend** - SPA with three-level navigation: Squad list → Squad detail → Agent detail
2. **WebSocket Hub** - Multiplexes real-time agent output to connected clients
3. **REST API** - CRUD for squads and agents, lifecycle management
4. **SquadManager** - Orchestrates squad-level operations (start all, stop all, status derivation)
5. **ProcessManager** - Spawns, monitors, and communicates with Claude Code CLI processes

## Key Design Decisions

### 1. Claude Code CLI Integration via `--print --output-format stream-json`

**Decision**: Spawn Claude Code as child processes using `--print --output-format stream-json --include-partial-messages`.

**Rationale**: This gives us structured, line-delimited JSON output that we can parse and forward to the frontend in real-time. The `--input-format stream-json` flag enables bidirectional streaming, allowing us to send follow-up prompts to a running session.

**CLI flags per agent process**:
```bash
claude \
  --print \
  --output-format stream-json \
  --input-format stream-json \
  --include-partial-messages \
  --session-id <uuid> \
  --model <model> \
  --permission-mode <mode> \
  --verbose
```

**Alternative considered**: Using the Anthropic API directly. Rejected because we'd lose all of Claude Code's built-in tooling (file editing, bash execution, glob/grep, etc.) and would need to reimplement a significant agent framework.

### 2. WebSocket for Real-Time Streaming (not SSE)

**Decision**: Use WebSocket connections between frontend and backend.

**Rationale**:
- SSE is unidirectional (server → client). We need bidirectional communication for sending prompts and receiving output.
- WebSocket allows multiplexing multiple agent streams over a single connection.
- Natural fit for the "subscribe to agent output" pattern.

**Protocol**: Each WebSocket message is JSON with a `type` discriminator:

```typescript
// Server → Client
{ type: "agent:output", agentId: string, data: StreamMessage }
{ type: "agent:status", agentId: string, status: AgentStatus }
{ type: "agent:error", agentId: string, error: string }
{ type: "squad:status", squadId: string, status: SquadStatus }

// Client → Server
{ type: "agent:prompt", agentId: string, prompt: string }
{ type: "agent:abort", agentId: string }
{ type: "subscribe:squad", squadId: string }    // subscribes to all agents in squad
{ type: "unsubscribe:squad", squadId: string }
{ type: "subscribe", agentIds: string[] }       // subscribe to specific agents
{ type: "unsubscribe", agentIds: string[] }
```

Squad-level subscription (`subscribe:squad`) auto-subscribes the client to all agents in that squad. This is the typical pattern — when viewing the SquadDetailPage, the frontend subscribes to the squad, receiving output from all agents.

### 3. Squad-First Domain Model

**Decision**: Squad is the primary entity. Agents always belong to a squad. Operations like "start" and "stop" are squad-level by default (with per-agent overrides).

**Rationale**: Matches user mental model — "I need a team for X" — not "I need to spawn process #3". The squad groups agents that share a mission, and squad status is derived from the aggregate of agent statuses.

**Agent status lifecycle**:
- `idle` — agent created but process not yet started (squad in "ready" state)
- `running` — CLI process is active and processing a turn
- `waiting` — CLI process is alive but between turns (completed a prompt, awaiting next). This is the **normal resting state** for a started agent — it's not stuck or broken, it's ready for more input.
- `stopped` — process exited gracefully (user stopped or task completed)
- `error` — process exited unexpectedly or failed to spawn

**Important**: `waiting` is the most common state for a healthy started agent. The UI must treat this as a positive state ("Ready for input") not a warning. Agents naturally go idle between turns — this mirrors how Claude Code TEAM mode works, where agents idle between task assignments.

**Squad status derivation**:
- `ready` — all agents are `idle` (squad created but not yet started)
- `running` — at least one agent is `running` (actively processing)
- `active` — no agents `running` but at least one is `waiting` (squad started, agents between turns)
- `stopped` — all agents are `stopped`
- `error` — at least one agent is in `error` state

### 4. System Prompt Auto-Generation

**Decision**: When starting a squad, the backend generates each agent's system prompt from squad mission + role name + role description. Users can override with a custom system prompt.

**Template**:
```
You are a {role_name}. Your mission: {squad_mission}. Your focus: {role_description}.
```

**Rationale**: Non-technical users should never need to write a system prompt. The template is deliberately simple and transparent. Power users who want full control can override via advanced settings.

**Implementation**: `SquadManager.start()` iterates agents, generates prompts for those without a custom `system_prompt`, then delegates to `ProcessManager` to spawn each.

### 5. ProcessManager as Central Process Orchestrator

**Decision**: Single `ProcessManager` class owns all CLI process lifecycle. `SquadManager` sits above it to handle squad-level concerns.

**Rationale**: Separating squad orchestration from process management keeps each layer focused. `ProcessManager` knows about CLI processes; `SquadManager` knows about squads, roles, and prompt generation.

### 6. SQLite for Persistence

**Decision**: Use SQLite (via `better-sqlite3`) for squad/agent metadata, message history, and session state.

**Rationale**: Single-file database, zero configuration, excellent for single-user local apps. No need for a database server. Fast enough for our read/write patterns.

**Alternative considered**: File-based JSON storage. Rejected because querying message history and managing concurrent writes becomes messy.

## Project Structure

```
clawsquad/
├── package.json              # Workspace root
├── packages/
│   ├── frontend/             # React SPA
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── pages/
│   │       │   ├── HomePage.tsx         # Squad list (home)
│   │       │   ├── SquadDetailPage.tsx  # Agent cards for a squad
│   │       │   └── AgentDetailPage.tsx  # Full output + prompt for one agent
│   │       ├── components/
│   │       │   ├── SquadCard.tsx        # Squad summary card for home
│   │       │   ├── SquadCreator.tsx     # Create squad form (name, mission, roles)
│   │       │   ├── AgentCard.tsx        # Agent summary card in squad view
│   │       │   ├── OutputFeed.tsx       # Streaming output renderer
│   │       │   └── PromptInput.tsx      # User prompt input
│   │       ├── hooks/
│   │       │   ├── useWebSocket.ts      # WebSocket connection management
│   │       │   └── useSquad.ts          # Squad/agent state hooks
│   │       ├── stores/
│   │       │   └── squadStore.ts        # Zustand store for squad + agent state
│   │       └── types/
│   │           └── index.ts
│   │
│   ├── backend/              # Node.js server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                 # Entry point
│   │       ├── server.ts                # Express + WebSocket setup
│   │       ├── routes/
│   │       │   ├── squads.ts            # Squad CRUD + lifecycle endpoints
│   │       │   └── agents.ts            # Agent-level endpoints (start/stop/prompt)
│   │       ├── services/
│   │       │   ├── SquadManager.ts      # Squad-level orchestration
│   │       │   ├── ProcessManager.ts    # Manages all CLI processes
│   │       │   ├── AgentProcess.ts      # Single CLI process wrapper
│   │       │   └── Database.ts          # SQLite persistence layer
│   │       ├── ws/
│   │       │   └── WebSocketHub.ts      # WebSocket connection management
│   │       └── types/
│   │           └── index.ts
│   │
│   └── shared/               # Shared types & constants
│       ├── package.json
│       └── src/
│           ├── types.ts                 # Squad, Agent, Message, etc.
│           └── constants.ts             # Status enums, defaults
│
├── data/                     # SQLite DB location (gitignored)
└── docs/
    ├── architecture.md       # This file
    └── product-spec.md       # Product specification
```

**Monorepo with npm workspaces.** Shared types package prevents drift between frontend and backend type definitions.

## API Design

### REST Endpoints

```
# Squads
POST   /api/squads                  Create a new squad (with agents inline)
GET    /api/squads                  List all squads (summary)
GET    /api/squads/:id              Get squad detail with nested agents
DELETE /api/squads/:id              Stop all agents & delete squad

POST   /api/squads/:id/start       Start ALL agents in the squad
POST   /api/squads/:id/stop        Stop ALL agents in the squad

# Agents (within a squad)
POST   /api/squads/:squadId/agents         Add agent to existing squad
DELETE /api/squads/:squadId/agents/:id     Remove agent from squad

POST   /api/agents/:id/start       Start individual agent
POST   /api/agents/:id/stop        Stop individual agent
POST   /api/agents/:id/prompt      Send prompt (alternative to WebSocket)

GET    /api/agents/:id/messages    Get message history (paginated)
```

### Request/Response Shapes

```typescript
// POST /api/squads
interface CreateSquadRequest {
  name: string;
  mission: string;
  workingDirectory?: string;    // defaults to ~/clawsquad-workspace/
  agents: CreateAgentInput[];   // at least 1, max 10
}

interface CreateAgentInput {
  roleName: string;             // e.g., "Backend Dev", "Researcher"
  roleDescription?: string;    // what this agent should focus on
  model?: string;              // defaults to "sonnet"
  permissionMode?: string;     // defaults to "bypassPermissions"
  workingDirectory?: string;   // override squad-level directory
  systemPrompt?: string;       // override auto-generated prompt
}

// GET /api/squads/:id
interface SquadResponse {
  id: string;
  name: string;
  mission: string;
  status: SquadStatus;          // derived from agent statuses
  workingDirectory: string;
  agents: AgentResponse[];
  createdAt: string;
}

interface AgentResponse {
  id: string;
  squadId: string;
  roleName: string;
  roleDescription: string | null;
  model: string;
  status: AgentStatus;
  permissionMode: string;
  workingDirectory: string;
  systemPrompt: string;         // auto-generated or custom
  sessionId: string | null;     // Claude Code session ID
  createdAt: string;
  lastActiveAt: string | null;
}

// POST /api/squads/:squadId/agents
interface AddAgentRequest {
  roleName: string;
  roleDescription?: string;
  model?: string;
  permissionMode?: string;
  workingDirectory?: string;
  systemPrompt?: string;
}
```

## Data Model

### SQLite Schema

```sql
CREATE TABLE squads (
  id TEXT PRIMARY KEY,                -- UUID
  name TEXT NOT NULL,
  mission TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,                -- UUID
  squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,            -- e.g., "Backend Dev", "Researcher"
  role_description TEXT,              -- optional focus area
  model TEXT NOT NULL DEFAULT 'sonnet',
  permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions',
  working_directory TEXT NOT NULL,    -- inherited from squad or overridden
  system_prompt TEXT,                 -- auto-generated or custom override
  session_id TEXT,                    -- Claude Code session ID for resume
  status TEXT NOT NULL DEFAULT 'idle',
  created_at TEXT NOT NULL,
  last_active_at TEXT
);

CREATE INDEX idx_agents_squad ON agents(squad_id);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                 -- 'user' | 'assistant' | 'system' | 'tool'
  type TEXT NOT NULL,                 -- message type from stream-json
  content TEXT NOT NULL,              -- JSON blob of the message content
  created_at TEXT NOT NULL
);

CREATE INDEX idx_messages_agent ON messages(agent_id, created_at);

-- V2 placeholder: squad templates for "save as template" feature
CREATE TABLE squad_templates (
  id TEXT PRIMARY KEY,                -- UUID
  name TEXT NOT NULL,
  description TEXT,
  mission_template TEXT NOT NULL,     -- template mission with placeholders
  agent_configs TEXT NOT NULL,        -- JSON array of agent role configs
  created_at TEXT NOT NULL
);

-- V2 placeholder: agent-to-agent messaging
CREATE TABLE agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  from_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  to_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,  -- NULL = broadcast to squad
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'delivered' | 'read'
  created_at TEXT NOT NULL
);

CREATE INDEX idx_agent_messages_to ON agent_messages(to_agent_id, status);

-- V2 placeholder: task board for squad coordination
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,                -- UUID
  squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'completed'
  owner_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_squad ON tasks(squad_id, status);
```

**V2 placeholder tables**: These tables are created in the V1 schema but not exposed in the API or UI. They exist to avoid migrations when V2 features land:

- **`squad_templates`**: "Save as template" and pre-built templates. The `agent_configs` column stores a JSON array of `{ roleName, roleDescription, model?, permissionMode? }` objects.
- **`agent_messages`**: P2P and broadcast messaging between agents within a squad. Follows the async message queue pattern from Claude Code TEAM mode — messages queue when agents are busy and are delivered when the agent is `waiting`. `to_agent_id = NULL` means broadcast to all agents in the squad.
- **`tasks`**: Squad-level task board for coordination. In TEAM mode, the task board is the source of truth for work coordination. When we add this in V2, agents can claim tasks, track dependencies, and report progress.

### Squad Status Derivation (not stored, computed)

Squad status is derived at query time, not stored:

```typescript
function deriveSquadStatus(agents: Agent[]): SquadStatus {
  if (agents.some(a => a.status === "error")) return "error";
  if (agents.some(a => a.status === "running")) return "running";
  if (agents.some(a => a.status === "waiting")) return "active";
  if (agents.every(a => a.status === "stopped")) return "stopped";
  return "ready"; // all idle (not yet started)
}
```

### Key Types (shared package)

```typescript
type SquadStatus = "ready" | "running" | "active" | "stopped" | "error";
type AgentStatus = "idle" | "running" | "waiting" | "stopped" | "error";

interface Squad {
  id: string;
  name: string;
  mission: string;
  status: SquadStatus;         // derived, not stored
  workingDirectory: string;
  agents: Agent[];
  createdAt: string;
}

interface Agent {
  id: string;
  squadId: string;
  roleName: string;
  roleDescription: string | null;
  model: string;
  permissionMode: string;
  workingDirectory: string;
  systemPrompt: string;
  sessionId: string | null;
  status: AgentStatus;
  createdAt: string;
  lastActiveAt: string | null;
}

// Matches Claude Code's stream-json output format
interface StreamMessage {
  type: string;              // "assistant", "tool_use", "tool_result", "result", etc.
  subtype?: string;
  // ... fields vary by type, pass through to frontend
  [key: string]: unknown;
}

// WebSocket protocol
type WSClientMessage =
  | { type: "agent:prompt"; agentId: string; prompt: string }
  | { type: "agent:abort"; agentId: string }
  | { type: "subscribe"; agentIds: string[] }
  | { type: "unsubscribe"; agentIds: string[] };

type WSServerMessage =
  | { type: "agent:output"; agentId: string; data: StreamMessage }
  | { type: "agent:status"; agentId: string; status: AgentStatus }
  | { type: "squad:status"; squadId: string; status: SquadStatus }
  | { type: "agent:error"; agentId: string; error: string };
```

## Architectural Notes

### Agent Communication Model: Message Queue, Not Chat

Even though the UI presents a chat-like interface, the underlying model is a **message queue**. When a user sends a prompt to an agent:

1. If the agent is `running` (processing a turn), the message is queued and delivered when the current turn completes.
2. If the agent is `waiting` (between turns), the message is delivered immediately.
3. The agent processes one prompt at a time — there is no concurrent message handling.

This matches how Claude Code TEAM mode works: agents have inboxes, messages queue when agents are busy, and delivery happens asynchronously. The WebSocket layer gives the UI real-time visibility into this queue, but the backend treats it as async message delivery.

**V2 implication**: When we add agent-to-agent communication, it will use the same queue model. Agent A sends a message to Agent B's inbox; if B is busy, the message waits. This is already supported by the `agent_messages` V2 table schema.

### Agent `waiting` State is Normal

A key insight from Claude Code TEAM mode: **agents spend most of their time idle between turns**. After completing a prompt, the CLI process stays alive waiting for the next input via stdin (when using `--input-format stream-json`).

The UI must communicate this clearly:
- `waiting` = green indicator, "Ready for input" label
- `running` = animated indicator, "Working..." label
- `idle` = gray indicator, "Not started" label
- `stopped` = gray indicator, "Stopped" label
- `error` = red indicator, error message

Do not show `waiting` as a loading spinner or "processing" state — that would confuse users into thinking the agent is stuck.

## Core Backend Components

### SquadManager

Squad-level orchestration layer. Responsibilities:
- Create squads with agents
- Generate system prompts from squad mission + agent role
- Start/stop all agents in a squad
- Derive and broadcast squad status changes
- Delete squads (cascade stops + cleanup)

```typescript
class SquadManager {
  constructor(
    private db: Database,
    private processManager: ProcessManager
  );

  createSquad(req: CreateSquadRequest): Squad;
  deleteSquad(squadId: string): Promise<void>;
  startSquad(squadId: string): Promise<void>;   // starts all agents
  stopSquad(squadId: string): Promise<void>;     // stops all agents
  getSquad(squadId: string): Squad;
  listSquads(): Squad[];

  // System prompt generation
  private generateSystemPrompt(mission: string, roleName: string, roleDescription?: string): string;
}
```

**System prompt generation**:
```typescript
generateSystemPrompt(mission, roleName, roleDescription) {
  let prompt = `You are a ${roleName}. Your mission: ${mission}.`;
  if (roleDescription) {
    prompt += ` Your focus: ${roleDescription}.`;
  }
  return prompt;
}
```

### ProcessManager

Central registry of all CLI processes. Responsibilities:
- Spawn `AgentProcess` instances
- Track process health (is it still running?)
- Route incoming prompts to the correct process
- Emit events when agent status changes
- Cleanup on shutdown (graceful SIGTERM to all children)

```typescript
class ProcessManager extends EventEmitter {
  private processes: Map<string, AgentProcess>;

  spawn(agentId: string, config: AgentProcessConfig): AgentProcess;
  stop(agentId: string): Promise<void>;
  stopAll(): Promise<void>;
  sendPrompt(agentId: string, prompt: string): void;
  getStatus(agentId: string): AgentStatus;
}
```

### AgentProcess

Wraps a single Claude Code CLI child process. Responsibilities:
- Spawn the CLI with correct flags
- Parse line-delimited JSON from stdout
- Write stream-json messages to stdin for follow-up prompts
- Detect process exit and emit status changes
- Buffer partial lines from stdout

```typescript
class AgentProcess extends EventEmitter {
  private process: ChildProcess;
  private lineBuffer: string;
  private promptQueue: string[];     // queued prompts for when agent is busy

  constructor(config: AgentProcessConfig);
  start(initialPrompt?: string): void;
  sendPrompt(prompt: string): void;  // queues if running, delivers if waiting
  abort(): void;   // sends SIGINT for graceful abort
  kill(): void;    // sends SIGTERM

  // Events: 'message', 'status', 'error', 'exit'
  // Status transitions: idle → running → waiting → running → ... → stopped
  // The 'result' message in stream-json signals turn completion → transition to 'waiting'
  // A new prompt (via stdin) transitions from 'waiting' → 'running'
}
```

**Status detection**: When the stream-json output emits a `type: "result"` message, the agent has completed its current turn. Transition to `waiting`. When a new prompt is written to stdin, transition to `running`.

**Prompt queue**: If a user sends a prompt while the agent is `running`, it's added to `promptQueue`. When the current turn completes (→ `waiting`), the next queued prompt is automatically delivered. This matches the async message queue model.

**Stdin protocol for follow-up prompts** (stream-json input format):
```json
{"type": "user", "content": "your follow-up prompt here"}
```

### WebSocketHub

Manages WebSocket connections and subscriptions. Responsibilities:
- Accept client connections
- Track which agents each client is subscribed to
- Forward `ProcessManager` events to subscribed clients
- Route client messages (prompts, abort) to `ProcessManager`

```typescript
class WebSocketHub {
  private wss: WebSocketServer;
  private subscriptions: Map<WebSocket, Set<string>>;
  private processManager: ProcessManager;

  constructor(server: HttpServer, processManager: ProcessManager);
  broadcast(agentId: string, message: WSServerMessage): void;
}
```

## Frontend State Management

**Zustand** for state management (lightweight, minimal boilerplate).

```typescript
interface SquadStore {
  squads: Map<string, Squad>;
  agents: Map<string, Agent>;           // all agents across all squads
  outputBuffers: Map<string, StreamMessage[]>; // per-agent output history

  // Navigation
  activeSquadId: string | null;
  activeAgentId: string | null;

  // Squad actions
  createSquad(req: CreateSquadRequest): Promise<Squad>;
  deleteSquad(squadId: string): Promise<void>;
  startSquad(squadId: string): Promise<void>;
  stopSquad(squadId: string): Promise<void>;

  // Agent actions
  sendPrompt(agentId: string, prompt: string): void;
  abortAgent(agentId: string): void;
  startAgent(agentId: string): Promise<void>;
  stopAgent(agentId: string): Promise<void>;

  // State updates (called by WebSocket handler)
  updateAgentStatus(agentId: string, status: AgentStatus): void;
  updateSquadStatus(squadId: string, status: SquadStatus): void;
  addOutput(agentId: string, message: StreamMessage): void;
}
```

### Frontend Navigation

Three-level hierarchy with React Router:

| Route | Page | Description |
|---|---|---|
| `/` | `HomePage` | Squad list with status badges, "Create Squad" CTA |
| `/squads/:id` | `SquadDetailPage` | Agent cards (role, status, output preview), squad controls |
| `/squads/:squadId/agents/:agentId` | `AgentDetailPage` | Full output feed + prompt input |

Breadcrumbs: Home > Squad Name > Agent Role

### Output Rendering Strategy

The `OutputFeed` component renders `StreamMessage[]` into a scrollable feed. Message types map to visual components:

| Stream type | Rendering |
|---|---|
| `assistant` (text) | Markdown-rendered text block |
| `tool_use` | Collapsible block showing tool name + input |
| `tool_result` | Collapsible block showing tool output |
| Partial messages | In-progress text with typing indicator |

Tool use blocks are **collapsed by default** (progressive disclosure for non-technical users). The output buffer is capped at the last N messages per agent (configurable, default 1000) to prevent memory issues with long-running agents.

## Data Flow: Creating & Starting a Squad

```
1. User fills out SquadCreator form: name, mission, agent roles
2. Frontend POST /api/squads with { name, mission, agents: [{roleName, ...}] }
3. SquadManager creates squad row + agent rows in SQLite
4. SquadManager auto-generates system prompts for each agent
5. Returns Squad with nested agents, all in "idle" status
6. Frontend adds to Zustand store, navigates to SquadDetailPage
7. User clicks "Start Squad"
8. Frontend POST /api/squads/:id/start
9. SquadManager iterates agents, calls ProcessManager.spawn() for each
10. Each AgentProcess starts CLI with generated system prompt as initial prompt
11. Status updates broadcast via WS: agent:status (per agent) + squad:status
12. Frontend updates cards in real-time as agents transition to "running"
```

## Data Flow: Sending a Prompt to an Agent

```
1. User navigates to AgentDetailPage, types prompt in PromptInput
2. Frontend sends WS: { type: "agent:prompt", agentId, prompt }
3. WebSocketHub receives, calls ProcessManager.sendPrompt(agentId, prompt)
4. ProcessManager finds AgentProcess, writes to stdin:
   { type: "user", content: prompt }
5. Claude Code processes prompt, streams output to stdout
6. AgentProcess parses each JSON line, emits 'message' event
7. ProcessManager forwards to WebSocketHub
8. WebSocketHub broadcasts to subscribed clients:
   { type: "agent:output", agentId, data: <parsed message> }
9. Frontend Zustand store appends to outputBuffer
10. OutputFeed re-renders with new message
```

## Operational Concerns

### Process Cleanup
- `ProcessManager` registers `SIGTERM`/`SIGINT` handlers to gracefully stop all child processes on server shutdown.
- If a child process exits unexpectedly, `AgentProcess` detects via `'exit'` event, updates status to `"error"`, and notifies frontend.

### Resource Limits
- Max 10 agents per squad. Max concurrent agents across all squads: configurable (default 20).
- Output buffer cap per agent prevents unbounded memory growth.
- `--max-budget-usd` flag can be set per agent for cost control.

### Session Resumption
- When an agent is started, its `session_id` is stored in SQLite.
- On server restart, agents in `"running"` state are marked `"stopped"`.
- User can explicitly restart an agent, which uses `--resume <session-id>` to continue the conversation.

### Error Handling
- CLI spawn failures (e.g., `claude` not found) → agent status set to `"error"` with message.
- CLI exits with non-zero code → status set to `"error"`, exit code logged.
- Malformed JSON from stdout → log warning, skip line, continue parsing.
- WebSocket disconnect → client-side auto-reconnect with exponential backoff, re-subscribe to agents.

## Implementation Plan

Tasks ordered by dependency. Each is independently implementable.

### Phase 1: Foundation
1. **Monorepo setup** - Initialize npm workspaces, TypeScript configs, shared package, build scripts.
2. **Shared types** - Define Squad, Agent, Message, StreamMessage, WebSocket protocol types, status enums, and system prompt template in `packages/shared`.
3. **Backend skeleton** - Express server, basic health endpoint, SQLite connection + schema migration (squads, agents, messages, squad_templates tables).
4. **AgentProcess class** - CLI wrapper with spawn, stdin/stdout streaming, event emission.
5. **ProcessManager** - Agent process lifecycle management, process registry.
6. **SquadManager** - Squad CRUD, system prompt generation, squad start/stop orchestration, status derivation.

### Phase 2: API & WebSocket
7. **Squad REST API routes** - `/api/squads` CRUD + lifecycle endpoints, wired to SquadManager.
8. **Agent REST API routes** - Individual agent start/stop/prompt, message history.
9. **WebSocketHub** - WebSocket server, subscription management, bidirectional message routing, squad status broadcasts.

### Phase 3: Frontend
10. **Frontend skeleton** - Vite + React setup, React Router (3 routes), layout shell with breadcrumbs.
11. **Zustand store + WebSocket hook** - Squad/agent state management, WebSocket connection with auto-reconnect.
12. **HomePage + SquadCard + SquadCreator** - Squad list, creation form (name, mission, roles), empty state CTA.
13. **SquadDetailPage + AgentCard** - Agent cards with role, status, output preview, squad controls.
14. **AgentDetailPage + OutputFeed + PromptInput** - Full output feed, prompt input, abort button.

### Phase 4: Polish
15. **Session resume** - Resume agents from previous sessions via `--resume`.
16. **Error handling & edge cases** - Reconnection, process crash recovery, input validation, CLI-not-found detection.
17. **Styling & UX** - Visual polish, responsive layout, loading states, status badges.

## Competitive Landscape & Differentiation

| Product | Approach | Our Advantage |
|---|---|---|
| **ClawTeam** (HKUDS) | Python framework, web UI, task board, tmux+git worktree isolation, inter-agent messaging | We're squad-first (not task-board-first), non-technical user friendly, simpler UX |
| **Claude Squad** (smtg-ai) | Terminal-only, tmux+git worktrees | We have a browser UI, accessible to non-developers |
| **ClawPort UI** | Next.js browser UI for agent command center | We focus on squad creation/management, not just monitoring |

**Our architectural bets**:
- **Squad-first UX** over task-board-first: Users think "I need a team for X," not "I need to manage a backlog." The task board is a V2 feature, not the primary interface.
- **Non-technical accessibility**: Progressive disclosure hides CLI complexity. Creating a squad requires only role names and a mission description.
- **Real-time streaming UI**: The output feed with collapsible tool use and typing indicators gives better observability than terminal multiplexing.
- **V2 template marketplace**: The data model supports "save as template" from day one, enabling a template ecosystem in V2.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Claude Code CLI output format changes | Medium | High | Pin CLI version; parse defensively with fallback to raw text |
| Child process memory leaks | Low | Medium | Monitor process memory; allow user to restart agents |
| Stdout buffer overflow with fast output | Low | Medium | Backpressure via `pause()`/`resume()` on stdout stream |
| User sends prompt while agent is busy | Medium | Low | CLI handles queuing internally; UI shows "busy" state |
| WebSocket reconnect loses messages | Medium | Medium | On reconnect, fetch recent messages via REST as backfill |
