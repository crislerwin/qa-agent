import { AppDatabase } from "../../database/database.ts";
import { SessionRepository } from "../../repositories/session.repository.ts";
import { createLogger } from "../../utils/logger.ts";
import { activeTests } from "../server.ts";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";

const logger = createLogger("mcp:sessions");

export async function handleListSessions(args: {
  status?: string;
  limit?: number;
}): Promise<{ content: TextContent[] }> {
  const limit =
    typeof args.limit === "number" && args.limit > 0 ? args.limit : 10;
  const statusFilter = String(args.status || "all");

  const sessions: Array<{
    sessionId: string;
    status: string;
    startTime?: string;
    endTime?: string;
    findingsCount: number;
    visitedUrlsCount: number;
  }> = [];

  // 1. Active (in-memory) sessions
  for (const entry of Array.from(activeTests.entries())) {
    const [sid, exec] = entry;
    if (
      statusFilter !== "all" &&
      statusFilter === "completed" &&
      exec.status !== "completed"
    ) {
      continue;
    }
    if (
      statusFilter === "active" &&
      (exec.status === "completed" || exec.status === "failed")
    ) {
      continue;
    }

    sessions.push({
      sessionId: sid,
      status: exec.status,
      startTime: exec.startTime.toISOString(),
      endTime: exec.endTime?.toISOString(),
      findingsCount: exec.findingsCount,
      visitedUrlsCount: exec.visitedUrlsCount,
    });
  }

  // 2. Persisted sessions from SQLite (if limit not reached)
  if (sessions.length < limit) {
    try {
      const db = AppDatabase.getInstance();
      const repo = new SessionRepository(db.getDatabase());
      const storedIds = repo.listSessions().slice(0, limit);

      for (const storedId of storedIds) {
        // Skip if already listed as active
        if (sessions.some((s) => s.sessionId === storedId)) continue;

        const state = repo.loadState(storedId);
        if (!state) continue;

        // Determine if it was completed based on presence of endTime / findings
        const looksActive = state.steps < 50 && state.todoQueue.length > 0;
        const storedStatus = looksActive ? "active" : "completed";

        if (statusFilter !== "all" && statusFilter !== storedStatus) continue;

        sessions.push({
          sessionId: storedId,
          status: storedStatus,
          startTime: undefined, // We don't persist startTime separately
          endTime: undefined,
          findingsCount: state.findings.length,
          visitedUrlsCount: state.visitedUrls.size,
        });
      }
    } catch (e) {
      logger.error(`Failed to load stored sessions: ${e}`);
    }
  }

  const result = sessions.slice(0, limit);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            total: result.length,
            sessions: result,
          },
          null,
          2,
        ),
      } as TextContent,
    ],
  };
}
