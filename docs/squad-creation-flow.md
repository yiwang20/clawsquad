# Squad Creation UX Flow

This is the build spec for the squad creation experience — ClawSquad's core differentiator. The goal: a user goes from "I have an idea" to "my squad is running" in under 90 seconds, regardless of technical skill level.

---

## Design Philosophy

- **Conversation, not configuration.** The creation flow should feel like answering three natural questions: "What do you need done?" → "Who's on the team?" → "Ready to go?"
- **Defaults are decisions.** Every field that has a good default is one less thing the user has to think about. Advanced users can override; everyone else never sees it.
- **Show, don't ask.** Where possible, infer rather than prompt. If the user's mission mentions "code" or "build," the system can suggest dev-oriented roles. If it mentions "research" or "analyze," suggest knowledge-work roles.

---

## Home Screen (Empty State)

When the user opens ClawSquad for the first time, there are no squads. This screen must make the next action obvious and the product's value immediately clear.

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  ClawSquad                                               │
│                                                          │
│                                                          │
│              ┌─────────────────────────┐                 │
│              │   🎯 Build Your Squad   │                 │
│              │                         │                 │
│              │  Assemble a team of AI  │                 │
│              │  agents, give them a    │                 │
│              │  mission, and watch     │                 │
│              │  them work together.    │                 │
│              │                         │                 │
│              │  [ Create Your Squad ]  │  ← Primary CTA │
│              │                         │                 │
│              └─────────────────────────┘                 │
│                                                          │
│           ── or try a quick start ──                     │
│                                                          │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│   │ Research      │ │ Dev Team     │ │ Content      │   │
│   │ Squad         │ │              │ │ Squad        │   │
│   │ 3 agents      │ │ 3 agents     │ │ 2 agents     │   │
│   │ Researcher,   │ │ Backend Dev, │ │ Writer,      │   │
│   │ Analyst,      │ │ Frontend Dev,│ │ Editor       │   │
│   │ Writer        │ │ Tester       │ │              │   │
│   └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Quick-Start Cards

These are **not** full templates (templates are V2). They are **pre-filled creation flows** — clicking one opens the creation wizard with fields already populated. The user can modify anything before launching. This reduces the blank-page problem without building a template system.

**Three quick-start suggestions for V1:**

| Card | Pre-filled Mission | Pre-filled Roles |
|---|---|---|
| **Research Squad** | "Research [topic] and produce a comprehensive brief with key findings, trends, and recommendations." | Researcher, Analyst, Report Writer |
| **Dev Team** | "Work on [project]: implement features, write tests, and ensure code quality." | Backend Dev, Frontend Dev, Test Engineer |
| **Content Squad** | "Create [content type] about [topic] that is well-researched, well-written, and ready to publish." | Writer, Editor |

Clicking a quick-start card opens Step 1 with the mission field pre-filled (with `[bracketed placeholders]` the user replaces). The roles are pre-populated in Step 2. The user reviews, tweaks, and launches.

### Home Screen (With Existing Squads)

```
┌──────────────────────────────────────────────────────────┐
│  ClawSquad                                [ + New Squad ]│
│                                                          │
│  Your Squads                                             │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Auth Refactor                        ● Running (3) │  │
│  │ Refactor auth module to JWT tokens...              │  │
│  │ Backend Dev · Test Writer · Docs Writer            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Competitor Analysis                  ○ Stopped (3) │  │
│  │ Research top 5 PM tool competitors...              │  │
│  │ Market Researcher · Feature Analyst · Report Writer│  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Each squad card shows: name, first line of mission, role names, status badge with agent count. Clicking opens the Squad Detail view.

---

## Creation Flow: Three Steps

### Overview

```
Step 1: Mission          Step 2: Roles          Step 3: Review & Launch
"What needs done?"  →   "Who's on the team?" → "Look good? Let's go."
```

The flow is a single page with three collapsible sections that expand sequentially (accordion-style), NOT separate pages/routes. This avoids page transitions and keeps the experience fast. The user can always scroll back to edit a previous step.

---

### Step 1: Mission

**Purpose**: Capture the squad's name and mission. This is the "what" — the high-level goal all agents share.

```
┌──────────────────────────────────────────────────────────┐
│  Create Your Squad                                       │
│                                                          │
│  ┌─ Step 1: Mission ─────────────────────────────── ▼ ─┐│
│  │                                                      ││
│  │  Squad Name                                          ││
│  │  ┌──────────────────────────────────────────────┐    ││
│  │  │ Auth Refactor                                │    ││
│  │  └──────────────────────────────────────────────┘    ││
│  │                                                      ││
│  │  Mission                                             ││
│  │  Describe what you want your squad to accomplish.    ││
│  │  ┌──────────────────────────────────────────────┐    ││
│  │  │ Refactor the authentication module to use    │    ││
│  │  │ JWT tokens instead of session cookies.       │    ││
│  │  │ Update all tests and documentation.          │    ││
│  │  └──────────────────────────────────────────────┘    ││
│  │                                                      ││
│  │  ▸ Advanced Settings                                 ││
│  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ││
│  │                                              [Next]  ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

**Visible by default:**
- Squad Name (text input, required, placeholder: "e.g., Auth Refactor, Q2 Research, Blog Posts")
- Mission (textarea, required, placeholder: "Describe what you want your squad to accomplish. Be specific about the goal and any constraints.")

**Advanced Settings (collapsed by default):**
- Working Directory — file picker or text input. Shown with helper text: "Where should your agents work? Leave blank for the default workspace."
  - Default: `~/clawsquad-workspace/` (auto-created on first use)
  - If user's mission contains code-related keywords, show a hint: "Tip: Set this to your project directory"
- Default Model — dropdown: Sonnet (default), Opus, Haiku. Helper text: "Applies to all agents unless overridden per-role."
- Default Permission Mode — dropdown: Auto (default), Plan, Bypass Permissions. Helper text: "Controls what agents can do without asking. 'Auto' is recommended for most users."

**Validation:**
- Name: required, max 60 chars
- Mission: required, max 2000 chars
- "Next" button enabled only when both fields are filled

**Behavior:**
- Clicking "Next" collapses Step 1 (showing a summary: name + first line of mission) and expands Step 2

---

### Step 2: Roles

**Purpose**: Build the squad by adding agents with roles. This is the "who."

```
┌──────────────────────────────────────────────────────────┐
│  Create Your Squad                                       │
│                                                          │
│  ┌─ Step 1: Mission ── Auth Refactor ────────────── ▸ ─┐│
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─ Step 2: Roles ──────────────────────────────── ▼ ─┐ │
│  │                                                      ││
│  │  Who's on the team?                                  ││
│  │                                                      ││
│  │  ┌─ Agent 1 ────────────────────────────────────┐   ││
│  │  │ Role Name    [ Backend Dev               ]   │   ││
│  │  │ Focus        [ Refactor auth implementa... ] │   ││
│  │  │ ▸ Advanced                                   │   ││
│  │  └──────────────────────────────────────────────┘   ││
│  │                                                      ││
│  │  ┌─ Agent 2 ────────────────────────────────────┐   ││
│  │  │ Role Name    [ Test Writer               ]   │   ││
│  │  │ Focus        [ Write unit + integration... ] │   ││
│  │  │ ▸ Advanced                                   │   ││
│  │  └──────────────────────────────────────────────┘   ││
│  │                                                      ││
│  │  ┌─ Agent 3 ────────────────────────────────────┐   ││
│  │  │ Role Name    [ Docs Writer               ]   │   ││
│  │  │ Focus        [                           ]   │   ││
│  │  │ ▸ Advanced                                   │   ││
│  │  └──────────────────────────────────────────────┘   ││
│  │                                                      ││
│  │  [ + Add Agent ]                        3/10 agents  ││
│  │                                                      ││
│  │                                    [Back]  [Next]    ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

**Visible by default per agent card:**
- Role Name (text input, required, placeholder: "e.g., Researcher, Backend Dev, Editor")
- Focus (text input, optional, placeholder: "What should this agent focus on? Leave blank to use the squad mission.")

**Advanced Settings per agent card (collapsed by default):**
- Model Override — dropdown, inherits squad default. "Leave as default unless this role needs a different model."
- Permission Mode Override — dropdown, inherits squad default.
- Working Directory Override — text input, inherits squad default.
- Custom System Prompt — textarea. "Override the auto-generated prompt. Leave blank to auto-generate from mission + role." Shows a "Preview generated prompt" link that reveals what the system would generate (see System Prompt Generation below).

**Interactions:**
- Squad starts with 1 empty agent card
- "+ Add Agent" adds a new card (up to 10). Counter shows "N/10 agents"
- Each agent card has a remove button (trash icon, top-right) — disabled if only 1 agent
- Agent cards are reorderable via drag (nice-to-have; not required for V1)

**Validation:**
- At least 1 agent with a role name
- Role names should be unique within the squad (warn, don't block — user might legitimately want two "Researcher" agents)
- "Next" enabled when at least 1 agent has a role name

---

### Step 3: Review & Launch

**Purpose**: Confirm everything looks right. One click to launch.

```
┌──────────────────────────────────────────────────────────┐
│  Create Your Squad                                       │
│                                                          │
│  ┌─ Step 1: Mission ── Auth Refactor ────────────── ▸ ─┐│
│  └──────────────────────────────────────────────────────┘│
│  ┌─ Step 2: Roles ── 3 agents ──────────────────── ▸ ─┐ │
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─ Step 3: Review & Launch ────────────────────── ▼ ─┐ │
│  │                                                      ││
│  │  Auth Refactor                                       ││
│  │  ─────────────                                       ││
│  │  Mission: Refactor the authentication module to      ││
│  │  use JWT tokens instead of session cookies. Update   ││
│  │  all tests and documentation.                        ││
│  │                                                      ││
│  │  Working Directory: /Users/dev/myproject             ││
│  │  Model: Sonnet · Permission Mode: Auto               ││
│  │                                                      ││
│  │  Squad (3 agents):                                   ││
│  │                                                      ││
│  │  ┌──────────┬────────────────────────┬──────────┐   ││
│  │  │ Role     │ Focus                  │ Model    │   ││
│  │  ├──────────┼────────────────────────┼──────────┤   ││
│  │  │ Backend  │ Refactor auth          │ Sonnet   │   ││
│  │  │ Dev      │ implementation         │ (default)│   ││
│  │  ├──────────┼────────────────────────┼──────────┤   ││
│  │  │ Test     │ Write unit +           │ Sonnet   │   ││
│  │  │ Writer   │ integration tests      │ (default)│   ││
│  │  ├──────────┼────────────────────────┼──────────┤   ││
│  │  │ Docs     │ (using squad mission)  │ Sonnet   │   ││
│  │  │ Writer   │                        │ (default)│   ││
│  │  └──────────┴────────────────────────┴──────────┘   ││
│  │                                                      ││
│  │  ┌──────────────────────────────────────────────┐   ││
│  │  │  ▸ Preview System Prompts                    │   ││
│  │  └──────────────────────────────────────────────┘   ││
│  │                                                      ││
│  │                          [Back]  [ Launch Squad  🚀] ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

**What's shown:**
- Squad name, full mission text
- Working directory, model, permission mode (squad-level defaults)
- Table of agents: role name, focus (or "using squad mission" if blank), model (noting if it's the default or an override)
- "Preview System Prompts" — collapsible section showing the generated system prompt for each agent. Important for transparency, but collapsed because most users don't need to see it.

**Actions:**
- "Back" — returns to Step 2 (roles)
- "Launch Squad" — creates the squad AND starts all agents immediately. This is a deliberate choice: we combine "create" and "start" into one action. Users don't need a "created but not started" squad in V1 — the value is in seeing agents work. The squad is saved to the database at this point.
- After launch, the user is redirected to the Squad Detail view where they can see all agents streaming output.

**Why "Launch" instead of "Create" then "Start"?**
Splitting create and start adds a step that doesn't serve the user. The whole point is getting to value fast. If a user wants to create a squad and start it later, they can stop agents from the squad detail view immediately after launch. The happy path (create → start → watch) should be one click.

---

## System Prompt Generation

When a user creates an agent with a role name and optional focus, the system generates a system prompt automatically. This prompt is what gets passed to the Claude Code CLI as the agent's initial instruction.

### Template

```
You are the {role_name} on a squad working on the following mission:

{squad_mission}

{focus_section}

Work independently on your part of the mission. Be thorough and proactive — don't wait for instructions unless you're genuinely blocked. When you complete your work, summarize what you did and any issues you encountered.
```

Where `{focus_section}` is:
- If the user provided a focus: `Your specific focus: {role_focus}`
- If no focus was provided: *(omitted entirely — the agent works from the mission alone)*

### Example: Dev Squad

**Squad mission**: "Refactor the authentication module to use JWT tokens instead of session cookies. Update all tests and documentation."

| Role | Focus | Generated System Prompt |
|---|---|---|
| Backend Dev | Refactor auth implementation | You are the Backend Dev on a squad working on the following mission:<br><br>Refactor the authentication module to use JWT tokens instead of session cookies. Update all tests and documentation.<br><br>Your specific focus: Refactor auth implementation<br><br>Work independently on your part of the mission. Be thorough and proactive — don't wait for instructions unless you're genuinely blocked. When you complete your work, summarize what you did and any issues you encountered. |
| Test Writer | Write unit + integration tests for the new auth flow | You are the Test Writer on a squad working on the following mission:<br><br>Refactor the authentication module to use JWT tokens instead of session cookies. Update all tests and documentation.<br><br>Your specific focus: Write unit + integration tests for the new auth flow<br><br>Work independently on your part of the mission. Be thorough and proactive — don't wait for instructions unless you're genuinely blocked. When you complete your work, summarize what you did and any issues you encountered. |
| Docs Writer | *(none)* | You are the Docs Writer on a squad working on the following mission:<br><br>Refactor the authentication module to use JWT tokens instead of session cookies. Update all tests and documentation.<br><br>Work independently on your part of the mission. Be thorough and proactive — don't wait for instructions unless you're genuinely blocked. When you complete your work, summarize what you did and any issues you encountered. |

### Example: Non-Technical Research Squad

**Squad mission**: "Research the top 5 project management tools (Asana, Monday, ClickUp, Notion, Linear) and create a comparison brief covering features, pricing, target audience, and market positioning."

| Role | Focus | Generated System Prompt |
|---|---|---|
| Market Researcher | Gather pricing, features, and positioning data for each tool | You are the Market Researcher on a squad working on the following mission:<br><br>Research the top 5 project management tools (Asana, Monday, ClickUp, Notion, Linear) and create a comparison brief covering features, pricing, target audience, and market positioning.<br><br>Your specific focus: Gather pricing, features, and positioning data for each tool<br><br>Work independently on your part of the mission. Be thorough and proactive — don't wait for instructions unless you're genuinely blocked. When you complete your work, summarize what you did and any issues you encountered. |
| Feature Analyst | *(none)* | You are the Feature Analyst on a squad working on the following mission:<br><br>Research the top 5 project management tools (Asana, Monday, ClickUp, Notion, Linear) and create a comparison brief covering features, pricing, target audience, and market positioning.<br><br>Work independently on your part of the mission. Be thorough and proactive — don't wait for instructions unless you're genuinely blocked. When you complete your work, summarize what you did and any issues you encountered. |
| Report Writer | Synthesize findings into a clear, executive-ready comparison brief | You are the Report Writer on a squad working on the following mission:<br><br>Research the top 5 project management tools (Asana, Monday, ClickUp, Notion, Linear) and create a comparison brief covering features, pricing, target audience, and market positioning.<br><br>Your specific focus: Synthesize findings into a clear, executive-ready comparison brief<br><br>Work independently on your part of the mission. Be thorough and proactive — don't wait for instructions unless you're genuinely blocked. When you complete your work, summarize what you did and any issues you encountered. |

### Design Decisions on Prompt Generation

1. **Keep it simple and transparent.** The template is intentionally plain. Fancy prompt engineering can come later — V1 needs to be predictable and debuggable.
2. **"Work independently" is deliberate.** Since V1 has no inter-agent communication, each agent must be self-sufficient. The prompt sets that expectation.
3. **"Summarize what you did" encourages closure.** Agents that finish should leave a clear summary, which helps the user review output without reading everything.
4. **Custom system prompt is a full override, not an append.** If a power user writes a custom system prompt, it replaces the generated one entirely. No merging or concatenation. This avoids confusing interactions between user-written and generated text.
5. **The mission is always included in every agent's prompt.** Even if the agent has a specific focus, it needs the full mission for context. An agent working on "write tests" needs to know what it's testing.

---

## Default Values

### For All Users

| Setting | Default | Rationale |
|---|---|---|
| Model | Sonnet | Best balance of speed, cost, and capability for most tasks. Power users select Opus for complex reasoning. |
| Permission Mode | Auto | Lets agents work without permission gates. Non-technical users should never encounter a permission prompt in V1. |
| Working Directory | `~/clawsquad-workspace/` | Neutral default. Auto-created on first squad launch if it doesn't exist. |

### For Dev Squads (user sets a custom working directory)

When the user explicitly sets a working directory to a project path, the system infers this is a dev squad. No behavior changes in V1, but this distinction matters for V2 (dev-specific templates, git integration, etc.).

### For Non-Dev Squads (default working directory)

Agents work in the default workspace. Any files they create (reports, analysis, drafts) land in `~/clawsquad-workspace/{squad-name}/`. This gives non-technical users a predictable place to find output without understanding filesystem concepts.

**Directory structure created automatically:**
```
~/clawsquad-workspace/
└── competitor-analysis/     ← named after the squad
    ├── (files created by agents land here)
    └── ...
```

---

## Interaction Details

### Keyboard Shortcuts

- **Tab** advances to next field within a step
- **Enter** in the last field of a step triggers "Next" (unless in a textarea, where Enter adds a newline)
- **Escape** during creation returns to home (with "discard changes?" confirmation if fields are filled)

### Error States

- **Claude Code CLI not found**: On launch, if the CLI is not detected, show a blocking error: "Claude Code is required but wasn't found. Install it at [link] and try again." Don't let users create squads they can't run.
- **Agent fails to start**: If one agent in the squad fails to start, the others still launch. The failed agent shows an error state with a retry button. Squad status shows "running" (partial).
- **All agents fail**: If every agent fails to start, squad status shows "error" with a clear message. "Start Squad" button reappears so the user can retry after fixing the issue.

### Editing After Creation

In V1, squads cannot be edited after creation. The user can:
- Stop and restart individual agents
- Send follow-up prompts to redirect agents
- Delete the squad and create a new one

Editing squad config (adding/removing agents, changing mission) is a V2 feature. The trade-off: less flexibility, but significantly simpler state management and UI.

---

## Quick-Start Patterns (Detail)

Quick starts are **pre-filled creation flows**, not templates. The distinction matters:
- A **template** is a saved, reusable squad configuration.
- A **quick start** is a one-time pre-fill of the creation wizard with suggested values the user can modify.

### How Quick Starts Work

1. User clicks a quick-start card on the home screen
2. The creation wizard opens with Step 1 and Step 2 already filled
3. Placeholder text (in `[brackets]`) indicates where the user should customize
4. User modifies the pre-filled values to fit their specific task
5. Flow continues normally (review → launch)

### V1 Quick Starts

**Research Squad**
- Mission: `Research [your topic] and produce a comprehensive brief with key findings, trends, and recommendations.`
- Agents: Researcher, Analyst, Report Writer
- Roles pre-filled with generic focus descriptions

**Dev Team**
- Mission: `Work on [project/feature]: implement the changes, write tests, and ensure code quality.`
- Agents: Backend Dev, Frontend Dev, Test Engineer
- Working directory: prompted (since dev squads need a real project path)

**Content Squad**
- Mission: `Create [content type, e.g., blog post, whitepaper] about [topic] that is well-researched, well-written, and ready to publish.`
- Agents: Writer, Editor

### Quick-Start Display Logic

- **Empty state (no squads)**: Show all 3 quick-start cards prominently below the main CTA
- **Home with existing squads**: Show quick starts in a smaller "Quick Start" section below the squad list, or accessible via the "+ New Squad" dropdown: "Blank Squad" | "Research Squad" | "Dev Team" | "Content Squad"
- **Returning users with 3+ squads**: Minimize quick starts — the user knows what they're doing. Show as a subtle link: "Or start from a quick-start template"

---

## Summary: The 90-Second Path

For the primary happy path (non-technical user, research squad):

| Time | Action |
|---|---|
| 0s | User clicks "Research Squad" quick-start card |
| 10s | Replaces `[your topic]` with "AI trends in healthcare" in the mission field |
| 15s | Clicks "Next" |
| 25s | Reviews 3 pre-filled roles, adds a focus to "Analyst": "Focus on regulatory implications" |
| 35s | Clicks "Next" |
| 45s | Reviews summary, clicks "Launch Squad" |
| 50s | Redirected to squad detail view, sees 3 agents starting up |
| 60s | First agent output begins streaming |

For the power developer path (blank squad, custom config):

| Time | Action |
|---|---|
| 0s | Clicks "Create Your Squad" |
| 10s | Names squad, writes mission |
| 15s | Expands advanced settings, sets working directory |
| 20s | Clicks "Next" |
| 30s | Adds 3 agents with role names and focus descriptions |
| 50s | Expands advanced on one agent, switches model to Opus |
| 60s | Clicks "Next", reviews summary |
| 70s | Clicks "Launch Squad" |
| 80s | Agents streaming output |
