import { chromium, type Browser, type Page } from "playwright-core";
import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getDefaultModel } from "../services/llm.ts";
import { createLogger } from "../utils/logger.ts";
import { findBrokenImages } from "../tools/broken-images.ts";
import { crawlSite } from "../tools/crawler.ts";
import { ConsoleMonitor } from "../tools/console-errors.ts";
import { NetworkMonitor } from "../tools/network-errors.ts";
import { findValidationErrors } from "../tools/validation-errors.ts";
import type { AgentConfig, AgentFinding, AgentState } from "../types/index.ts";
import { SessionRepository } from "../repositories/session.repository.ts";

const logger = createLogger("agent:exploratory");

export class ExploratoryAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private model: BaseChatModel;
  private consoleMonitor: ConsoleMonitor | null = null;
  private networkMonitor: NetworkMonitor | null = null;
  private sessionRepo: SessionRepository;
  private state: AgentState = {
    visitedUrls: new Set(),
    findings: [],
    steps: 0,
    history: [],
    todoQueue: [],
  };
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.model = config.model || getDefaultModel();
    this.sessionRepo = new SessionRepository();
  }

  async start() {
    logger.log("Starting Exploratory Agent...");

    // Check for existing session
    if (this.config.sessionId) {
      const loadedState = this.sessionRepo.loadState(this.config.sessionId);
      if (loadedState) {
        this.state = loadedState;
        logger.info(
          `Resumed session ${this.config.sessionId}. Step: ${this.state.steps}`
        );
      } else {
        logger.info(
          `No existing state found for session ${this.config.sessionId}. Starting fresh.`
        );
      }
    }

    this.browser = await chromium.launch({
      headless: true, // Configurable later
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.page = await this.browser.newPage();

    // Initialize monitors
    this.consoleMonitor = new ConsoleMonitor(this.page);
    this.networkMonitor = new NetworkMonitor(this.page);
    logger.log("Console and Network monitors initialized");

    if (this.state.steps === 0) {
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
    } else {
      // Resolving last position or navigating to base if unsure
      const lastUrl = this.state.history[this.state.history.length - 1]?.url;
      if (lastUrl) {
        await this.page.goto(lastUrl);
        logger.log(`Resumed navigation at ${lastUrl}`);
      } else {
        await this.page.goto(this.config.baseUrl);
      }
    }
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
    stats?: {
      currentUrl: string;
      queueLength: number;
      visitedCount: number;
      findingsCount: number;
    };
  }> {
    if (!this.page) throw new Error("Agent not started");
    this.state.steps++;

    // 1. Observe
    const url = this.page.url();
    const title = await this.page.title();
    this.state.visitedUrls.add(url);

    // Simplified DOM for LLM
    // Capture interactive elements (a, button, input, select, textarea) + images
    const visitedList = Array.from(this.state.visitedUrls);

    const snapshot = await this.page.evaluate((visitedUrls) => {
      const elements = document.querySelectorAll(
        "a, button, input, select, textarea, img, label"
      );
      return Array.from(elements)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return null; // Skip invisible

          let text = "";
          let extra = "";

          const tagName = el.tagName.toLowerCase();

          if (tagName === "img") {
            text = `[Image: ${(el as HTMLImageElement).alt || (el as HTMLImageElement).src
              }]`;
          } else if (tagName === "input") {
            const input = el as HTMLInputElement;
            extra = `[Type: ${input.type}, Name: ${input.name}, ID: ${input.id}]`;
            if (input.placeholder)
              extra += ` [Placeholder: ${input.placeholder}]`;
          } else if (tagName === "select") {
            const select = el as HTMLSelectElement;
            extra = `[ID: ${select.id}, Name: ${select.name}]`;
          } else {
            text = el.textContent?.trim() || "";
          }

          // Generate a simple selector
          let selector = "";
          if (el.id) {
            selector = `#${el.id}`;
          } else if (tagName === "a" && (el as HTMLAnchorElement).href) {
            const href = (el as HTMLAnchorElement).getAttribute("href");
            const absoluteHref = (el as HTMLAnchorElement).href;

            if (href) selector = `a[href="${href}"]`;

            // Mark visited links using absolute URL (resolves relative paths automatically)
            const normalizedHref = absoluteHref.replace(/\/$/, "");
            const isVisited =
              visitedUrls.includes(absoluteHref) ||
              visitedUrls.includes(normalizedHref);

            if (isVisited) extra += " [VISITED]";

          } else if (el.className) {
            selector = `${tagName}.${el.className.split(" ").join(".")}`;
          } else {
            selector = tagName; // Fallback, not great for interaction but LLM can infer
          }

          return {
            tag: tagName,
            text: text.substring(0, 100), // truncation
            extra,
            selector: selector,
          };
        })
        .filter(Boolean);
    }, visitedList);

    // 2. Think
    const historySlice = this.state.history.slice(-3);
    const historyStartIndex = Math.max(0, this.state.history.length - 3);
    const recentHistory = historySlice
      .map(
        (h, i) =>
          `Step ${historyStartIndex + i + 1}: ${h.action} (Reason: ${h.reason
          }) -> Result: ${h.result || "N/A"}`
      )
      .join("\n");


    let systemPrompt = `
You are an intelligent QA Testing Agent. Your goal is to explore the web application at ${this.config.baseUrl
      } and FIND BUGS.
Target: "${this.config.baseUrl}" - the target web application to explore.

GOALS:
1. **Explore**: Visit all pages.
2. **Interact**: Click buttons, fill forms, try to buy products, try to login.
3. **Detect**: Find broken images, errors, validation issues, and UX problems.

WHAT BUGS TO LOOK FOR:
- **Broken Functionality**: Buttons that don't work, forms that fail, broken checkout flows
- **Validation Errors**: Missing validation, accepting invalid inputs, poor error messages  
- **Visual Issues**: Broken images, misaligned elements, missing content
- **Error Messages**: Visible error alerts, failed operations, unclear feedback
- **UX Issues**: Confusing flows, missing feedback, unclear labels
- **Edge Cases**: Empty cart checkout, invalid login attempts, boundary values

WHEN TO USE record_finding:
- After clicking a button and nothing happens (functional_bug)
- When you see error messages or alerts on the page (validation_error)
- When a form accepts invalid data without validation (functional_bug)
- When you observe confusing or broken user experience (ux_issue)
- After any interaction that produces unexpected results

STRATEGY:
- **Prioritize the Queue**: If you have finished testing a page (or are stuck), pick the next URL from the 'To-Do Queue' and 'navigate'.
- **CRITICAL - Avoid Re-Testing**: Links marked [VISITED] have been removed from the queue because they were already explored. NEVER click these links. NEVER navigate to these pages. This will create an infinite loop.
- **Avoid Loops**: DO NOT pass through the same pages (like Login/Auth) repeatedly. If it's marked [VISITED], absolutely do not click it.
- **Form Hypotheses**: "If I click this without filling the form, do I get an error?", "Can I checkout with an empty cart?"
- **Test Edge Cases**: Try invalid inputs, empty forms, boundary conditions

Current State:
- URL: ${url}
- Title: ${title}
- Visited URLs count: ${this.state.visitedUrls.size}
- To-Do Queue: ${JSON.stringify(this.state.todoQueue)}

Memory (Last 3 Steps):
${recentHistory || "None"}

Tools Available:
- navigate(url): Go to a specific URL (preferred for moving to next test case).
- click(selector): Click an element (button, link, etc.).
- fill_form(selector, value): Type text into an input field or textarea.
- add_to_queue(urls): Add discoverable URLs to your plan.
- find_broken_images(): Scan current page for broken images.
- record_finding(type, description, severity): Record a manual bug finding.
  * type: "functional_bug" | "validation_error" | "ux_issue" | "bug" | "other"
  * severity: "low" | "medium" | "high" | "critical"
- finish(): Stop exploration. Call this when:
  * The To-Do Queue is EMPTY (0 items), OR
  * You are stuck in a loop on the same page, OR
  * You have thoroughly tested all major flows

INSTRUCTIONS:
- Return a JSON object with "action", "params", and "reason".
- "reason" must explain your HYPOTHESIS or GOAL.
  **IMPORTANT**: The response must be valid JSON. Escape newlines.
- **critical**: If you see a Login form, TRY to login with both valid and invalid credentials to see what happens.
- **critical**: Try to add items to cart and proceed to checkout.
- **critical**: After EVERY interaction (click, fill_form), observe the result and use record_finding if something seems broken.
- **critical**: If 'To-Do Queue' has items, DO NOT click links marked [VISITED]. Use 'navigate' to pick a fresh page from the queue.
`;

    // Intelligent Loop Detection
    // 1. Get all steps performed on the current URL (continuous segment)
    let stepsOnCurrentUrl = 0;
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      const historyStep = this.state.history[i];
      if (historyStep && historyStep.url === url) {
        stepsOnCurrentUrl++;
      } else {
        break;
      }
    }

    // 2. Repetition Detection
    const last3Steps = this.state.history.slice(-3);
    const firstOfLast3 = last3Steps[0];
    const isRepeatingAction =
      last3Steps.length === 3 &&
      firstOfLast3 &&
      last3Steps.every(
        (s) =>
          s.action === firstOfLast3.action &&
          JSON.stringify(s.params) === JSON.stringify(firstOfLast3.params)
      );

    // 3. Stagnation Detection (staying on page too long without new findings)
    const recentFindings = this.state.findings.filter(
      (f) => f.url === url
    ).length; // Total findings on this page
    // (This works because finding logic dedupes, so count grows only with distinct findings/types)

    if (isRepeatingAction) {
      systemPrompt += `\n\n### WARNING: REPETITIVE ACTION DETECTED ###\nYou have performed the EXACT SAME action 3 times in a row. Stop doing this.\n1. Choose a DIFFERENT element to interact with.\n2. Or navigate to a new page.\n3. Or call 'finish()' if stuck.`;
    } else if (stepsOnCurrentUrl > 10 && recentFindings === 0) {
      // Only warn if dwell time is high AND no findings encountered (implies unproductive spinning)
      // Checking 'recentFindings === 0' is a proxy for "is this page useful?".
      // A better proxy might be "unique interactions".
      // Let's refine:
      const uniqueInteractions = new Set(
        this.state.history
          .slice(-stepsOnCurrentUrl)
          .map((s) => s.action + JSON.stringify(s.params))
      ).size;

      if (uniqueInteractions < stepsOnCurrentUrl * 0.5) {
        // If < 50% of actions were unique
        systemPrompt += `\n\n### WARNING: STAGNATION DETECTED ###\nYou have been on this page for ${stepsOnCurrentUrl} steps with repetitive actions.\nYou MUST navigate away or finish unless you find a specific new bug immediately.`;
      }
    }

    // Empty Queue Detection
    if (this.state.todoQueue.length === 0) {
      systemPrompt += `\n\n### CRITICAL: QUEUE IS EMPTY ###\nThe To-Do Queue is EMPTY (0 items). You have explored all discoverable pages.\nYou MUST call 'finish()' on your next action unless you have a very specific reason to continue testing the current page.\nIf you have already tested the current page thoroughly, call 'finish()' NOW.`;
    }

    if (guidance) {
      systemPrompt += `\n\n### CRITICAL USER INSTRUCTION ###\nThe user has provided specific guidance:\n"${guidance}"\n\nYou MUST prioritize this instruction above all else.\n#################################`;
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
          const waitTime = Math.pow(2, attempt) * 2000;
          logger.warn(`Rate limit handling: Waiting ${waitTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

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

    // Parse JSON
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
      `Action: ${parsed.action} ${parsed.params ? JSON.stringify(parsed.params) : ""
      }`
    );

    // 3. Act
    await this.executeAction(parsed.action, parsed.params);

    this.state.history.push({
      action: parsed.action,
      reason: parsed.reason,
      url: this.page.url(),
      params: parsed.params,
    });

    // Capture stats for UI
    const stats = {
      currentUrl: this.page.url(),
      queueLength: this.state.todoQueue.length,
      visitedCount: this.state.visitedUrls.size,
      findingsCount: this.state.findings.length,
    };

    // Save state if session ID is present
    if (this.config.sessionId) {
      this.sessionRepo.saveState(this.config.sessionId, this.state);
    }

    return {
      action: parsed.action,
      reason: parsed.reason,
      completed: parsed.action === "finish",
      stats,
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
          let newUrls: string[] = [];
          if (Array.isArray(params)) {
            newUrls = params;
          } else if (typeof params === "string") {
            newUrls = [params];
          } else if (params?.urls) {
            newUrls = params.urls;
          }
          let addedCount = 0;
          const baseUrlObj = new URL(this.config.baseUrl);
          for (const u of newUrls) {
            try {
              const urlObj = new URL(u, this.page.url());
              const absoluteUrl = urlObj.href;

              if (urlObj.hostname !== baseUrlObj.hostname) {
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
              // ignore invalid
            }
          }
          const msg = `Added ${addedCount} new URLs to queue.`;
          logger.log(msg);
          return msg;

        case "navigate": {
          const targetUrl = typeof params === "string" ? params : params?.url;

          if (!targetUrl || typeof targetUrl !== "string") {
            const err = `Navigate failed: Invalid URL parameter. Params received: ${JSON.stringify(
              params
            )}`;
            logger.error(err);
            return err;
          }

          logger.log(`Navigating to: ${targetUrl}`);
          this.state.todoQueue = this.state.todoQueue.filter(
            (u) => u !== targetUrl
          );
          await this.page.goto(targetUrl);
          return `Navigated to ${targetUrl}`;
        }

        case "click":
          let selector = typeof params === "string" ? params : params?.selector;
          if (!selector) {
            throw new Error(
              "Click action requires a selector (params.selector or string)"
            );
          }
          logger.log(`Clicking selector: ${selector}`);
          await this.page.click(selector);
          return `Clicked ${selector}`;

        case "fill_form":
          if (!params?.selector || params?.value === undefined) {
            throw new Error(
              "Fill_form action requires params.selector and params.value"
            );
          }
          logger.log(`Filling form: ${params.selector} = ${params.value}`);
          await this.page.fill(params.selector, params.value);
          return `Filled ${params.selector} with ${params.value}`;

        case "find_broken_images":
          this.state.visitedUrls.add(this.page.url());
          const findings = await findBrokenImages(this.page);

          let brokenImgScreenshot = "";
          if (findings.length > 0) {
            brokenImgScreenshot = await this.takeScreenshot("broken-images");
          }

          for (const f of findings) {
            this.recordUniqueFinding({
              type: "broken_image",
              description: `Broken image: ${f.src} (Reason: ${f.reason})`,
              url: this.page.url(),
              selector: f.selector,
              severity: "medium", // Default for broken images
              screenshot: brokenImgScreenshot,
            });
          }
          return `Found ${findings.length} broken images`;

        case "record_finding":
          const bugScreenshot = await this.takeScreenshot("bug");
          this.recordUniqueFinding({
            type: params.type || "bug",
            description: params.description,
            url: this.page.url(),
            severity: params.severity || "medium",
            screenshot: bugScreenshot,
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
    } finally {
      // Automatic bug scanning after certain actions
      if (
        action === "navigate" ||
        action === "click" ||
        action === "fill_form"
      ) {
        await this.performAutomaticBugScanning();
      }
    }
  }

  /**
   * Automatically scan for common bugs after interactions
   */
  private async performAutomaticBugScanning() {
    if (!this.page) return;

    try {
      // Small delay to let the page settle
      await this.page.waitForTimeout(500);

      // 1. Check for console errors
      if (this.consoleMonitor) {
        const consoleErrors = this.consoleMonitor.getErrors();
        for (const error of consoleErrors) {
          this.recordUniqueFinding({
            type: "console_error",
            description: `Console ${error.type}: ${error.message}`,
            url: error.url,
            severity: error.type === "error" ? "medium" : "low",
            metadata: {
              timestamp: error.timestamp,
              stackTrace: error.stackTrace,
            },
          });
        }
      }

      // 2. Check for network errors
      if (this.networkMonitor) {
        const networkErrors = this.networkMonitor.getErrors();
        for (const error of networkErrors) {
          const severity =
            error.status >= 500
              ? "high"
              : error.status >= 400
                ? "medium"
                : "low";
          this.recordUniqueFinding({
            type: "network_error",
            description: `Network error: ${error.status} ${error.method} ${error.url}`,
            url: error.pageUrl,
            severity,
            metadata: {
              requestUrl: error.url,
              method: error.method,
              status: error.status,
              statusText: error.statusText,
              responseBody: error.responseBody,
            },
          });
        }
      }

      // 3. Check for validation errors
      const validationErrors = await findValidationErrors(this.page);
      for (const error of validationErrors) {
        this.recordUniqueFinding({
          type: "validation_error",
          description: `Validation error: ${error.message}`,
          url: this.page.url(),
          selector: error.selector,
          severity: "low",
          metadata: {
            location: error.location,
          },
        });
      }
    } catch (error) {
      logger.warn(`Automatic bug scanning failed: ${error}`);
      // Don't throw - scanning is best-effort
    }
  }

  private async takeScreenshot(prefix: string): Promise<string> {
    if (!this.page) return "";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${prefix}-${timestamp}.png`;
    const path = `reports/screenshots/${filename}`;
    try {
      await this.page.screenshot({ path, fullPage: true });
      return `screenshots/${filename}`;
    } catch (e) {
      logger.warn(`Failed to take screenshot (skipping): ${e}`);
      return "";
    }
  }

  private recordUniqueFinding(finding: AgentFinding) {
    // Advanced Deduplication:
    let existingFinding: AgentFinding | undefined;

    // Strict matching criteria
    // Same type, same description
    // If selector exists, it must match
    existingFinding = this.state.findings.find(
      (f) =>
        f.type === finding.type &&
        f.description === finding.description &&
        f.selector === finding.selector
    );

    if (existingFinding) {
      // It's a duplicate. Aggregate it.
      existingFinding.count = (existingFinding.count || 1) + 1;

      if (!existingFinding.occurrences) {
        existingFinding.occurrences = [];
      }

      // Add current URL to occurrences if not already there
      if (
        !existingFinding.occurrences.includes(finding.url) &&
        existingFinding.url !== finding.url
      ) {
        existingFinding.occurrences.push(finding.url);
      }

      logger.info(
        `Aggregated duplicate finding: ${finding.description} (Count: ${existingFinding.count})`
      );

      // Update severity if new instance is more critical? (Optional, skipping for now)
    } else {
      // It's new
      finding.count = 1;
      // finding.occurrences is undefined initially
      this.state.findings.push(finding);
      logger.info(`Recorded NEW finding: ${finding.description}`);
    }
  }

  getFindings() {
    return this.state.findings;
  }

  getVisitedUrls() {
    return Array.from(this.state.visitedUrls);
  }
}
