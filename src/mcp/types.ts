import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import type { AgentFinding, AgentState } from "../types/index.ts";

export interface TestExecution {
  sessionId: string;
  baseUrl?: string;
  status: "pending" | "running" | "completed" | "failed" | "stopped";
  strategy?: string;
  startTime: Date;
  endTime?: Date;
  findingsCount: number;
  visitedUrlsCount: number;
  progress: number;
  currentAction?: string;
  lastError?: string;
}

export interface TestStatusResult {
  sessionId: string;
  status: string;
  progress: number;
  currentAction: string;
  stats: {
    visitedPages?: number;
    findingsCount: number;
    executedTests?: number;
    queueLength?: number;
    visitedUrls?: number;
  };
  recentFindings: AgentFinding[];
}

export interface ExploratoryTestResult {
  sessionId: string;
  status: string;
  message: string;
  stats: {
    visitedPages: number;
    findingsCount: number;
    queueLength: number;
  };
}

export interface SinglePageTestResult {
  sessionId: string;
  status: string;
  testPlan: {
    totalTests: number;
    estimatedDuration: number;
  };
  progress: {
    completedTests: number;
    failedTests: number;
    passedTests: number;
  };
}

export interface ListSessionsResult {
  sessions: SessionSummary[];
  total: number;
}

export interface SessionSummary {
  sessionId: string;
  status: string;
  startTime?: string;
  endTime?: string;
  findingsCount: number;
  visitedUrlsCount: number;
}

/**
 * Helper to wrap any MCP tool response in correct content format.
 */
export function toTextContent(data: unknown): TextContent[] {
  return [
    {
      type: "text",
      text: JSON.stringify(data, null, 2),
    } as TextContent,
  ];
}
