import { createLogger } from "../../utils/logger.ts";
import { activeTests } from "../server.ts";
import { getAgentInstance } from "./exploratory.ts";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";

const logger = createLogger("mcp:status");

export async function handleGetTestStatus(args: {
  sessionId: string;
}): Promise<{ content: TextContent[] }> {
  const sessionId = String(args.sessionId).trim();
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const execution = activeTests.get(sessionId);

  // Merge with in-memory agent state if still running
  const agent = getAgentInstance(sessionId);
  const findings = agent?.getFindings() ?? [];

  const recentFindings = [...findings]
    .sort(
      (a, b) =>
        (b.metadata?.timestamp ? Number(b.metadata.timestamp) : 0) -
        (a.metadata?.timestamp ? Number(a.metadata.timestamp) : 0),
    )
    .slice(0, 10);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            sessionId,
            status: execution?.status ?? "unknown",
            progress: execution?.progress ?? 0,
            currentAction: execution?.currentAction ?? "N/A",
            stats: {
              visitedPages: execution?.visitedUrlsCount ?? 0,
              findingsCount: execution?.findingsCount ?? findings.length,
              queueLength: 0,
            },
            recentFindings: recentFindings.map((f) => ({
              type: f.type,
              description: f.description,
              severity: f.severity,
              url: f.url,
            })),
            startTime: execution?.startTime.toISOString() ?? undefined,
            endTime: execution?.endTime?.toISOString() ?? undefined,
          },
          null,
          2,
        ),
      } as TextContent,
    ],
  };
}

export async function handleStopTest(args: {
  sessionId: string;
}): Promise<{ content: TextContent[] }> {
  const sessionId = String(args.sessionId).trim();
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const execution = activeTests.get(sessionId);
  if (!execution) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId,
              status: "not_found",
              message: `No active test found for session ${sessionId}`,
            },
            null,
            2,
          ),
        } as TextContent,
      ],
    };
  }

  if (execution.status === "completed" || execution.status === "stopped") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId,
              status: execution.status,
              message: `Test was already ${execution.status}`,
            },
            null,
            2,
          ),
        } as TextContent,
      ],
    };
  }

  // Signal background loop to stop via the shared map
  execution.status = "stopped";
  logger.info(`Stop signal sent for test ${sessionId}`);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            sessionId,
            status: "stopping",
            message: "Stop signal sent, test will end gracefully",
          },
          null,
          2,
        ),
      } as TextContent,
    ],
  };
}
