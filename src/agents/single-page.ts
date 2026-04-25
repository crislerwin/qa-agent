import { chromium, type Browser, type Page } from "playwright-core";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getDefaultModel } from "../services/llm.ts";
import { createLogger } from "../utils/logger.ts";
import { ConsoleMonitor } from "../tools/console-errors.ts";
import { NetworkMonitor } from "../tools/network-errors.ts";
import { findBrokenImages } from "../tools/broken-images.ts";
import { runLayoutAudit } from "../tools/layout-audit.ts";
import { runVisualRegression } from "../tools/visual-regression.ts";
import type { AgentFinding, SinglePageTestConfig, SinglePageTestState, TestPlan, TestCase, TestStep, TestCaseResult, VisualRegressionResult, VisualRegressionConfig } from "../types/index.ts";
import { AppDatabase } from "../database/database.ts";
import { AuthenticationManager } from "../auth/auth-manager.ts";
import { SessionRepository } from "../repositories/session.repository.ts";

const logger = createLogger("agent:single-page");

function pageOk(p: Page | null): p is Page {
  return p !== null && !p.isClosed();
}

export class SinglePageTestingAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private model: any;
  private config: SinglePageTestConfig;
  private state: SinglePageTestState;
  private stopping = false;
  private consoleMonitor: ConsoleMonitor | null = null;
  private networkMonitor: NetworkMonitor | null = null;
  private authManager: AuthenticationManager;

  constructor(config: SinglePageTestConfig) {
    this.config = { maxTestCases: 20, strategy: "comprehensive", ...config };
    try {
      this.model = config.model || getDefaultModel();
    } catch {
      this.model = null;
    }
    const db = AppDatabase.getInstance();
    const database = db.getDatabase();
    this.authManager = new AuthenticationManager(database, { storageType: "sqlite" });
    const sid = config.sessionId || `sp-${Date.now()}`;
    this.state = {
      sessionId: sid,
      testPlan: null,
      results: [],
      currentTestIndex: -1,
      status: "planning" as const,
      currentAction: "Initializing...",
      lastError: null,
      startTime: Date.now(),
    };
  }

  getState() { return { ...this.state }; }

  async start(): Promise<SinglePageTestState> {
    logger.info(`Starting single-page test: ${this.config.targetUrl}`);
    try {
      await this.initBrowser();
      await this.page!.goto(this.config.targetUrl, { waitUntil: "networkidle" });

      if (this.config.auth?.required) {
        this.state.currentAction = "Authenticating...";
        if (this.config.auth.credentials) {
          await this.authManager.storeCredentials(
            this.config.auth.appIdentifier,
            this.config.auth.credentials,
          );
        }
        const authRes = await this.authManager.authenticate(this.page!, this.config.auth.appIdentifier);
        if (!authRes.success) throw new Error(`Auth failed: ${authRes.error}`);
        await this.page!.goto(this.config.targetUrl, { waitUntil: "networkidle" });
        logger.info("Authenticated and returned to target page");
      }

      // PLAN Phase
      this.state.status = "planning";
      this.state.currentAction = "Analyzing page...";
      const elements = await this.discoverElements();
      const plan = await this.generateTestPlan(elements);
      this.state.testPlan = plan;
      this.state.currentAction = `Plan: ${plan.totalTests} tests`;
      logger.info(`Plan: ${plan.totalTests} tests`);

      this.state.status = "executing";
      for (let i = 0; i < plan.testCases.length; i++) {
        if (this.stopping) break;
        const tc = plan.testCases[i];
        this.state.currentTestIndex = i;
        this.state.currentAction = `${tc.id}: ${tc.name}`;

        const result = await this.executeTestCase(tc);
        this.state.results.push(result);

        logger.info(`${tc.id}: ${result.status} (${result.executionTimeMs}ms)`);
      }

      this.state.status = this.stopping ? "stopped" : "completed";
      this.state.currentAction = "Running layout audit...";
      await this.runLayoutAudit(this.page!);

      this.state.currentAction = "Running visual regression...";
      await this.runVisualRegression(this.page!);

      this.state.currentAction = "Done";
      this.state.endTime = Date.now();
      return this.getState();
    } catch (e: any) {
      this.state.status = "failed";
      this.state.lastError = e.message;
      logger.error(e);
      throw e;
    } finally {
      await this.cleanup();
    }
  }

  stop() { this.stopping = true; }

  private async initBrowser() {
    this.browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    });
    const ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 } });
    this.page = await ctx.newPage();
    this.consoleMonitor = new ConsoleMonitor(this.page);
    this.networkMonitor = new NetworkMonitor(this.page);
    // ConsoleMonitor auto-starts on construction
  }

  private async cleanup() {
    // ConsoleMonitor no stop needed
    try { await this.browser?.close(); } catch {}
    this.page = null;
    this.browser = null;
  }

  private async discoverElements(): Promise<any[]> {
    if (!pageOk(this.page)) return [];
    const el = await this.page.evaluate(() => {
      const out: any[] = [];
      const seen = new Set<string>();
      document.querySelectorAll("input, select, textarea, button, a[href], [role='button']").forEach((e, i) => {
        const tag = e.tagName.toLowerCase();
        const id = e.id ? `#${e.id}` : "";
        const nm = e.getAttribute("name") ? `[name="${e.getAttribute("name")}"]` : "";
        const sel = id || nm || `${tag}:nth-of-type(${i + 1})`;
        if (seen.has(sel)) return;
        seen.add(sel);
        const style = window.getComputedStyle(e);
        const r = e.getBoundingClientRect();
        const visible = style.display !== "none" && style.visibility !== "hidden" && r.width > 0 && r.height > 0;
        out.push({
          tag,
          selector: sel,
          text: (e.textContent || "").substring(0, 80),
          type: (e as HTMLInputElement).type || undefined,
          isVisible: visible,
          interactable: visible && (e as HTMLElement).tabIndex >= -1,
        });
      });
      return out;
    });
    logger.info(`Discovered ${el.length} elements`);
    return el;
  }

  private async generateTestPlan(elements: any[]): Promise<TestPlan> {
    const url = this.page!.url();
    const title = await this.page!.title();
    const inputs = elements.filter((e) => e.tag === "input" || e.tag === "textarea" || e.tag === "select");
    const buttons = elements.filter((e) => e.tag === "button" || e.tag === "a");
    const other = elements.filter((e) => !["input", "textarea", "select", "button", "a"].includes(e.tag));

    const sys = `You are a QA Test Planning Agent. Create a JSON test plan for ONE web page. Return ONLY valid JSON — no markdown.`;
    const user = `Page: ${url}\nTitle: ${title}\nStrategy: ${this.config.strategy}\nMax tests: ${this.config.maxTestCases || 20}\n\nElements:\n${elements.slice(0, 30).map((e, i) =>
      `${i + 1}. [${e.tag.toUpperCase()}] ${e.selector} (text: "${e.text.substring(0, 40)}", type: ${e.type || "N/A"}, visible: ${e.isVisible})`
    ).join("\n")}\n\nGenerate tests for: form validation, button clicks, edge cases, visible errors, console errors.\nFor each test case:\n- id: TC###\n- name, description\n- priority: critical|high|medium|low\n- category: form|validation|interaction|navigation|visual\n- steps: {action:click|fill|select|hover|wait|verify|navigate, selector?, value?, description}\n- expectedOutcome\nAlso include:\n- TC001: Page Load\n- Broken image scan\n- Console error check\nReturn JSON: {pageUrl, pageTitle, totalTests, estimatedDurationSeconds, coverage:{forms,buttons,links,inputs,otherInteractive}, testCases[]}`;

    try {
      const resp = await this.model.call([new SystemMessage(sys), new HumanMessage(user)]);
      const cleaned = String(resp.content).replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed.testCases)) throw new Error("No testCases");
      const testCases = parsed.testCases.slice(0, this.config.maxTestCases || 20);
      return {
        pageUrl: url,
        pageTitle: title,
        totalTests: testCases.length,
        estimatedDurationSeconds: testCases.length * 8,
        coverage: {
          forms: inputs.filter((e: any) => e.tag === "form").length || 0,
          buttons: buttons.length,
          links: elements.filter((e: any) => e.tag === "a").length,
          inputs: inputs.length,
          otherInteractive: other.length,
        },
        testCases,
      };
    } catch (e: any) {
      logger.warn(`LLM plan failed: ${e.message}. Using fallback.`);
      return this.fallbackPlan(url, title, inputs, buttons, elements);
    }
  }

  private fallbackPlan(url: string, title: string, inputs: any[], buttons: any[], all: any[]): TestPlan {
    const cases: TestCase[] = [
      { id: "TC001", name: "Page Loads Correctly", description: "Page title and body render", priority: "critical", category: "navigation", steps: [{ action: "verify", description: `Title contains "${title}"` }], expectedOutcome: `Title is "${title}"` },
      { id: "TC002", name: "No Console Errors", description: "Zero JS errors on load", priority: "high", category: "validation", steps: [{ action: "wait", description: "Wait 2s" }], expectedOutcome: "Zero console errors" },
      { id: "TC003", name: "No Network Errors", description: "All requests return 2xx/3xx", priority: "high", category: "validation", steps: [{ action: "wait", description: "Wait for idle" }], expectedOutcome: "Zero 4xx/5xx" },
    ];
    buttons.slice(0, 5).forEach((btn, i) => {
      cases.push({
        id: `TC${10 + i}`,
        name: `Button "${btn.text.substring(0, 30)}" Click`,
        description: `Click ${btn.selector}`,
        priority: "medium", category: "interaction",
        steps: [
          { action: "click", selector: btn.selector, description: "Click button" },
          { action: "wait", description: "Wait 1.5s" },
        ],
        expectedOutcome: "No console/network errors",
      });
    });
    inputs.slice(0, 4).forEach((inp, i) => {
      cases.push({
        id: `TC${20 + i}`,
        name: `Input "${inp.selector}" Fill`,
        description: `Fill and verify ${inp.selector}`,
        priority: "medium", category: "form",
        steps: [
          { action: "fill", selector: inp.selector, value: "test@example.com", description: "Fill input" },
          { action: "verify", description: "Input has value" },
        ],
        expectedOutcome: "Value accepted",
      });
    });
    return {
      pageUrl: url, pageTitle: title,
      totalTests: cases.length,
      estimatedDurationSeconds: cases.length * 8,
      coverage: {
        forms: 0, buttons: buttons.length,
        links: all.filter((e) => e.tag === "a").length,
        inputs: inputs.length,
        otherInteractive: all.filter((e) => !["input", "textarea", "select", "button", "a"].includes(e.tag)).length,
      },
      testCases: cases,
    };
  }

  private async executeTestCase(tc: TestCase): Promise<TestCaseResult> {
    if (!pageOk(this.page)) {
      return { testCaseId: tc.id, status: "error", executionTimeMs: 0, stepsExecuted: 0, errorMessage: "Browser not available", findings: [] };
    }
    const start = Date.now();
    const findings: AgentFinding[] = [];
    let stepsExecuted = 0;
    try {
      await this.page.goto(this.config.targetUrl, { waitUntil: "networkidle" }).catch(() => {});
      await this.page.waitForTimeout(500);
      for (const step of tc.steps) {
        if (this.stopping) return { testCaseId: tc.id, status: "skipped", executionTimeMs: Date.now() - start, stepsExecuted, findings: [] };
        await this.executeStep(step);
        stepsExecuted++;
      }
      findings.push(...(await this.validateOutcome(tc)));
      const hasErrors = findings.some((f) => f.severity === "critical" || f.severity === "high");
      return { testCaseId: tc.id, status: hasErrors ? "failed" : "passed", executionTimeMs: Date.now() - start, stepsExecuted, findings };
    } catch (e: any) {
      findings.push({ type: "bug", description: `Test error: ${e.message}`, url: this.page.url(), severity: "high", metadata: { testCase: tc.id } });
      return { testCaseId: tc.id, status: "error", executionTimeMs: Date.now() - start, stepsExecuted, errorMessage: e.message, findings };
    }
  }

  private async executeStep(step: TestStep) {
    const p = this.page!;
    const sel = step.selector || "";
    logger.info(`${step.action}: ${sel}`);
    switch (step.action) {
      case "click":
        if (sel) await p.locator(sel).first().click({ timeout: 5000 }).catch(() => {});
        break;
      case "fill":
        if (sel && step.value) await p.locator(sel).first().fill(step.value, { timeout: 5000 }).catch(() => {});
        break;
      case "select":
        if (sel && step.value) await p.locator(sel).first().selectOption(step.value, { timeout: 5000 }).catch(() => {});
        break;
      case "hover":
        if (sel) await p.locator(sel).first().hover({ timeout: 5000 }).catch(() => {});
        break;
      case "wait":
        await p.waitForTimeout(1200); break;
      case "verify": break;
      case "navigate":
        if (step.value) await p.goto(step.value, { waitUntil: "networkidle" }).catch(() => {});
        break;
    }
  }

  private async validateOutcome(tc: TestCase): Promise<AgentFinding[]> {
    const findings: AgentFinding[] = [];
    if (!pageOk(this.page)) return findings;
    const url = this.page.url();

    const consoleErrors = this.consoleMonitor?.getErrors() || [];
    for (const err of consoleErrors) findings.push({ type: "console_error", description: err.message || String(err), severity: "medium", url });
    this.consoleMonitor?.clear();

    const networkErrors = this.networkMonitor?.getErrors() || [];
    for (const err of networkErrors) findings.push({ type: "network_error", description: err.statusText || err.url || String(err), severity: "medium", url });
    this.networkMonitor?.clear();

    const broken = await findBrokenImages(this.page);
    for (const img of broken) findings.push({ type: "broken_image", description: `Broken image: ${img.src}`, severity: "low", url, selector: img.selector });

    const hasVisibleError = await this.page.evaluate(() => {
      const els = document.querySelectorAll('[role="alert"], [class*="error"], [class*="toast"]');
      return Array.from(els).some((el) => (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).textContent?.trim().length! > 0);
    });
    if (hasVisibleError) {
      findings.push({ type: "validation_error", description: `Visible error after "${tc.name}"`, severity: "high", url });
    }
    return findings;
  }

  async runLayoutAudit(page: Page) {
    if (this.config.layoutAudit?.enabled === false) return;
    try {
      this.state.currentAction = "Running layout audit...";
      const max = this.config.layoutAudit?.maxElements ?? 300;
      const heuristics = this.config.layoutAudit?.heuristics;
      
      // Build screenshot config from layoutAudit config
      const screenshotConfig = this.config.layoutAudit?.screenshots;
      
      const findings = await runLayoutAudit(page, { 
        maxElements: max, 
        heuristics,
        screenshots: screenshotConfig,
        sessionId: this.state.sessionId,
      });
      for (const f of findings) {
        this.state.results.push({
          testCaseId: "layout-audit",
          status: f.severity === "error" || f.severity === "warning" ? "failed" : "passed",
          executionTimeMs: 0,
          stepsExecuted: 0,
          findings: [{
            type: f.type,
            severity: f.severity === "error" ? "high" : f.severity === "warning" ? "medium" : "low",
            category: "layout",
            description: f.message,
            url: page.url(),
            selector: f.selector,
            screenshot: f.screenshot,
          }],
        });
      }
    } catch (e) {
      logger.warn("Layout audit failed:", e);
    }
  }

  async runVisualRegression(page: Page) {
    if (this.config.visualRegression?.enabled !== true) return;
    try {
      this.state.currentAction = "Running visual regression...";
      
      const vrConfig: VisualRegressionConfig = {
        enabled: true,
        baselineDir: this.config.visualRegression.baselineDir ?? "./test-results/baselines",
        currentDir: this.config.visualRegression.currentDir ?? "./test-results/current",
        diffDir: this.config.visualRegression.diffDir ?? "./test-results/diffs",
        viewports: this.config.visualRegression.viewports ?? [
          { width: 1920, height: 1080, name: "desktop" },
          { width: 768, height: 1024, name: "tablet" },
          { width: 375, height: 667, name: "mobile" },
        ],
        threshold: this.config.visualRegression.threshold ?? 0.1,
        pixelmatchThreshold: this.config.visualRegression.pixelmatchThreshold ?? 0.1,
        captureFullPage: this.config.visualRegression.captureFullPage ?? true,
        generateDiffImages: this.config.visualRegression.generateDiffImages ?? true,
      };

      const results = await runVisualRegression(page, this.config.targetUrl, vrConfig);

      for (const result of results) {
        const findings: AgentFinding[] = [];
        
        if (result.isNewBaseline) {
          findings.push({
            type: "visual_regression",
            severity: "info",
            category: "visual",
            description: `New baseline created for ${result.viewport.name} (${result.viewport.width}x${result.viewport.height})`,
            url: result.url,
            metadata: {
              baselinePath: result.baselinePath,
              isNew: true,
            },
          });
        } else if (!result.match) {
          findings.push({
            type: "visual_regression",
            severity: "high",
            category: "visual",
            description: `Visual regression detected: ${result.diffPercentage.toFixed(2)}% difference in ${result.viewport.name} (${result.diffPixelCount} pixels)`,
            url: result.url,
            selector: result.viewport.name,
            screenshot: result.currentPath,
            metadata: {
              baselinePath: result.baselinePath,
              diffPath: result.diffPath,
              diffPercentage: result.diffPercentage,
              diffPixelCount: result.diffPixelCount,
            },
          });
        }

        if (findings.length > 0) {
          this.state.results.push({
            testCaseId: `visual-regression-${result.viewport.name}`,
            status: result.match ? "passed" : "failed",
            executionTimeMs: 0,
            stepsExecuted: 0,
            findings,
          });
        }
      }

      logger.info(`Visual regression complete: ${results.length} viewports tested`);
    } catch (e) {
      logger.warn("Visual regression failed:", e);
    }
  }
}
