import { chromium, type Browser, type Page } from "playwright-core";
import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getDefaultModel } from "../config/models.ts";
import { createLogger } from "../utils/logger.ts";
import {
  findBrokenImages,
  type BrokenImageFinding,
} from "./tools/broken-images.ts";
import { crawlSite } from "./tools/crawler.ts";

const logger = createLogger("agent:core");

export interface AgentFinding {
  type: "bug" | "ui_issue" | "broken_image" | "ux_issue" | "other";
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  url: string;
  screenshot?: string; // path to screenshot
  selector?: string; // unique element identifier (e.g. css selector)
}

export interface AgentState {
  visitedUrls: Set<string>;
  findings: AgentFinding[];
  steps: number;
  visitedSelectors: Set<string>; // Dedup clicks: URL + Selector
  history: { action: string; reason: string; url: string; result?: string }[]; // Short-term memory
  todoQueue: string[]; // URLs to explore
  scannedUrls: Set<string>; // URLs that have been scanned for broken images
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
    visitedSelectors: new Set(),
    history: [],
    todoQueue: [],
    scannedUrls: new Set(),
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

    // Pre-execution Crawl (using Playwright)
    logger.log("Starting Pre-execution Crawl...");
    const discoveredUrls = await crawlSite(this.page, this.config.baseUrl);
    this.state.todoQueue = [...discoveredUrls];
    logger.log(
      `Queue initialized with ${discoveredUrls.length} pages from crawl.`
    );

    // Initial navigation back to base
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
    const historySlice = this.state.history.slice(-3);
    const historyStartIndex = Math.max(0, this.state.history.length - 3);
    const recentHistory = historySlice
      .map(
        (h, i) =>
          `Step ${historyStartIndex + i + 1}: ${h.action} (Reason: ${
            h.reason
          }) -> Result: ${h.result || "N/A"}`
      )
      .join("\n");

    const isScanned = this.state.scannedUrls.has(url);

    let systemPrompt = `
You are an Exploratory Testing Agent. Your goal is to explore the web application at ${
      this.config.baseUrl
    } and find bugs.
Target: "with-bugs.practicesoftwaretesting.com" - an e-commerce site with intentional bugs.

STRATEGY: "Execute Map"
1. **Execution**: You have a pre-filled 'To-Do Queue' of pages to test.
   a. Pick the next URL from 'To-Do Queue'.
   b. 'navigate' to it.
   c. 'find_broken_images' on that page.
   d. Repeat until queue is empty.
2. **Completion**: 
   - If 'To-Do Queue' is empty AND 'Page Scanned for Images' is YES, you MUST call 'finish()'.
   - If you tried 'add_to_queue' but added 0 items (see "Result" in memory) AND queue is still empty, you MUST call 'finish()'.

Current State:
- URL: ${url}
- Visited URLs count: ${this.state.visitedUrls.size}
- To-Do Queue: ${JSON.stringify(this.state.todoQueue)}
- Page Scanned for Images: ${isScanned ? "YES" : "NO"}

Memory (Last 3 Steps):
${recentHistory || "None"}

Tools Available:
- navigate(url): Go to a URL.
- add_to_queue(urls): Add a list of absolute URLs to your plan. Example params: { "urls": ["https://..."] }
- find_broken_images(): Scan current page for broken images.
- finish(): Stop exploration (only when Queue is empty).

INSTRUCTIONS:
- Return a JSON object with "action", "params", and "reason".
- "reason" must explain your progress through the queue.
  **IMPORTANT**: The response must be valid JSON. Escape newlines.
- **CRITICAL**: If you see 'add_to_queue' in your memory but the queue is empty, do NOT call it again. Move to 'navigate'.
- **CRITICAL**: If 'Page Scanned for Images' is YES, you MUST NOT scan again. Pick a URL from the Queue and 'navigate'.
- **CRITICAL**: If your last action was 'add_to_queue' and the result was "Added 0 new URLs", STOP immediately and call 'finish()'.
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

    this.state.history.push({
      action: parsed.action,
      reason: parsed.reason,
      url: this.page.url(),
    });

    return {
      action: parsed.action,
      reason: parsed.reason,
      completed: parsed.action === "finish",
    };
  }

  private async executeAction(
    action: string,
    params: any
  ): Promise<string | undefined> {
    if (!this.page) return;

    try {
      switch (action) {
        case "add_to_queue":
          const newUrls = Array.isArray(params) ? params : params.urls || [];
          let addedCount = 0;
          const baseUrlObj = new URL(this.config.baseUrl);
          for (const u of newUrls) {
            try {
              const urlObj = new URL(u, this.page.url()); // Resolve relative to current page
              const absoluteUrl = urlObj.href;

              if (urlObj.hostname !== baseUrlObj.hostname) {
                logger.log(`Skipping external URL: ${absoluteUrl}`);
                continue;
              }

              if (
                !this.state.visitedUrls.has(absoluteUrl) &&
                !this.state.todoQueue.includes(absoluteUrl)
              ) {
                this.state.todoQueue.push(absoluteUrl);
                addedCount++;
              }
            } catch (e) {
              logger.warn(`Invalid URL to queue: ${u}`);
            }
          }
          const msg = `Added ${addedCount} new URLs to queue. Total Queue: ${this.state.todoQueue.length}`;
          logger.log(msg);
          return msg;

        case "navigate":
          // If we navigate from queue, remove it from queue
          const targetUrl = params.url;
          logger.log(`Navigating to: ${targetUrl}`);
          this.state.todoQueue = this.state.todoQueue.filter(
            (u) => u !== targetUrl
          ); // Remove from queue
          await this.page.goto(targetUrl);
          return `Navigated to ${targetUrl}`;

        case "click":
          logger.log(
            `Attempting click on: ${params.selector} (Text hint: ${
              params.text || "N/A"
            })`
          );
          try {
            await this.page.click(params.selector, { timeout: 2000 });
            // Record visit
            const key = `${this.page.url()}::${params.selector}`;
            this.state.visitedSelectors.add(key);
            logger.log(`Click SUCCESS: ${params.selector}`);
            return `Clicked ${params.selector}`;
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
                  const successMsg = `Click SUCCESS (by text): "${textToFind}"`;
                  logger.log(successMsg);
                  return successMsg;
                }
              }
            } catch (innerE) {
              // logger.error(`Click fallback failed: ${innerE}`);
            }
            logger.error(`Click failed for ${params.selector}`);
            return `Click failed for ${params.selector}`;
          }
          break;

        case "type":
          logger.log(`Typing into ${params.selector}: "${params.text}"`);
          await this.page.fill(params.selector, params.text);
          return `Typed "${params.text}" into ${params.selector}`;

        case "find_broken_images":
          this.state.scannedUrls.add(this.page.url());
          const findings = await findBrokenImages(this.page);
          for (const f of findings) {
            this.recordUniqueFinding({
              type: "broken_image",
              description: `Broken image: ${f.src} (Reason: ${f.reason})`,
              severity: "low",
              url: this.page.url(),
              selector: f.selector,
            });
          }
          return `Found ${findings.length} broken images`;

        case "record_finding":
          // Capture screenshot for finding
          const path = `screenshots/bug-${Date.now()}.png`;
          await this.page.screenshot({ path: `uploads/${path}` });

          this.recordUniqueFinding({
            type: "bug",
            description: params.description,
            severity: params.severity || "medium",
            url: this.page.url(),
            screenshot: path,
            selector: params.selector, // Allow agent to specify selector for general findings
          });
          return `Recorded finding: ${params.description}`;

        case "finish":
          logger.log("LLM decided to finish.");
          return "Finished";
        default:
          logger.warn(`Unknown action: ${action}`);
          return `Unknown action: ${action}`;
      }
    } catch (error: any) {
      logger.error(`Action execution failed: ${error}`);
      return `Action failed: ${error.message}`;
    }
  }

  private recordUniqueFinding(finding: AgentFinding) {
    // Advanced Deduplication:
    // If it's a broken image, we check if the SAME src + selector has been reported ANYWHERE.
    // This handles header/footer images (same selector, same src, different page).

    let exists = false;

    if (finding.type === "broken_image" && finding.selector) {
      // Check if this specific element (selector + description/src) was already found
      // We assume 'description' contains the src or unique error details
      exists = this.state.findings.some(
        (f) =>
          f.type === "broken_image" &&
          f.selector === finding.selector &&
          f.description === finding.description // Description usually contains the src from findBrokenImages
      );
    } else {
      // Standard deduplication (Exact match on this page)
      const signature = `${finding.type}:${finding.description}:${finding.url}`;
      exists = this.state.findings.some(
        (f) => `${f.type}:${f.description}:${f.url}` === signature
      );
    }

    if (!exists) {
      this.state.findings.push(finding);
      logger.info(`Recorded NEW finding: ${finding.description}`);
    } else {
      logger.info(`Skipped DUPLICATE finding: ${finding.description}`);
    }
  }

  getFindings() {
    return this.state.findings;
  }

  getVisitedUrls() {
    return Array.from(this.state.visitedUrls);
  }
}
