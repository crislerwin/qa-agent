import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("tool:network-errors");

export interface NetworkErrorFinding {
  url: string;
  method: string;
  status: number;
  statusText: string;
  timestamp: number;
  pageUrl: string;
  responseBody?: string;
}

/**
 * Monitors network requests and captures failed requests (4xx, 5xx errors).
 */
export class NetworkMonitor {
  private errors: NetworkErrorFinding[] = [];
  private page: Page;

  constructor(page: Page) {
    this.page = page;
    this.attachListeners();
  }

  private attachListeners() {
    // Listen to responses
    this.page.on("response", async (response) => {
      const status = response.status();

      // Only capture 4xx and 5xx errors
      if (status < 400) {
        return;
      }

      const url = response.url();

      // Filter out common noise
      if (this.isNoise(url)) {
        return;
      }

      let responseBody: string | undefined;
      try {
        // Try to get response body for API errors
        const contentType = response.headers()["content-type"] || "";
        if (contentType.includes("json") || contentType.includes("text")) {
          responseBody = await response.text();
          // Limit size
          if (responseBody.length > 500) {
            responseBody = responseBody.substring(0, 500) + "...";
          }
        }
      } catch (e) {
        // Ignore if we can't read the body
      }

      const finding: NetworkErrorFinding = {
        url,
        method: response.request().method(),
        status,
        statusText: response.statusText(),
        timestamp: Date.now(),
        pageUrl: this.page.url(),
        responseBody,
      };

      this.errors.push(finding);
      logger.log(
        `Network error: ${status} ${response.request().method()} ${url}`
      );
    });

    // Listen to request failures (network errors, timeouts)
    this.page.on("requestfailed", (request) => {
      const url = request.url();

      if (this.isNoise(url)) {
        return;
      }

      const failure = request.failure();
      const finding: NetworkErrorFinding = {
        url,
        method: request.method(),
        status: 0,
        statusText: failure?.errorText || "Request failed",
        timestamp: Date.now(),
        pageUrl: this.page.url(),
      };

      this.errors.push(finding);
      logger.log(
        `Request failed: ${request.method()} ${url} - ${failure?.errorText}`
      );
    });
  }

  private isNoise(url: string): boolean {
    // Filter out common false positives
    const noisePatterns = [
      /favicon\.ico/i,
      /chrome-extension/i,
      /analytics/i,
      /tracking/i,
      /\.woff2?$/i, // Font files often 404 harmlessly
      /\.map$/i, // Source maps
    ];

    return noisePatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Get all captured errors and clear the buffer
   */
  getErrors(): NetworkErrorFinding[] {
    const errors = [...this.errors];
    this.errors = [];
    return errors;
  }

  /**
   * Get errors without clearing the buffer
   */
  peekErrors(): NetworkErrorFinding[] {
    return [...this.errors];
  }

  /**
   * Clear all captured errors
   */
  clear() {
    this.errors = [];
  }
}
