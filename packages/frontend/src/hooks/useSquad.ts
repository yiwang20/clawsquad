import type { Squad, Agent, StreamMessage } from "@clawsquad/shared";
import { useSquadStore } from "../stores/squadStore";

/**
 * Returns the squad and its agents for a given squad ID.
 * Agents are resolved from the flat agents map so real-time status updates
 * are reflected without re-fetching the squad object.
 */
export function useSquad(squadId: string): {
  squad: Squad | undefined;
  agents: Agent[];
} {
  const squad = useSquadStore((s) => s.squads.get(squadId));
  const agentsMap = useSquadStore((s) => s.agents);

  const agents: Agent[] = squad
    ? squad.agents
        .map((a) => agentsMap.get(a.id) ?? a)
        .sort((a, b) => a.roleName.localeCompare(b.roleName))
    : [];

  return { squad, agents };
}

/**
 * Returns the agent and its output buffer for a given agent ID.
 */
export function useAgent(agentId: string): {
  agent: Agent | undefined;
  output: StreamMessage[];
} {
  const agent = useSquadStore((s) => s.agents.get(agentId));
  const output = useSquadStore((s) => s.outputBuffers.get(agentId) ?? []);

  return { agent, output };
}

/**
 * Returns all squads sorted newest-first.
 */
export function useSquadList(): Squad[] {
  const squads = useSquadStore((s) => s.squads);
  return Array.from(squads.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
