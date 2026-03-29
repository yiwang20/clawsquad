import type { Database, AgentMessageRow } from "./Database.js";

export type { AgentMessageRow };

export class AgentMessageStore {
  constructor(private readonly db: Database) {}

  sendMessage(
    squadId: string,
    fromAgentId: string,
    toAgentId: string,
    content: string
  ): AgentMessageRow {
    const now = new Date().toISOString();
    const id = this.db.insertAgentMessage({
      squad_id: squadId,
      from_agent_id: fromAgentId,
      to_agent_id: toAgentId,
      content,
      created_at: now,
    });
    return this.db.getAgentMessage(id)!;
  }

  broadcastMessage(
    squadId: string,
    fromAgentId: string,
    content: string
  ): AgentMessageRow {
    const now = new Date().toISOString();
    const id = this.db.insertAgentMessage({
      squad_id: squadId,
      from_agent_id: fromAgentId,
      to_agent_id: null,
      content,
      created_at: now,
    });
    return this.db.getAgentMessage(id)!;
  }

  /**
   * Returns messages directed to `agentId` (direct + broadcasts where to_agent_id IS NULL),
   * ordered by created_at ASC. Optional `since` filters to messages after that timestamp.
   */
  getMessagesForAgent(agentId: string, since?: string): AgentMessageRow[] {
    return this.db.listMessagesForAgent(agentId, since);
  }

  getSquadMessages(squadId: string, limit?: number): AgentMessageRow[] {
    return this.db.listSquadMessages(squadId, limit);
  }
}

/** Convert an AgentMessageRow to the camelCase AgentMessageResponse shape. */
export function agentMessageRowToResponse(row: AgentMessageRow) {
  return {
    id: row.id,
    squadId: row.squad_id,
    fromAgentId: row.from_agent_id,
    toAgentId: row.to_agent_id,
    content: row.content,
    createdAt: row.created_at,
  };
}
