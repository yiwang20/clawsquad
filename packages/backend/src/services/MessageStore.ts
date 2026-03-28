import type {
  Agent,
  AgentStatus,
  StoredMessage,
  PaginatedMessagesResponse,
  StreamMessage,
} from "@clawsquad/shared";
import type { Database } from "./Database.js";
import type { AgentRow } from "./Database.js";

/**
 * MessageStore provides higher-level access to agent and message data.
 * It wraps Database and is the canonical source for agent reads (status from DB).
 */
export class MessageStore {
  constructor(private readonly db: Database) {}

  getAgent(agentId: string): Agent | null {
    const row = this.db.getAgent(agentId);
    return row ? rowToAgent(row) : null;
  }

  saveMessage(
    agentId: string,
    role: StoredMessage["role"],
    type: string,
    content: StreamMessage
  ): void {
    this.db.insertMessage({
      agent_id: agentId,
      role,
      type,
      content: JSON.stringify(content),
      created_at: new Date().toISOString(),
    });
  }

  getMessages(
    agentId: string,
    opts: { page: number; pageSize: number }
  ): PaginatedMessagesResponse {
    const { page, pageSize } = opts;
    const offset = (page - 1) * pageSize;
    const total = this.db.countMessages(agentId);
    const rows = this.db.listMessages(agentId, pageSize, offset);

    const messages: StoredMessage[] = rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      role: row.role as StoredMessage["role"],
      type: row.type,
      content: row.content,
      createdAt: row.created_at,
    }));

    return { messages, total, page, pageSize };
  }
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    squadId: row.squad_id,
    roleName: row.role_name,
    roleDescription: row.role_description,
    model: row.model,
    permissionMode: row.permission_mode,
    workingDirectory: row.working_directory,
    systemPrompt: row.system_prompt,
    sessionId: row.session_id,
    status: row.status as AgentStatus,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}
