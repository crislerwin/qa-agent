import { SinglePageTestingAgent } from "../../agents/single-page";
import { AppDatabase } from "../../database/database";
import { activeTests } from "../server";
import { createLogger } from "../../utils/logger";
import type { 
  VisualRegressionConfig, 
  LayoutAuditConfig 
} from "../../types/index";

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
  visualRegression?: {
    enabled?: boolean;
    baselineDir?: string;
    currentDir?: string;
    diffDir?: string;
    viewports?: Array<{ width: number; height: number; name: string }>;
    threshold?: number;
    pixelmatchThreshold?: number;
    captureFullPage?: boolean;
    generateDiffImages?: boolean;
  };
  layoutAudit?: {
    enabled?: boolean;
    maxElements?: number;
    heuristics?: string[];
    screenshots?: {
      enabled?: boolean;
      outputDir?: string;
      highlightElements?: boolean;
      type?: "png" | "jpeg";
    };
  };
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

  // Store initial state
  activeTests.set(sessionId, {
    sessionId,
    state: initialState,
    abortController: { abort: () => {} },
  });

  // Build optional configs
  let visualRegressionConfig: VisualRegressionConfig | undefined;
  if (args.visualRegression?.enabled) {
    visualRegressionConfig = {
      enabled: true,
      baselineDir: args.visualRegression.baselineDir ?? "./test-results/baselines",
      currentDir: args.visualRegression.currentDir ?? "./test-results/current",
      diffDir: args.visualRegression.diffDir ?? "./test-results/diffs",
      viewports: args.visualRegression.viewports ?? [
        { width: 1920, height: 1080, name: "desktop" },
        { width: 768, height: 1024, name: "tablet" },
        { width: 375, height: 667, name: "mobile" },
      ],
      threshold: args.visualRegression.threshold ?? 0.1,
      pixelmatchThreshold: args.visualRegression.pixelmatchThreshold ?? 0.1,
      captureFullPage: args.visualRegression.captureFullPage ?? true,
      generateDiffImages: args.visualRegression.generateDiffImages ?? true,
    };
  }

  let layoutAuditConfig: LayoutAuditConfig | undefined;
  if (args.layoutAudit?.enabled) {
    layoutAuditConfig = {
      enabled: true,
      maxElements: args.layoutAudit.maxElements ?? 300,
      heuristics: args.layoutAudit.heuristics ?? [],
      screenshots: args.layoutAudit.screenshots?.enabled
        ? {
            enabled: true,
            outputDir: args.layoutAudit.screenshots.outputDir ?? "./test-results/layout-audit",
            highlightElements: args.layoutAudit.screenshots.highlightElements ?? true,
            type: args.layoutAudit.screenshots.type ?? "png",
          }
        : undefined,
    };
  }

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
        visualRegression: visualRegressionConfig,
        layoutAudit: layoutAuditConfig,
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
        (entry as any).state = { ...(entry as any).state, currentAction: "Browser initialized, discovering elements..." };
      }

      const finalState = await agent.start();
      const entry2 = activeTests.get(sessionId);
      if (entry2) (entry2 as any).state = finalState;
    } catch (error: any) {
      logger.error(`Single-page test ${sessionId} failed:`, error);
      const entry = activeTests.get(sessionId);
      if (entry) {
        entry.state = {
          ...entry.state,
          status: "failed",
          lastError: error.message,
          currentAction: "failed",
          endTime: Date.now(),
        };
      }
    }
  })();

  // Build response message
  const features: string[] = [];
  if (args.visualRegression?.enabled) {
    features.push(`visual regression (${visualRegressionConfig?.viewports.length || 0} viewports)`);
  }
  if (args.layoutAudit?.enabled) {
    features.push("layout audit");
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          sessionId,
          targetUrl: args.targetUrl,
          authConfigured: !!args.authRequired,
          features: features.length > 0 ? features : undefined,
          message: features.length > 0
            ? `Single-page test started for ${args.targetUrl} with ${features.join(" + ")}. Use get_test_status with sessionId "${sessionId}" to monitor progress.`
            : `Single-page test started for ${args.targetUrl}. Use get_test_status with sessionId "${sessionId}" to monitor progress.`,
        }, null, 2),
      },
    ],
  };
}
