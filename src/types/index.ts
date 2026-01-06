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
  scannedUrls: Set<string>; // URLs that have been scanned for broken images
}

export interface AgentConfig {
  baseUrl: string;
  maxSteps?: number;
  model?: BaseChatModel;
  sessionId?: string;
}

export interface BrokenImageFinding {
  src: string;
  srcset?: string; // Added field
  alt: string;
  selector: string;
  reason: string;
  location: { x: number; y: number };
}