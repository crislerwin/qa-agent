import { ExploratoryAgent } from "../../agents/exploratory.ts";
import { AppDatabase } from "../../database/database.ts";
import { getDefaultModel } from "../../services/llm.ts";
import { createLogger } from "../../utils/logger.ts";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import { activeTests } from "../server.ts";
import type { AgentConfig } from "../../types/index.ts";

const logger = createLogger("mcp:exploratory");

// Global map for agent instances so stop_test can reach them
const agentInstances = new Map<string, ExploratoryAgent>();

export async function handleRunExploratoryTest(args: {
  baseUrl: string;
  maxSteps?: number;
  mode?: string;
  sessionId?: string;
  authRequired?: boolean;
  authEmail?: string;
  authPassword?: string;
  authAppIdentifier?: string;
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

  // Build auth config if requested
  let authConfig: AgentConfig["auth"] = undefined;
  if (args.authRequired) {
    const email = args.authEmail?.trim();
    const password = args.authPassword?.trim();
    const appId = args.authAppIdentifier?.trim() || "mcp-test";

    if (!email || !password) {
      throw new Error(
        "authRequired is true but authEmail or authPassword is missing",
      );
    }

    authConfig = {
      required: true,
      appIdentifier: appId,
      credentials: {
        email,
        password,
      },
    };
    logger.info(
      `Auth configured for session ${testSessionId}: ${email} on app ${appId}`,
    );
  }

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
    auth: authConfig,
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
            authConfigured: !!authConfig,
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
  auth?: AgentConfig["auth"];
}) {
  const { baseUrl, maxSteps, sessionId, model, auth } = options;

  try {
    const config: AgentConfig = {
      baseUrl,
      maxSteps,
      sessionId,
      model,
      auth,
    };

    const agent = new ExploratoryAgent(config);

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
        execution.progress = Math.min(
          100,
          Math.round((steps / maxSteps) * 100),
        );
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

export function getAgentInstance(
  sessionId: string,
): ExploratoryAgent | undefined {
  return agentInstances.get(sessionId);
}
