import { chromium, type Browser, type Page } from "playwright-core";
import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getDefaultModel } from "../config/models.ts";
import { createLogger } from "../utils/logger.ts";
import {
  findBrokenImages,
  type BrokenImageFinding,
} from "./tools/broken-images.ts";

const logger = createLogger("agent:core");

export interface AgentFinding {
  type: "bug" | "ui_issue" | "broken_image" | "ux_issue" | "other";
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  url: string;
  screenshot?: string; // path to screenshot
}

export interface AgentState {
  visitedUrls: Set<string>;
  findings: AgentFinding[];
  steps: number;
}

export interface AgentConfig {
  baseUrl: string;
  maxSteps?: number;
  model?: BaseChatModel;
}

export class ExploratoryAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private model: BaseChatModel;
  private state: AgentState = {
    visitedUrls: new Set(),
    findings: [],
    steps: 0,
  };
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.model = config.model || getDefaultModel();
  }

  async start() {
    logger.log("Starting Exploratory Agent...");
    this.browser = await chromium.launch({
      headless: true, // Configurable later
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.page = await this.browser.newPage();

    // Initial navigation
    await this.page.goto(this.config.baseUrl);
    logger.log(`Navigated to ${this.config.baseUrl}`);
  }

  async stop() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    logger.log("Agent stopped.");
  }

  /**
   * Execute one step of exploration.
   * 1. Observe
   * 2. Think
   * 3. Act
   */
  async step(guidance?: string): Promise<{
    action: string;
    reason: string;
    completed: boolean;
  }> {
    if (!this.page) throw new Error("Agent not started");
    this.state.steps++;

    // 1. Observe
    const url = this.page.url();
    const title = await this.page.title();
    this.state.visitedUrls.add(url);

    // Simplified DOM for LLM
    // We get interactive elements and headers
    const snapshot = await this.page.evaluate(() => {
      const elements = document.querySelectorAll(
        "button, a, input, select, textarea, h1, h2, h3, .alert, .error, img"
      );
      return Array.from(elements)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return null; // Skip invisible

          let text = el.textContent?.trim() || "";
          if (el.tagName === "INPUT")
            text = `[Input: ${
              (el as HTMLInputElement).placeholder ||
              (el as HTMLInputElement).value
            }]`;
          if (el.tagName === "IMG")
            text = `[Image: ${
              (el as HTMLImageElement).alt || (el as HTMLImageElement).src
            }]`;

          // Generate a robust selector
          let selector = "";

          // Priority 1: data-testid / data-test
          const testId =
            el.getAttribute("data-testid") || el.getAttribute("data-test");
          if (testId) {
            selector = `[data-test="${testId}"]`;
          } else if (el.id) {
            // Priority 2: ID
            selector = `#${el.id}`;
          } else if (el.tagName === "A" && (el as HTMLAnchorElement).href) {
            // Priority 3: Href for links
            const href = (el as HTMLAnchorElement).getAttribute("href");
            if (href) selector = `a[href="${href}"]`;
          } else if (el.getAttribute("role")) {
            // Priority 4: Role
            selector = `[role="${el.getAttribute("role")}"]`;
          } else if (el.tagName === "BUTTON" && text) {
            // Priority 5: Button text (Playwright specific, but we'll return a pseudo-selector or xpath/text)
            // For simplicity, let's stick to unique attributes or class combo
            if (el.className)
              selector = `${el.tagName.toLowerCase()}.${el.className
                .split(" ")
                .join(".")}`;
            else selector = el.tagName.toLowerCase();
          } else {
            if (el.className)
              selector = `${el.tagName.toLowerCase()}.${el.className
                .split(" ")
                .join(".")}`;
            else selector = el.tagName.toLowerCase();
          }

          return {
            tag: el.tagName.toLowerCase(),
            text: text.substring(0, 100), // truncation
            selector: selector, // Note: this selector is rudimentary
            visible: true,
          };
        })
        .filter(Boolean);
    });

    // 2. Think
    let systemPrompt = `
You are an Exploratory Testing Agent. Your goal is to explore the web application at ${
      this.config.baseUrl
    } and find bugs.
Target: "with-bugs.practicesoftwaretesting.com" - an e-commerce site with intentional bugs.

Goals:
1. Navigate through different pages (Product lists, details, cart, checkout, login).
2. Look for visual issues, error messages, and broken functionality.
3. Use the available tools to verify hypotheses.

Current State:
- URL: ${url}
- Title: ${title}
- Visited: ${Array.from(this.state.visitedUrls).join(", ")}
- Findings: ${this.state.findings.length} bugs found so far.

Exploration History:
(You should remember what you have tested)

Tools Available:
- navigate(url): Go to a URL.
- click(selector): Click an element.
- type(selector, text): Type into an input.
- find_broken_images(): Scan current page for broken images.
- record_finding(description, severity): Log a bug you found.
- finish(): Stop exploration.

INSTRUCTIONS:
- Return a JSON object with "action", "params", and "reason".
- "action" must be one of the tools above.
- "reason" must explain why you are doing this (e.g., "Checking if cart updates correctly").
- Prioritize high-value flows (Checkout, Login).
- If you see an error message on screen, record it as a finding!
    `;

    if (guidance) {
      systemPrompt += `\n\n### CRITICAL USER INSTRUCTION ###\nThe user has provided specific guidance:\n"${guidance}"\n\nYou MUST prioritize this instruction above all else. Drop your current plan if necessary and execute the user's request immediately in this step.\n#################################`;
    }

    const userMessage = `
Current Page Elements (Simplified):
${JSON.stringify(snapshot, null, 2)}

What is your next move? Response MUST be a raw JSON object.
    `;

    // Call LLM with timeout and retry logic for 429s
    const timeoutMs = 30000; // 30 seconds
    const maxRetries = 3;
    let response: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const responsePromise = this.model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(userMessage),
        ]);

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`LLM Request Timed out after ${timeoutMs}ms`)),
            timeoutMs
          )
        );

        response = await Promise.race([responsePromise, timeoutPromise]);
        break; // Success
      } catch (error: any) {
        const isRateLimit =
          error.message?.includes("429") || error.status === 429;
        if (isRateLimit && attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 2000; // 4s, 8s, 16s
          logger.warn(
            `Rate limit handling: Waiting ${waitTime}ms before retry ${
              attempt + 1
            }/${maxRetries}...`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        // If strictly a timeout or other error, or last retry
        logger.error(`LLM Error (Attempt ${attempt}): ${error}`);
        if (attempt === maxRetries) {
          return {
            action: "error",
            reason: `LLM Failed: ${error.message}`,
            completed: false,
          };
        }
      }
    }

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    // Parse JSON (clean markdown code blocks if present)
    let parsed: any;
    try {
      const cleaned = content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      logger.error("Failed to parse LLM response", content);
      return {
        action: "error",
        reason: "Invalid JSON from LLM",
        completed: false,
      };
    }

    logger.log(`Agent Logic: ${parsed.reason}`);
    logger.log(
      `Action: ${parsed.action} ${
        parsed.params ? JSON.stringify(parsed.params) : ""
      }`
    );

    // 3. Act
    await this.executeAction(parsed.action, parsed.params);

    return {
      action: parsed.action,
      reason: parsed.reason,
      completed: parsed.action === "finish",
    };
  }

  private async executeAction(action: string, params: any) {
    if (!this.page) return;

    try {
      switch (action) {
        case "navigate":
          logger.log(`Navigating to: ${params.url}`);
          await this.page.goto(params.url);
          break;
        case "click":
          logger.log(
            `Attempting click on: ${params.selector} (Text hint: ${
              params.text || "N/A"
            })`
          );
          try {
            await this.page.click(params.selector, { timeout: 2000 });
            logger.log(`Click SUCCESS: ${params.selector}`);
          } catch (e) {
            // Fallback 1: Try adding the tag name if it was missing or simplistic
            try {
              logger.warn(
                `Click failed for ${params.selector}, trying loose match...`
              );
              // If selector is just a class or simple string, maybe try text?
              if (params.text || params.selector) {
                const textToFind = params.text || params.selector; // Agent might pass text as selector
                // Playwright's getByText is powerful
                const el = this.page
                  .getByText(textToFind, { exact: false })
                  .first();
                if ((await el.count()) > 0 && (await el.isVisible())) {
                  await el.click();
                  logger.log(`Click SUCCESS (by text): "${textToFind}"`);
                  return;
                }
              }
            } catch (innerE) {
              logger.error(`Click fallback failed: ${innerE}`);
            }
            logger.error(`Click failed for ${params.selector}`);
          }
          break;
        case "type":
          logger.log(`Typing into ${params.selector}: "${params.text}"`);
          await this.page.fill(params.selector, params.text);
          break;
        case "find_broken_images":
          const findings = await findBrokenImages(this.page);
          for (const f of findings) {
            this.state.findings.push({
              type: "broken_image",
              description: `Broken image: ${f.src} (Reason: ${f.reason})`,
              severity: "low",
              url: this.page.url(),
            });
          }
          break;
        case "record_finding":
          this.state.findings.push({
            type: "bug",
            description: params.description,
            severity: params.severity || "medium",
            url: this.page.url(),
            // Capture screenshot
          });
          // Capture screenshot for finding
          const path = `screenshots/bug-${Date.now()}.png`;
          await this.page.screenshot({ path: `uploads/${path}` });
          // update finding ref
          const lastFinding =
            this.state.findings[this.state.findings.length - 1];
          if (lastFinding) {
            lastFinding.screenshot = path;
          }
          break;
        case "finish":
          logger.log("LLM decided to finish.");
          break;
        default:
          logger.warn(`Unknown action: ${action}`);
      }
    } catch (error) {
      logger.error(`Action execution failed: ${error}`);
    }
  }

  getFindings() {
    return this.state.findings;
  }
}
