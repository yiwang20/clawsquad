# ClawSquad - MVP Product Spec

## What is ClawSquad?

ClawSquad is a web-based tool that lets users assemble a squad of AI agents, each with a defined role, and run them together on a task. Think of it as a visual team builder for Claude Code — you pick the roles, describe the mission, and watch your squad work in real-time from a single browser window.

**One-liner**: Build your AI squad, assign roles, watch them work.

---

## Product Principles

1. **Squad-first, not agent-first.** The unit of work is a squad, not an individual agent. Users think in terms of "I need a team for X," not "I need to spawn process #3."
2. **Accessible to non-technical users.** A marketing manager should be able to assemble a research squad without understanding CLI flags, models, or permission modes. Technical details exist but are hidden by default.
3. **Real-time observability.** Users must be able to see what every agent is doing as it happens. No black boxes, no waiting for completion.
4. **Progressive disclosure.** Simple by default, powerful when you dig in. Creating a squad should take 30 seconds. Tweaking agent models and permissions is there for power users.
5. **Self-configurable now, templated later.** V1 lets users build squads manually. V2 introduces preset templates. The data model must support both.

---

## User Personas

### Persona 1: The Power Developer

- **Who**: A developer already using Claude Code. Comfortable with AI-assisted coding, wants to parallelize work across multiple agents.
- **Pain today**: Running multiple Claude Code sessions means multiple terminals, constant tab-switching, and no unified view. Coordinating parallel workstreams is manual and error-prone.
- **What they want**: A dashboard to spin up a squad of agents — one refactoring, one writing tests, one fixing the build — and monitor all of them without losing context.
- **How they'll use ClawSquad**: Creates squads with specific roles, customizes models and working directories, sends follow-up prompts to steer agents, leverages advanced config.
- **Success**: "I assembled a 4-agent dev squad in under a minute. I can see all of them working and jump in when one needs guidance."

### Persona 2: The Non-Technical Operator

- **Who**: A knowledge worker (marketing, ops, research, content) who doesn't code but wants to use AI agents for complex tasks like market research, content creation, or data analysis.
- **Pain today**: Current AI tools are single-threaded — one chat, one task. For complex projects (e.g., "research 5 competitors and summarize findings"), they either do it manually or run multiple chat windows and stitch results together.
- **What they want**: A way to say "I need a research team" and get multiple agents working in parallel, each handling a piece of the puzzle. No terminal, no CLI, no jargon.
- **How they'll use ClawSquad**: Creates squads using simple role labels ("Researcher", "Writer", "Analyst"), describes the mission in plain language, watches agents work, and intervenes when needed.
- **Success**: "I set up a 3-person research squad, gave them a topic, and had a comprehensive brief in 20 minutes. I didn't need to know anything about models or APIs."

### Persona 3: The Curious Explorer

- **Who**: Someone who's heard about multi-agent AI workflows and wants to try it. Could be technical or non-technical. Motivated by curiosity more than an immediate workflow need.
- **What they want**: A low-friction way to experiment. Create a squad, see what happens, learn what's possible.
- **Success**: "I tried it with 2 agents and was surprised by what they could do together. Now I want to figure out how to use this for real work."

---

## Core Features (MVP)

### 1. Squad Creation

**User story**: As a user, I can create a new squad by naming it, describing its mission, and adding agents with specific roles, so I can set up a team for my task.

**Functional requirements**:
- **Squad-level config**: Name (required), description/mission (required — this is the high-level goal), working directory (for dev squads; optional)
- **Agent-level config within the squad**: Each agent gets a role name (e.g., "Frontend Dev", "Researcher", "Editor") and an optional role description (what this agent should focus on)
- **Quick-add flow**: User can add agents one at a time with just a role name. System generates a sensible system prompt from the role name + squad mission.
- **Advanced config (collapsed by default)**: Model selection, permission mode, custom system prompt, working directory override per agent. Power users can expand this; non-technical users never need to see it.
- **Defaults**: Model defaults to sonnet, permission mode defaults to a permissive mode (auto or bypassPermissions) to avoid requiring permission approval UI in V1.
- Minimum 1 agent per squad, maximum 10 for V1 (resource constraint).

**Acceptance criteria**:
- User can create a squad with 3 agents in under 60 seconds using just role names
- Advanced settings are hidden unless the user explicitly expands them
- Created squad appears on the dashboard in "ready" state (not yet running)

### 2. Squad Lifecycle Management

**User story**: As a user, I can start, stop, and delete squads so I can control when my agents are working and manage resources.

**Functional requirements**:
- **Start squad**: Launches all agents simultaneously. Each agent receives the squad mission + its role-specific instructions as its initial prompt.
- **Stop squad**: Gracefully stops all agents in the squad.
- **Start/stop individual agents**: Within a running squad, user can stop or restart a single agent without affecting others.
- **Delete squad**: Stops all agents and removes the squad and its history.
- **Squad status**: Derived from agent statuses — "ready" (all idle), "running" (at least one running), "stopped" (all stopped), "error" (at least one error).
- **Agent statuses**: idle, running, stopped, error — each with clear visual indicator.

**Acceptance criteria**:
- "Start Squad" launches all agents and user sees them transition to "running"
- User can stop one agent without stopping the others
- Deleting a squad cleans up all agents
- Squad status badge updates in real-time

### 3. Real-Time Output Streaming

**User story**: As a user, I can see what each agent in my squad is doing in real-time, so I can monitor progress and catch issues early.

**Functional requirements**:
- Each agent's output streams live as it's generated
- Text output rendered as readable, formatted text (markdown for dev output; clean prose for non-dev output)
- For developer personas: tool use (file edits, bash commands, searches) shown in collapsible blocks
- For non-technical personas: tool use details hidden by default, with a "show details" toggle for transparency
- Typing indicator while agent is generating
- Auto-scroll to latest output; scrolling up pauses auto-scroll
- Output persists across page refreshes

**Acceptance criteria**:
- User sees agent output within 1 second of generation
- Tool use blocks are collapsed by default, expandable on click
- Page refresh preserves output history
- Works smoothly with up to 10 concurrent agents

### 4. Prompt Input (Follow-Up Messages)

**User story**: As a user, I can send follow-up messages to any running agent to steer its work, provide clarification, or redirect it.

**Functional requirements**:
- Text input per agent panel
- Send on Enter (Shift+Enter for newline)
- Abort button to interrupt an agent mid-task
- User messages appear in the output feed, visually distinct from agent output
- Input disabled when agent isn't running, with clear explanation

**Acceptance criteria**:
- Follow-up prompt delivered and agent responds
- Abort stops current agent work
- Input clearly disabled with reason when agent is idle/stopped/error

### 5. Squad Dashboard

**User story**: As a user, I can see all my squads and drill into any squad to see its agents, so I have a clear overview of everything running.

**Functional requirements**:
- **Home view**: List of all squads with name, mission summary, status badge, and agent count
- **Squad detail view**: Shows all agents in the squad with their role, status, and a preview of recent output
- **Agent detail view**: Full output feed + prompt input for a single agent
- Navigation: Home → Squad → Agent, with breadcrumbs
- Empty state on home: clear CTA — "Create your first squad"
- Status changes reflected everywhere in real-time

**Acceptance criteria**:
- User can navigate from home to a specific agent's output in 2 clicks
- All status changes visible within 1 second
- Home view handles 5+ squads without layout issues
- Squad detail view handles 10 agents without layout issues

### 6. Session Persistence

**User story**: As a user, I can close the browser and come back later to find my squads and their history intact, so I don't lose work.

**Functional requirements**:
- Squads, agents, and message history persist in a local database
- Agents that were running when the server stopped are marked "stopped" on restart
- User can restart stopped agents (resumes previous Claude Code session)
- Previous session's squads appear on the home screen

**Acceptance criteria**:
- Closing and reopening browser shows previous squads and output
- Restarting server preserves all squad data
- "Restart" on a stopped agent resumes its conversation context

---

## What "Self-Configurable Squad" Means in V1

In V1, **the user manually builds their squad by choosing roles and the number of agents.** There are no pre-built templates — the user is the squad designer.

Concretely, "self-configurable" means:
- **User picks the squad size** (1-10 agents)
- **User defines each agent's role** via a role name and optional description
- **User writes the squad mission** — the high-level goal that all agents share
- **System auto-generates each agent's system prompt** by combining the squad mission + the agent's role (user can override)
- **User can customize advanced settings** per agent (model, permissions, working directory) but doesn't have to

What V1 does **not** include:
- Predefined squad templates (e.g., "Software Dev Team", "Market Research Squad") — this is the headline V2 feature
- Agent-to-agent communication or handoffs
- Automated role suggestion ("you said 'build an app' — here are recommended roles")
- Shared context or artifacts between agents
- Coordinated multi-step workflows or pipelines

**The V1 → V2 bridge**: Every squad the user creates in V1 is, in effect, a custom template. V2 can offer "save as template" and ship pre-built templates. The data model should be designed with this in mind from day 1.

---

## Key User Flows

### Flow 1: Developer Creates a Dev Squad

```
1. User opens ClawSquad → Home screen (empty state: "Create your first squad")
2. Clicks "Create Squad"
3. Names it "Auth Refactor", describes mission: "Refactor the auth module to use JWT
   tokens, update tests, and update documentation"
4. Adds 3 agents:
   - Role: "Backend Dev" (description: "Refactor auth module implementation")
   - Role: "Test Writer" (description: "Write and update unit + integration tests")
   - Role: "Docs Writer" (description: "Update API docs and README")
5. Sets working directory to /Users/dev/myproject (applies to all agents)
6. Clicks "Create Squad" → squad appears on home in "ready" state
7. Clicks "Start Squad" → all 3 agents launch simultaneously
8. Squad detail view shows all 3 agents streaming output
9. User clicks into "Backend Dev" to monitor closely, sends follow-up:
   "Use bcrypt for password hashing, not the current md5 approach"
10. Switches to "Test Writer" — sees it's already writing test files
11. "Docs Writer" finishes → its status turns idle in the squad view
12. User reviews output, satisfied with the squad's work
```

### Flow 2: Non-Technical User Creates a Research Squad

```
1. User opens ClawSquad → Home screen
2. Clicks "Create Squad"
3. Names it "Competitor Analysis", describes mission: "Research the top 5 competitors
   in the project management space and create a comparison brief"
4. Adds 3 agents:
   - Role: "Market Researcher"
   - Role: "Feature Analyst"
   - Role: "Report Writer"
5. Doesn't touch any advanced settings (doesn't need to know about models or permissions)
6. Clicks "Create Squad" → "Start Squad"
7. Watches agents work from the squad detail view
8. Sees "Market Researcher" gathering information, "Feature Analyst" comparing features
9. Sends follow-up to "Report Writer": "Make sure to include pricing comparisons"
10. All agents finish → user reviews output from each
```

### Flow 3: Returning User Manages Sessions

```
1. User opens ClawSquad → Home shows 2 squads from yesterday (both "stopped")
2. User clicks into "Auth Refactor" squad → sees previous output preserved
3. Clicks "Restart" on "Backend Dev" agent to continue where it left off
4. Agent resumes with full conversation context
5. User creates a new squad for today's work while the old agent runs
6. Decides the other old squad ("Bug Triage") is no longer needed → deletes it
```

### Flow 4: Error Recovery

```
1. Agent "Feature Analyst" in the research squad crashes
2. Squad status changes to "error" (one agent has errored)
3. Squad detail view highlights the errored agent in red
4. User clicks into it → sees: "Agent stopped unexpectedly: Process exited with code 1"
5. User clicks "Restart" → agent resumes from last session
6. Other agents in the squad were unaffected and kept running
```

---

## What We're Saying No To (V1)

| Feature | Why not now |
|---|---|
| Predefined squad templates | V2 headline feature. Need V1 data to know what templates to build. |
| Agent-to-agent communication | High complexity. Unproven value until basic multi-agent is validated. |
| Role suggestions / auto-composition | Requires understanding of task→role mapping. V2+. |
| Multi-user / team collaboration | MVP is single-user. Multi-user adds auth, permissions, infra. |
| Remote agent execution | Agents run locally. Remote execution is a different product surface. |
| Cost tracking dashboard | CLI handles budgets via `--max-budget-usd`. Don't rebuild. |
| File diff viewer / git integration | Dev users have their own IDE and git workflow. |
| Mobile / tablet support | Desktop-first. Optimized for the screen where you do real work. |
| In-app permission approval | V1 agents run in permissive mode. Permission UI is V2. |

---

## Product Constraints

1. **Local-only for V1.** ClawSquad runs on the user's machine. No cloud, no accounts, no login.
2. **Claude Code CLI required.** The CLI must be installed. ClawSquad should detect if it's missing and show a clear error with install instructions.
3. **Max 10 agents per squad.** Resource constraint — each agent is a CLI process consuming memory and API budget.
4. **No agent coordination.** Agents in a squad work independently. They share a mission but don't share context or hand off work. Users coordinate manually via follow-up prompts.
5. **Permissive agent mode in V1.** To avoid building a permission approval UI, agents default to a permissive mode. This is a known trade-off — we'll add permission controls in V2.

---

## Success Metrics

1. **Activation**: User creates and starts a squad with 2+ agents in their first session
2. **Comprehension**: Non-technical user successfully creates a squad without needing to touch advanced settings
3. **Engagement**: User sends at least 1 follow-up prompt to an agent (not just fire-and-forget)
4. **Retention**: User returns for a second session (session persistence is key here)
5. **Time-to-value**: User goes from "open browser" to "squad running" in under 90 seconds

Qualitative targets for V1 — validated through direct usage and feedback, not built-in analytics.

---

## Competitive Context

Two existing tools occupy adjacent space. Understanding them sharpens what we build and how we talk about it.

### ClawTeam (HKUDS/ClawTeam)

A Python-based multi-agent framework with a web UI. Closest to our vision.

- **What it does well**: Task board with dependencies, inter-agent messaging, pre-built team templates (hedge-fund, code-review, research-paper). Integrated with Claude Code.
- **Where it falls short for our users**: It's task-board-first and developer-centric. Requires Python/pip and CLI knowledge to set up. The web UI is a kanban board — functional but not engaging. It assumes users think in tasks and dependencies, not missions and roles.

### Claude Squad

A terminal-only multi-agent tool using tmux. Developer power tool, no GUI.

- **Relevant because**: Proves demand for running multiple Claude Code agents simultaneously. But it's terminal-native — the audience is exclusively power developers.

### Our Differentiation

| Dimension | ClawTeam / Claude Squad | ClawSquad |
|---|---|---|
| **Primary metaphor** | Task board / terminal panes | Squad builder — "assemble your team" |
| **Target user** | Developers who think in tasks and dependencies | Anyone who can describe a mission and assign roles |
| **Setup** | Python/pip, CLI commands | Open a browser, click "Create Squad" |
| **Real-time experience** | Kanban status updates / terminal output | Live streaming output per agent, typing indicators, collapsible tool use |
| **Onboarding model** | Define tasks → assign to agents | Describe mission → pick roles → go |

**Strategic implication**: We are not competing on feature depth (ClawTeam already has inter-agent messaging, task dependencies, and templates). We are competing on **accessibility, real-time experience, and the squad-builder metaphor.** Our V1 should nail the "describe a mission, assemble a team, watch them work" flow so well that it feels obviously easier than setting up ClawTeam — even if ClawTeam has more features under the hood.

**What this means for V1 priorities**:
- The squad creation flow must be **dead simple**. This is our moat. If creating a squad feels like filling out a config file, we've lost.
- Real-time streaming is a **must-have differentiator**, not a nice-to-have. The kanban-style "check back later" approach is what we're beating.
- We should **not rush to add inter-agent communication or task dependencies** just because ClawTeam has them. Those are power features for power users. Our V1 audience includes people who've never used a multi-agent tool before.
- Templates are V2, but when we build them, we should study ClawTeam's template model to see what works and where users struggle.

---

## Open Questions

1. **System prompt generation**: When a user adds a role like "Market Researcher" to a squad with mission "Analyze competitors," how do we generate the agent's system prompt? Recommendation: Simple template — `"You are a {role_name}. Your mission: {squad_mission}. Your focus: {role_description}."` Keep it transparent and editable.

2. **Squad-level prompt vs. agent-level prompt**: Should users be able to send a message to the entire squad at once ("everyone, pivot to focus on pricing"), or only to individual agents? Recommendation: **Agent-level only for V1.** Squad-level broadcast is a nice V2 feature but adds UI complexity.

3. **Multi-panel view**: Should the squad detail view show all agents' output simultaneously (grid/split), or one at a time? Recommendation: **Summary cards in squad view (role + status + last few lines of output), click-to-expand for full view.** This gives at-a-glance monitoring without overwhelming the screen.

4. **Working directory for non-dev squads**: Non-technical users won't have a "project directory." What's the default? Recommendation: **Default to a ClawSquad workspace directory** (e.g., `~/clawsquad-workspace/`). Auto-created on first run. Dev users override per-squad.

5. **"Save as template" groundwork**: Should V1 include a "save this squad config as a template" button even if we don't ship pre-built templates yet? Recommendation: **Yes, low effort and validates the V2 path.** But only if engineering capacity allows — not a blocker.

---

## V1 Shipped vs. Specced (Post-Launch Notes)

A final review of what we specced vs. what actually shipped in V1.

### Shipped as specced

- **3-step squad creation wizard** with progressive disclosure — matches the spec exactly (Mission → Roles → Review & Launch, accordion-style, single page)
- **Quick-start presets** — Research Squad, Dev Team, Content Squad all shipped with pre-filled missions and roles, including bracketed placeholders
- **Squad & agent lifecycle** — start/stop squad, start/stop individual agents, delete squad, all status states (idle, running, waiting, stopped, error)
- **Real-time output streaming** via WebSocket with markdown rendering, collapsible tool blocks, auto-scroll, and 1,000-message buffer
- **Prompt input** with Enter-to-send, Shift+Enter for newline, abort, and smart disable with contextual hints
- **Dashboard navigation** — Home → Squad → Agent with status badges and empty state CTA
- **Session persistence** in SQLite — survives browser refresh and server restart
- **Defaults** — Sonnet model, Bypass Permissions mode, `~/clawsquad-workspace/` directory
- **Max 10 agents per squad** (plus a 20-agent global cap)

### Shipped with minor deviations

- **System prompt generation**: Specced a longer template with "Work independently... summarize what you did" instructions. Shipped a simpler version: `"You are a {role}. Your mission: {mission}. Your focus: {focus}."` This is fine for V1 — simpler is better, and users can override with custom prompts. Consider enriching the template in V2 based on user feedback.
- **Content Squad**: Specced as 2 agents (Writer, Editor). Shipped as 3 agents (Researcher, Writer, Editor). The addition of Researcher makes sense — improves the out-of-box experience.
- **Default permission mode**: Spec discussed both "auto" and "bypassPermissions" as options. Shipped with `bypassPermissions` as the default, which is the right call — avoids any risk of agents blocking on permission prompts that can't be approved in the UI.
- **Squad status added "active"**: Spec defined ready/running/stopped/error. Implementation added "active" (at least one agent waiting between turns). Good addition — gives users better visibility into agents that are alive but idle.
- **Agent status added "waiting"**: Spec defined idle/running/stopped/error. Implementation added "waiting" (between turns, alive and ready for input). Correct — distinguishes "hasn't started" from "done with current turn, ready for more."

### Open questions resolved

1. **System prompt generation** → Shipped with the simple template. Works for V1.
2. **Squad-level prompt** → Agent-level only, as recommended. Deferred to V2.
3. **Multi-panel view** → Shipped as squad detail with agent cards, click into agent for full view. Matches recommendation.
4. **Working directory default** → `~/clawsquad-workspace/` as recommended.
5. **Save as template** → Not shipped in V1. Correctly deferred — engineering capacity went to core features.

### Not shipped (correctly deferred)

- No squad editing after creation
- No agent-to-agent communication
- No role suggestions
- No multi-user support
- No mobile/tablet
- No cost tracking
- No "save as template" button
