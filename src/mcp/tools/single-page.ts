import { SinglePageTestingAgent } from "../../agents/single-page";
import { AppDatabase } from "../../database/database";
import { activeTests } from "../server";
import { createLogger } from "../../utils/logger";

const logger = createLogger("mcp:single-page");

export async function handleRunSinglePageTest(args: {
  targetUrl: string;
  maxTestCases?: number;
  strategy?: string;
  sessionId?: string;
  authRequired?: boolean;
  authEmail?: string;
  authPassword?: string;
  authAppIdentifier?: string;
}) {
  const sessionId = args.sessionId || `sp-${Date.now()}`;

  const initialState = {
    sessionId,
    testPlan: null,
    results: [],
    currentTestIndex: -1,
    status: "planning" as const,
    currentAction: "Initializing browser...",
    lastError: null,
    startTime: Date.now(),
  };

  // Store initial state (single-page test execution)
  activeTests.set(sessionId, {
    sessionId,
    baseUrl: args.targetUrl,
    status: "running",
    startTime: new Date(),
    findingsCount: 0,
    visitedUrlsCount: 0,
    progress: 0,
    currentAction: "Initializing browser...",
  } as any);

  // Fire-and-forget
  (async () => {
    try {
      const db = AppDatabase.getInstance();
      const agent = new SinglePageTestingAgent({
        targetUrl: args.targetUrl,
        maxTestCases: args.maxTestCases || 20,
        strategy: (args.strategy || "comprehensive") as any,
        sessionId,
        auth: args.authRequired
          ? {
              required: true,
              appIdentifier: args.authAppIdentifier || "mcp-test",
              credentials: args.authEmail
                ? {
                    email: args.authEmail,
                    password: args.authPassword || "",
                  }
                : undefined,
            }
          : undefined,
      });

      // Update abort handler
      const entry = activeTests.get(sessionId);
      if (entry) {
        (entry as any).abortController = {
          abort: () => {
            logger.info(`Abort requested for single-page test ${sessionId}`);
            agent.stop();
          },
        };
        (entry as any).state = { ...((entry as any).state || {}), currentAction: "Browser initialized, discovering elements..." };
      }

      const finalState = await agent.start();
      const entry2 = activeTests.get(sessionId);
      if (entry2) (entry2 as any).state = finalState;
    } catch (error: any) {
      logger.error(`Single-page test ${sessionId} failed:`, error);
      const entry = activeTests.get(sessionId);
      if (entry) {
        if (entry) {
          (entry as any).status = "failed";
          (entry as any).lastError = error.message;
          (entry as any).currentAction = "failed";
        }
      }
    }
  })();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          sessionId,
          targetUrl: args.targetUrl,
          authConfigured: !!args.authRequired,
          message: `Single-page test started for ${args.targetUrl}. Use get_test_status with sessionId "${sessionId}" to monitor progress.`,
        }, null, 2),
      },
    ],
  };
}
