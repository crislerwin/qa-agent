import { type BaseChatModel } from "@langchain/core/language_models/chat_models";

export interface AgentFinding {
  type:
    | "broken_image"
    | "console_error"
    | "network_error"
    | "validation_error"
    | "functional_bug"
    | "ux_issue"
    | "bug"
    | "layout"
    | "visual_regression"
    | "other";
  description: string;
  url: string;
  selector?: string; // unique element identifier (e.g. css selector)
  severity: "info" | "low" | "medium" | "high" | "critical";
  category?: "layout" | "functional" | "visual" | "performance" | "security" | "other";
  screenshot?: string; // path to screenshot
  metadata?: Record<string, any>; // Additional context (status codes, error messages, etc.)
  occurrences?: string[]; // List of other URLs where this finding was seen
  count?: number; // Total number of times seen
}


export interface AgentHistory {
  action: string;
  reason: string;
  url: string;
  result?: string;
  params?: any;
}



export interface AgentState {
  visitedUrls: Set<string>;
  findings: AgentFinding[];
  steps: number;
  history: AgentHistory[]; // Short-term memory
  todoQueue: string[]; // URLs to explore
}

export interface AgentConfig {
  baseUrl: string;
  maxSteps?: number;
  model?: BaseChatModel;
  sessionId?: string;
  auth?: {
    required: boolean;
    appIdentifier: string;
    autoLogin?: boolean;
    credentials?: {
      username?: string;
      email?: string;
      password: string;
      totpSecret?: string;
    };
  };
  // Test generation configuration
  enableTestGeneration?: boolean;
  testOutputDir?: string;
  includeE2ETests?: boolean;
  testDryRun?: boolean;
  testParallelExecution?: boolean;
  testMaxConcurrency?: number;
  testTimeout?: number;
  testRetryCount?: number;
}

export interface BrokenImageFinding {
  src: string;
  srcset?: string; // Added field
  alt: string;
  selector: string;
  reason: string;
  location: { x: number; y: number };
}

// ── Visual Regression Testing Types ──────────────────────
export interface ViewportConfig {
  width: number;
  height: number;
  name: string;
}

export interface VisualRegressionConfig {
  enabled: boolean;
  baselineDir: string;
  currentDir: string;
  diffDir: string;
  viewports: ViewportConfig[];
  threshold: number; // Pixel difference percentage threshold (0-1)
  pixelmatchThreshold: number; // Sensitivity (0-1, lower = more strict)
  captureFullPage: boolean;
  generateDiffImages: boolean;
}

export interface VisualRegressionResult {
  url: string;
  viewport: ViewportConfig;
  baselineExists: boolean;
  baselinePath?: string;
  currentPath: string;
  diffPath?: string;
  match: boolean;
  diffPercentage: number;
  diffPixelCount: number;
  isNewBaseline: boolean;
}

// ── Single-Page Testing Types (RFC #9) ──────────────────────
export interface LayoutAuditConfig {
  enabled: boolean;
  maxElements: number;
  heuristics: string[]; // which heuristics to run (default: all)
  screenshots?: {
    enabled: boolean;
    outputDir?: string;
    highlightElements?: boolean;
    fullPage?: boolean;
    type?: "png" | "jpeg";
  };
}

export interface LayoutAuditFinding {
  type: string;
  severity: "error" | "warning" | "info";
  category: "layout" | "visual" | "other";
  message: string;
  selector?: string;
  screenshot?: string; // Path to element screenshot
  fullPageScreenshot?: string; // Path to full page reference screenshot
}

export interface SinglePageTestConfig {
  targetUrl: string;
  maxTestCases?: number;
  model?: BaseChatModel;
  sessionId?: string;
  strategy?: "comprehensive" | "critical-path" | "edge-cases";
  auth?: AgentConfig["auth"];
  layoutAudit?: LayoutAuditConfig; // NEW
  visualRegression?: VisualRegressionConfig; // NEW
}

export interface TestStep {
  action: "click" | "fill" | "select" | "hover" | "wait" | "verify" | "navigate";
  selector?: string;
  value?: string;
  description: string;
  condition?: string; // e.g. "if modal is visible"
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  category: "form" | "navigation" | "interaction" | "validation" | "visual";
  preconditions?: string[];
  steps: TestStep[];
  expectedOutcome: string;
}

export interface PageCoverage {
  forms: number;
  buttons: number;
  links: number;
  inputs: number;
  otherInteractive: number;
}

export interface TestPlan {
  pageUrl: string;
  pageTitle: string;
  totalTests: number;
  estimatedDurationSeconds: number;
  coverage: PageCoverage;
  testCases: TestCase[];
}

export interface TestCaseResult {
  testCaseId: string;
  status: "passed" | "failed" | "skipped" | "error";
  executionTimeMs: number;
  stepsExecuted: number;
  findings: AgentFinding[];
  actualOutcome?: string;
  errorMessage?: string;
}

export interface SinglePageTestState {
  sessionId: string;
  testPlan: TestPlan | null;
  results: TestCaseResult[];
  currentTestIndex: number;
  status: "planning" | "executing" | "completed" | "failed" | "stopped";
  currentAction: string;
  lastError: string | null;
  startTime: number;
  endTime?: number;
}

export type DiscoveredElement = {
  tag: string;
  selector: string;
  text: string;
  attributes: Record<string, string | null>;
  type?: string; // for input elements
  isVisible: boolean;
  interactable: boolean;
};