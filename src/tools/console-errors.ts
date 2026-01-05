import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("tool:console-errors");

export interface ConsoleErrorFinding {
  type: "error" | "warning";
  message: string;
  url: string;
  timestamp: number;
  stackTrace?: string;
}

/**
 * Monitors and captures browser console errors and warnings.
 * This class should be instantiated and attached to a page to start monitoring.
 */
export class ConsoleMonitor {
  private errors: ConsoleErrorFinding[] = [];
  private page: Page;

  constructor(page: Page) {
    this.page = page;
    this.attachListeners();
  }

  private attachListeners() {
    // Listen to console messages
    this.page.on("console", (msg) => {
      const type = msg.type();

      // Only capture errors and warnings
      if (type !== "error" && type !== "warning") {
        return;
      }

      const text = msg.text();

      // Filter out common noise (adjust as needed)
      if (this.isNoise(text)) {
        return;
      }

      const finding: ConsoleErrorFinding = {
        type: type as "error" | "warning",
        message: text,
        url: this.page.url(),
        timestamp: Date.now(),
      };

      this.errors.push(finding);
      logger.log(`Console ${type}: ${text}`);
    });

    // Listen to page errors (uncaught exceptions)
    this.page.on("pageerror", (error) => {
      const finding: ConsoleErrorFinding = {
        type: "error",
        message: error.message,
        url: this.page.url(),
        timestamp: Date.now(),
        stackTrace: error.stack,
      };

      this.errors.push(finding);
      logger.log(`Page error: ${error.message}`);
    });
  }

  private isNoise(message: string): boolean {
    // Filter out common false positives
    const noisePatterns = [
      /favicon\.ico/i,
      /chrome-extension/i,
      /third-party/i,
      // Add more patterns as needed
    ];

    return noisePatterns.some((pattern) => pattern.test(message));
  }

  /**
   * Get all captured errors and clear the buffer
   */
  getErrors(): ConsoleErrorFinding[] {
    const errors = [...this.errors];
    this.errors = []; // Clear after retrieval
    return errors;
  }

  /**
   * Get errors without clearing the buffer
   */
  peekErrors(): ConsoleErrorFinding[] {
    return [...this.errors];
  }

  /**
   * Clear all captured errors
   */
  clear() {
    this.errors = [];
  }
}
