import { Database } from "bun:sqlite";
import { createLogger } from "../utils/logger.ts";
import type { AgentState } from "../types/index.ts";

const logger = createLogger("repository:session");

export class SessionRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  saveState(sessionId: string, state: AgentState) {
    try {
      // Convert Sets to Arrays for JSON serialization
      const serializedState = JSON.stringify(state, (key, value) => {
        if (value instanceof Set) {
          return { _type: "Set", values: Array.from(value) };
        }
        return value;
      });

      const query = this.db.prepare(`
        INSERT INTO agent_sessions (id, state, updated_at)
        VALUES ($id, $state, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          state = excluded.state,
          updated_at = excluded.updated_at
      `);

      query.run({
        $id: sessionId,
        $state: serializedState,
      });

      logger.info(`State saved for session: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to save state for session ${sessionId}: ${error}`);
    }
  }

  loadState(sessionId: string): AgentState | null {
    try {
      const row = this.db
        .query("SELECT state FROM agent_sessions WHERE id = $id")
        .get({
          $id: sessionId,
        }) as { state: string } | null;

      if (!row) return null;

      // Revive Sets from Arrays
      const state = JSON.parse(row.state, (key, value) => {
        if (value && typeof value === "object" && value._type === "Set") {
          return new Set(value.values);
        }
        return value;
      });

      logger.info(`State loaded for session: ${sessionId}`);
      return state as AgentState;
    } catch (error) {
      logger.error(`Failed to load state for session ${sessionId}: ${error}`);
      return null;
    }
  }

  listSessions(): string[] {
    try {
      const rows = this.db
        .query("SELECT id FROM agent_sessions ORDER BY updated_at DESC")
        .all() as { id: string }[];
      return rows.map((row) => row.id);
    } catch (error) {
      logger.error(`Failed to list sessions: ${error}`);
      return [];
    }
  }
}
