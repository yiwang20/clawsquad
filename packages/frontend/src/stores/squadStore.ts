import { create } from "zustand";
import type {
  Squad,
  Agent,
  StreamMessage,
  CreateSquadRequest,
  AgentStatus,
  SquadStatus,
} from "@clawsquad/shared";
import {
  SQUADS_PATH,
  AGENTS_PATH,
  MAX_OUTPUT_BUFFER_SIZE,
} from "@clawsquad/shared";

/* ─── Store shape ───────────────────────────────────────────────────────────── */

export interface SquadStoreState {
  squads: Map<string, Squad>;
  agents: Map<string, Agent>;
  outputBuffers: Map<string, StreamMessage[]>;

  // Navigation
  activeSquadId: string | null;
  activeAgentId: string | null;

  // Data fetching
  fetchSquads(): Promise<void>;
  fetchSquad(squadId: string): Promise<Squad>;

  // Squad actions
  createSquad(req: CreateSquadRequest): Promise<Squad>;
  deleteSquad(squadId: string): Promise<void>;
  startSquad(squadId: string): Promise<void>;
  stopSquad(squadId: string): Promise<void>;

  // Agent actions
  startAgent(agentId: string): Promise<void>;
  stopAgent(agentId: string): Promise<void>;
  sendPrompt(agentId: string, prompt: string): void;
  abortAgent(agentId: string): void;

  // State updates (called by WebSocket handler)
  updateAgentStatus(agentId: string, status: AgentStatus): void;
  updateSquadStatus(squadId: string, status: SquadStatus): void;
  addOutput(agentId: string, message: StreamMessage): void;

  // Navigation
  setActiveSquad(id: string | null): void;
  setActiveAgent(id: string | null): void;
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

/** Error thrown by apiFetch — carries the HTTP status code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || `HTTP ${res.status}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

function indexAgents(squad: Squad, agents: Map<string, Agent>): void {
  for (const agent of squad.agents) {
    agents.set(agent.id, agent);
  }
}

/* ─── Output batching (RAF) ─────────────────────────────────────────────────
   Fast-streaming agents can produce dozens of messages per second. Calling
   set() on every message triggers a React re-render each time. Instead we
   accumulate messages in a pending Map and flush once per animation frame.
   This also eliminates the per-message array spread allocation.
─────────────────────────────────────────────────────────────────────────── */

/** Monotonic counter — stamped onto each message as `_seq` for stable React keys. */
let _outputSeq = 0;

/** Accumulates messages between RAF flushes: agentId → ordered list */
const _pending = new Map<string, StreamMessage[]>();
let _rafId: number | null = null;

function _flushOutputs() {
  _rafId = null;
  if (_pending.size === 0) return;

  // Snapshot and clear before reading state (re-entrant safety)
  const snapshot = new Map(_pending);
  _pending.clear();

  useSquadStore.setState((state) => {
    const nextBuffers = new Map(state.outputBuffers);
    for (const [agentId, msgs] of snapshot) {
      const existing = nextBuffers.get(agentId) ?? [];
      // concat is cheaper than spread for large arrays
      const combined = existing.concat(msgs);
      nextBuffers.set(
        agentId,
        combined.length > MAX_OUTPUT_BUFFER_SIZE
          ? combined.slice(-MAX_OUTPUT_BUFFER_SIZE)
          : combined,
      );
    }
    return { outputBuffers: nextBuffers };
  });
}

/* ─── WebSocket send (set externally by useWebSocket hook) ──────────────────── */

let wsSend: ((msg: string) => void) | null = null;

export function registerWsSend(fn: ((msg: string) => void) | null): void {
  wsSend = fn;
}

/* ─── Store ─────────────────────────────────────────────────────────────────── */

export const useSquadStore = create<SquadStoreState>((set, get) => ({
  squads: new Map(),
  agents: new Map(),
  outputBuffers: new Map(),
  activeSquadId: null,
  activeAgentId: null,

  /* ── Data fetching ───────────────────────────────────────────────────── */

  async fetchSquads() {
    const list = await apiFetch<Squad[]>(SQUADS_PATH);
    const squads = new Map<string, Squad>();
    const agents = new Map(get().agents);
    for (const squad of list) {
      squads.set(squad.id, squad);
      indexAgents(squad, agents);
    }
    set({ squads, agents });
  },

  async fetchSquad(squadId: string) {
    const squad = await apiFetch<Squad>(`${SQUADS_PATH}/${squadId}`);
    const squads = new Map(get().squads);
    const agents = new Map(get().agents);
    squads.set(squad.id, squad);
    indexAgents(squad, agents);
    set({ squads, agents });
    return squad;
  },

  /* ── Squad actions ───────────────────────────────────────────────────── */

  async createSquad(req: CreateSquadRequest) {
    const squad = await apiFetch<Squad>(SQUADS_PATH, {
      method: "POST",
      body: JSON.stringify(req),
    });
    const squads = new Map(get().squads);
    const agents = new Map(get().agents);
    squads.set(squad.id, squad);
    indexAgents(squad, agents);
    set({ squads, agents });
    return squad;
  },

  async deleteSquad(squadId: string) {
    await apiFetch<void>(`${SQUADS_PATH}/${squadId}`, { method: "DELETE" });
    const squads = new Map(get().squads);
    const agents = new Map(get().agents);
    const outputBuffers = new Map(get().outputBuffers);
    const squad = squads.get(squadId);
    if (squad) {
      for (const agent of squad.agents) {
        agents.delete(agent.id);
        outputBuffers.delete(agent.id);
      }
    }
    squads.delete(squadId);
    set({ squads, agents, outputBuffers });
  },

  async startSquad(squadId: string) {
    const squad = await apiFetch<Squad>(`${SQUADS_PATH}/${squadId}/start`, {
      method: "POST",
    });
    const squads = new Map(get().squads);
    const agents = new Map(get().agents);
    squads.set(squad.id, squad);
    indexAgents(squad, agents);
    set({ squads, agents });
  },

  async stopSquad(squadId: string) {
    const squad = await apiFetch<Squad>(`${SQUADS_PATH}/${squadId}/stop`, {
      method: "POST",
    });
    const squads = new Map(get().squads);
    const agents = new Map(get().agents);
    squads.set(squad.id, squad);
    indexAgents(squad, agents);
    set({ squads, agents });
  },

  /* ── Agent actions ───────────────────────────────────────────────────── */

  async startAgent(agentId: string) {
    const agent = await apiFetch<Agent>(`${AGENTS_PATH}/${agentId}/start`, {
      method: "POST",
    });
    const agents = new Map(get().agents);
    agents.set(agent.id, agent);
    set({ agents });
  },

  async stopAgent(agentId: string) {
    const agent = await apiFetch<Agent>(`${AGENTS_PATH}/${agentId}/stop`, {
      method: "POST",
    });
    const agents = new Map(get().agents);
    agents.set(agent.id, agent);
    set({ agents });
  },

  sendPrompt(agentId: string, prompt: string) {
    if (wsSend) {
      wsSend(JSON.stringify({ type: "agent:prompt", agentId, prompt }));
    }
  },

  abortAgent(agentId: string) {
    if (wsSend) {
      wsSend(JSON.stringify({ type: "agent:abort", agentId }));
    }
  },

  /* ── State updates (from WebSocket) ──────────────────────────────────── */

  updateAgentStatus(agentId: string, status: AgentStatus) {
    const agents = new Map(get().agents);
    const agent = agents.get(agentId);
    if (agent) {
      agents.set(agentId, { ...agent, status });
      set({ agents });
    }
  },

  updateSquadStatus(squadId: string, status: SquadStatus) {
    const squads = new Map(get().squads);
    const squad = squads.get(squadId);
    if (squad) {
      squads.set(squadId, { ...squad, status });
      set({ squads });
    }
  },

  addOutput(agentId: string, message: StreamMessage) {
    // Stamp a monotonic sequence ID so OutputFeed can use it as a stable key
    const stamped: StreamMessage = { ...message, _seq: ++_outputSeq };

    // Push into the pending buffer (mutate in place — no new array per message)
    const arr = _pending.get(agentId);
    if (arr) {
      arr.push(stamped);
    } else {
      _pending.set(agentId, [stamped]);
    }

    // Schedule a flush if none is pending
    if (_rafId === null) {
      _rafId = requestAnimationFrame(_flushOutputs);
    }
  },

  /* ── Navigation ──────────────────────────────────────────────────────── */

  setActiveSquad(id: string | null) {
    set({ activeSquadId: id });
  },

  setActiveAgent(id: string | null) {
    set({ activeAgentId: id });
  },
}));
