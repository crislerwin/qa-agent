import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createLogger } from "../utils/logger.ts";
import type { AgentFinding, AgentState } from "../types/index.ts";

const logger = createLogger("test-generator");

export interface GeneratedTest {
  name: string;
  description: string;
  filePath: string;
  content: string;
  testType: "unit" | "integration" | "e2e";
  priority: "high" | "medium" | "low";
}

export interface TestGenerationConfig {
  outputDir: string;
  includeE2E: boolean;
}

export class TestGenerator {
  private model: BaseChatModel;
  private config: TestGenerationConfig;

  constructor(model: BaseChatModel, config: TestGenerationConfig) {
    this.model = model;
    this.config = config;
  }

  async generateTestsFromFindings(
    findings: AgentFinding[],
    state: AgentState,
    baseUrl: string,
  ): Promise<GeneratedTest[]> {
    logger.info(`Generating E2E tests from ${findings.length} findings`);

    const generatedTests: GeneratedTest[] = [];

    // Group findings by type for better test organization
    const groupedFindings = this.groupFindingsByType(findings);

    for (const [category, categoryFindings] of Object.entries(
      groupedFindings,
    )) {
      if (categoryFindings.length === 0) continue;

      // Generate E2E tests based on findings
      if (this.config.includeE2E) {
        const e2eTests = await this.generateE2ETests(
          category,
          categoryFindings,
          baseUrl,
        );
        generatedTests.push(...e2eTests);
      }
    }

    logger.info(`Generated ${generatedTests.length} E2E tests`);
    return generatedTests;
  }

  private groupFindingsByType(
    findings: AgentFinding[],
  ): Record<string, AgentFinding[]> {
    const grouped: Record<string, AgentFinding[]> = {};

    findings.forEach((finding) => {
      const category = this.categorizeFinding(finding);
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(finding);
    });

    return grouped;
  }

  private categorizeFinding(finding: AgentFinding): string {
    if (finding.type === "broken_image") return "broken-images";
    if (finding.type === "console_error") return "console-errors";
    if (finding.type === "network_error") return "network-errors";
    if (finding.type === "validation_error") return "validation-errors";
    if (finding.type === "functional_bug") return "functional";
    return "general";
  }

  private async generateE2ETests(
    category: string,
    findings: AgentFinding[],
    baseUrl: string,
  ): Promise<GeneratedTest[]> {
    const prompt = this.createE2ETestPrompt(category, findings, baseUrl);

    try {
      const response = await this.model.invoke([
        new SystemMessage(
          "You are an expert test automation engineer. Generate comprehensive E2E tests using ONLY the Playwright test framework. Import EVERYTHING from '@playwright/test' only — never import from 'playwright' directly. Use test.describe(), test(), expect() patterns. Do NOT use Bun test framework or any other testing framework.",
        ),
        new HumanMessage(prompt),
      ]);

      const tests = this.parseTestResponse(
        response.content as string,
        category,
      );
      return tests;
    } catch (error) {
      logger.error(`Failed to generate E2E tests for ${category}:`, error);
      return [];
    }
  }

  private createE2ETestPrompt(
    category: string,
    findings: AgentFinding[],
    baseUrl: string,
  ): string {
    const findingsText = findings
      .map(
        (f) =>
          `- ${f.description} at ${f.url} (selector: ${f.selector || "N/A"})`,
      )
      .join("\n");

    return `Generate comprehensive E2E tests for the following ${category} findings:

Base URL: ${baseUrl}

Findings:
${findingsText}

Requirements:
1. Use ONLY Playwright test framework with TypeScript
2. Import EVERYTHING from '@playwright/test' ONLY — NEVER import from 'playwright' (bare package)
3. Use proper test.describe() and test() structure
4. Include proper setup/teardown with test.beforeAll()/test.afterAll()
5. Use descriptive test names that clearly explain what's being tested
6. Include assertions that verify the bugs are fixed
7. Add proper waiting and error handling with page.waitForTimeout() and expect().toBeVisible()
8. Include both positive (should work) and negative (should catch errors) test cases
9. Use page.goto(), page.locator(), expect().toBeVisible() etc.
10. Include API mocking with page.route() where appropriate

Format your response as a single test file with proper imports and Playwright test structure.

CRITICAL IMPORT RULE:
- Import EVERYTHING from '@playwright/test' ONLY
- NEVER add "import { chromium } from 'playwright'" or any import from the bare 'playwright' package
- Use the { browser } fixture from @playwright/test for browser setup

Example format:
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

test.describe('Category Name Tests', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should handle specific issue', async () => {
    await page.goto('https://example.com');
    // test implementation
  });

  test('should handle another issue', async () => {
    await page.goto('https://example.com/other');
    // test implementation  
  });
});`;
  }

  private parseTestResponse(
    response: string,
    category: string,
  ): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Extract test blocks from the response
    const testBlocks = this.extractTestBlocks(response);

    testBlocks.forEach((testContent, index) => {
      const testName = this.generateTestName(
        category,
        "e2e",
        index,
        testContent,
      );
      const filePath = this.generateFilePath(category, "e2e", index);

      tests.push({
        name: testName,
        description: this.extractTestDescription(testContent),
        filePath,
        content: testContent,
        testType: "e2e",
        priority: this.determinePriority(category, "e2e"),
      });
    });

    return tests;
  }

  private extractTestBlocks(response: string): string[] {
    // Look for test blocks enclosed in code fences
    const codeBlockRegex = /```(?:typescript|ts)?\s*\n([\s\S]*?)\n```/g;
    const matches = [...response.matchAll(codeBlockRegex)];

    if (matches.length > 0) {
      return matches.map((match) => match[1] as string);
    }

    // If no code blocks, try to extract import statements to the end
    const importRegex = /import.*from ['"]@playwright\/test['"];?\s*\n/g;
    const importMatches = [...response.matchAll(importRegex)];

    if (importMatches.length > 0) {
      return [response.trim()];
    }

    return [response.trim()];
  }

  private generateTestName(
    category: string,
    testType: string,
    index: number,
    content: string,
  ): string {
    // Try to extract test name from content
    const testNameMatch = content.match(
      /test\.describe\s*\(\s*["']([^"']+)["']/,
    );
    if (testNameMatch) {
      return testNameMatch[1]!;
    }

    // Generate fallback name
    return `${category}-${testType}-test-${index + 1}`;
  }

  private generateFilePath(
    category: string,
    testType: string,
    index: number,
  ): string {
    const timestamp = new Date().toISOString().split("T")[0];
    return `${this.config.outputDir}/${category}/${testType}-${timestamp}-${index + 1}.spec.ts`;
  }

  private extractTestDescription(content: string): string {
    // Look for the first test block or describe block comment
    const commentMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n/);
    if (commentMatch) {
      return commentMatch[1]!;
    }

    // Fallback to first line after describe
    const describeMatch = content.match(
      /describe\s*\(\s*["'][^"']*["']\s*,\s*\(\)\s*=>\s*\{\s*\/\/?\s*(.+?)\s*\n/,
    );
    if (describeMatch) {
      return describeMatch[1]!;
    }

    return "Generated test based on agent findings";
  }

  private determinePriority(
    category: string,
    testType: string,
  ): "high" | "medium" | "low" {
    // High priority for functional bugs and critical issues
    if (category === "functional" || category === "network-errors") {
      return "high";
    }

    // Medium priority for E2E tests
    if (testType === "e2e") {
      return "medium";
    }

    return "low";
  }
}
