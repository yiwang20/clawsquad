# Changelog

## 1.0.0 — MVP

### What's New

ClawSquad V1: a local web app for assembling and running squads of Claude Code agents from a single browser window.

#### Squad Creation
- **3-step creation wizard**: Mission → Roles → Review & Launch (single-page accordion)
- **Quick-start presets**: Research Squad, Dev Team, and Content Squad pre-fill the wizard with sensible defaults and placeholder text — modify and launch in under 60 seconds
- **Role-based agents**: Each agent gets a role name and optional focus area. System auto-generates a system prompt from the squad mission + role.
- **Progressive disclosure**: Non-technical users see only name, mission, and role names. Power users can expand advanced settings per squad (working directory, default model, permission mode) and per agent (model override, permission override, custom system prompt).
- **Defaults that work**: Model defaults to Sonnet, permission mode to Bypass Permissions, working directory to `~/clawsquad-workspace/`

#### Squad & Agent Lifecycle
- **Start/stop squads**: Launch all agents simultaneously or stop the entire squad at once
- **Individual agent control**: Start, stop, or restart individual agents within a running squad without affecting others
- **Delete squads**: Removes the squad, all agents, and their history
- **Status tracking**: Agent statuses (idle, running, waiting, stopped, error) and derived squad statuses (ready, running, active, stopped, error) update in real-time across the UI

#### Real-Time Output Streaming
- **Live output feed**: Agent output streams via WebSocket as it's generated — no polling, no refresh needed
- **Markdown rendering**: Inline code, bold, italic rendered in the output feed
- **Tool use blocks**: Collapsible blocks for tool calls (file edits, bash commands, etc.) — collapsed by default, expandable on click
- **Auto-scroll**: Output feed auto-scrolls to latest content; scrolling up pauses auto-scroll
- **Output buffer**: 1,000 messages kept in memory per agent; older messages persisted in SQLite

#### Prompt Input
- **Follow-up messages**: Send prompts to any running or waiting agent to steer its work
- **Keyboard shortcuts**: Enter to send, Shift+Enter for newline
- **Abort**: Interrupt an agent mid-task
- **Smart disable**: Input disabled with contextual hint when agent isn't in a promptable state

#### Dashboard & Navigation
- **Home page**: List of all squads with name, mission preview, status badge, and agent count
- **Empty state**: Clear CTA ("Create Your Squad") with quick-start cards for first-time users
- **Squad detail page**: All agents in a squad with role, status, and output preview
- **Agent detail page**: Full output feed + prompt input for focused monitoring
- **Routing**: Home → Squad → Agent with clean URL paths (`/squads/:id`, `/squads/:squadId/agents/:agentId`)
- **WebSocket status indicator**: Live/Connecting/Offline indicator in the header

#### Persistence
- **SQLite database**: Squads, agents, and message history persist across browser refreshes and server restarts
- **Session resumption**: Stopped agents can be restarted, resuming their Claude Code session via session ID

#### Architecture
- **Monorepo**: Three packages — `@clawsquad/shared` (types + constants), `@clawsquad/backend` (Express + WebSocket + SQLite), `@clawsquad/frontend` (React + Vite + Zustand)
- **Shared types**: Frontend and backend share the same TypeScript type definitions
- **WebSocket protocol**: Bidirectional — client subscribes to agent/squad updates; server streams output and status changes
- **Process management**: Each agent runs as a Claude Code CLI child process managed by ProcessManager

---

### Known Limitations

- **Single user only.** No authentication, no multi-user support. Designed for local use on one machine.
- **No agent coordination.** Agents in a squad work independently. They share a mission but cannot communicate with each other or hand off work. Users coordinate manually via follow-up prompts.
- **No permission approval UI.** Agents default to Bypass Permissions mode. If a user selects Plan or Auto mode, there's no in-app UI to approve permission requests — the agent may block waiting for approval that can't be given through the UI.
- **Squads are not editable after creation.** Cannot add/remove agents, change the mission, or modify roles after launch. Delete and recreate instead.
- **System prompt generation is basic.** Template: `"You are a {role}. Your mission: {mission}. Your focus: {focus}."` — functional but not optimized for complex multi-agent coordination.
- **No cost tracking.** Users must manage API spend externally (e.g., via Claude Code's `--max-budget-usd` flag).
- **Desktop only.** No responsive design for mobile or tablet.
- **Max 10 agents per squad, 20 concurrent agents total.** Resource constraint — each agent is a separate CLI process.

---

### Deferred to V2

| Feature | Notes |
|---|---|
| **Predefined squad templates** | Save squad configs as reusable templates; ship curated templates (software dev, market research, content creation, etc.) |
| **Agent-to-agent communication** | Let agents share context, hand off work, or reference each other's output |
| **Role suggestions** | Suggest roles based on the mission description ("you said 'build an app' — try Backend Dev, Frontend Dev, Tester") |
| **Squad editing** | Add/remove agents, modify mission and roles after creation |
| **Permission approval UI** | In-app approval flow for agents running in Plan or Auto mode |
| **Squad-level broadcast** | Send a message to all agents in a squad at once |
| **Multi-panel view** | View 2+ agents' output side-by-side |
| **Multi-user / team collaboration** | Auth, user accounts, shared squads |
| **Remote agent execution** | Run agents on remote machines or cloud infrastructure |
| **Cost tracking dashboard** | Track API spend per agent, per squad, with budget controls |
| **Mobile / tablet support** | Responsive design for smaller screens |
| **Save as template** | Let users save their squad configs for reuse |
