import { ExploratoryAgent } from "../../agents/exploratory.ts";
import { AppDatabase } from "../../database/database.ts";
import { getDefaultModel } from "../../services/llm.ts";
import { createLogger } from "../../utils/logger.ts";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import { activeTests } from "../server.ts";

const logger = createLogger("mcp:exploratory");

// Global map for agent instances so stop_test can reach them
const agentInstances = new Map<string, ExploratoryAgent>();

export async function handleRunExploratoryTest(args: {
  baseUrl: string;
  maxSteps?: number;
  mode?: string;
  sessionId?: string;
}): Promise<{ content: TextContent[] }> {
  const baseUrl = String(args.baseUrl).trim();
  if (!baseUrl || !URL.canParse(baseUrl)) {
    throw new Error(`Invalid baseUrl: "${args.baseUrl}"`);
  }

  const maxSteps = typeof args.maxSteps === "number" ? args.maxSteps : 50;
  const testSessionId =
    typeof args.sessionId === "string" && args.sessionId.trim()
      ? args.sessionId.trim()
      : `exp-${Date.now()}`;

  // Record pending execution
  activeTests.set(testSessionId, {
    sessionId: testSessionId,
    baseUrl,
    status: "pending",
    startTime: new Date(),
    findingsCount: 0,
    visitedUrlsCount: 0,
    progress: 0,
  });

  // Start the test **in the background** so the tool call returns immediately
  const db = AppDatabase.getInstance();
  const model = getDefaultModel();

  startTestInBackground({
    baseUrl,
    maxSteps,
    sessionId: testSessionId,
    model,
    db,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            sessionId: testSessionId,
            status: "started",
            message: `Exploratory test started for ${baseUrl}`,
            stats: {
              visitedPages: 0,
              findingsCount: 0,
              queueLength: 0,
            },
          },
          null,
          2,
        ),
      } as TextContent,
    ],
  };
}

async function startTestInBackground(options: {
  baseUrl: string;
  maxSteps: number;
  sessionId: string;
  model: import("@langchain/core/language_models/chat_models").BaseChatModel;
  db: AppDatabase;
}) {
  const { baseUrl, maxSteps, sessionId, model } = options;

  try {
    const agent = new ExploratoryAgent({
      baseUrl,
      maxSteps,
      sessionId,
      model,
    });

    agentInstances.set(sessionId, agent);
    logger.info(`Starting background test ${sessionId}`);

    const execution = activeTests.get(sessionId);
    if (execution) {
      execution.status = "running";
      execution.currentAction = "Starting browser...";
    }

    await agent.start();
    logger.info(`Agent started for ${sessionId}`);

    let completed = false;
    let steps = 0;

    while (!completed && steps < maxSteps) {
      // Check for external stop signal
      const exec = activeTests.get(sessionId);
      if (exec?.status === "stopped") {
        logger.info(`Test ${sessionId} stopped externally`);
        break;
      }

      const result = await agent.step();
      steps++;
      completed = result.completed;

      if (execution) {
        execution.progress = Math.min(100, Math.round((steps / maxSteps) * 100));
        execution.currentAction = result.action;
        execution.visitedUrlsCount = agent.getVisitedUrls().length;
        execution.findingsCount = agent.getFindings().length;
      }

      if (completed) {
        logger.info(`Test ${sessionId} completed after ${steps} steps`);
        break;
      }

      // Tiny delay so event loop is not fully blocked
      await new Promise((r) => setTimeout(r, 500));
    }

    if (execution) {
      execution.status = completed ? "completed" : "stopped";
      execution.endTime = new Date();
      execution.progress = 100;
      execution.currentAction = completed ? "Finished" : "Stopped";
    }

    await agent.stop();
    logger.info(`Agent stopped for ${sessionId}`);
  } catch (error: any) {
    logger.error(`Test ${sessionId} failed: ${error.message}`);
    const exec = activeTests.get(sessionId);
    if (exec) {
      exec.status = "failed";
      exec.endTime = new Date();
      exec.lastError = error.message;
    }
  } finally {
    agentInstances.delete(sessionId);
  }
}

export function getAgentInstance(sessionId: string): ExploratoryAgent | undefined {
  return agentInstances.get(sessionId);
}
