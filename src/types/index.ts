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
    | "other";
  description: string;
  url: string;
  selector?: string; // unique element identifier (e.g. css selector)
  severity: "low" | "medium" | "high" | "critical";
  screenshot?: string; // path to screenshot
  metadata?: Record<string, any>; // Additional context (status codes, error messages, etc.)
}

export interface AgentState {
  visitedUrls: Set<string>;
  findings: AgentFinding[];
  steps: number;
  history: { action: string; reason: string; url: string; result?: string }[]; // Short-term memory
  todoQueue: string[]; // URLs to explore
  scannedUrls: Set<string>; // URLs that have been scanned for broken images
}

export interface AgentConfig {
  baseUrl: string;
  maxSteps?: number;
  model?: BaseChatModel;
}
