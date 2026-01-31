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
  includeIntegration: boolean;
  includeUnit: boolean;
  testFramework: "bun" | "jest" | "vitest";
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
    baseUrl: string
  ): Promise<GeneratedTest[]> {
    logger.info(`Generating tests from ${findings.length} findings`);

    const generatedTests: GeneratedTest[] = [];

    // Group findings by type for better test organization
    const groupedFindings = this.groupFindingsByType(findings);

    for (const [category, categoryFindings] of Object.entries(groupedFindings)) {
      if (categoryFindings.length === 0) continue;

      // Generate different test types based on findings
      if (this.config.includeE2E) {
        const e2eTests = await this.generateE2ETests(category, categoryFindings, baseUrl);
        generatedTests.push(...e2eTests);
      }

      if (this.config.includeIntegration) {
        const integrationTests = await this.generateIntegrationTests(category, categoryFindings);
        generatedTests.push(...integrationTests);
      }

      if (this.config.includeUnit) {
        const unitTests = await this.generateUnitTests(category, categoryFindings);
        generatedTests.push(...unitTests);
      }
    }

    logger.info(`Generated ${generatedTests.length} tests`);
    return generatedTests;
  }

  private groupFindingsByType(findings: AgentFinding[]): Record<string, AgentFinding[]> {
    const grouped: Record<string, AgentFinding[]> = {};

    findings.forEach(finding => {
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
    baseUrl: string
  ): Promise<GeneratedTest[]> {
    const prompt = this.createE2ETestPrompt(category, findings, baseUrl);
    
    try {
      const response = await this.model.invoke([
        new SystemMessage("You are an expert test automation engineer. Generate comprehensive E2E tests using Playwright and TypeScript following the established patterns in the codebase."),
        new HumanMessage(prompt)
      ]);

      const tests = this.parseTestResponse(response.content as string, "e2e", category);
      return tests;
    } catch (error) {
      logger.error(`Failed to generate E2E tests for ${category}:`, error);
      return [];
    }
  }

  private async generateIntegrationTests(
    category: string,
    findings: AgentFinding[]
  ): Promise<GeneratedTest[]> {
    const prompt = this.createIntegrationTestPrompt(category, findings);
    
    try {
      const response = await this.model.invoke([
        new SystemMessage("You are an expert test automation engineer. Generate integration tests that test component interactions using the established patterns in the codebase."),
        new HumanMessage(prompt)
      ]);

      const tests = this.parseTestResponse(response.content as string, "integration", category);
      return tests;
    } catch (error) {
      logger.error(`Failed to generate integration tests for ${category}:`, error);
      return [];
    }
  }

  private async generateUnitTests(
    category: string,
    findings: AgentFinding[]
  ): Promise<GeneratedTest[]> {
    const prompt = this.createUnitTestPrompt(category, findings);
    
    try {
      const response = await this.model.invoke([
        new SystemMessage("You are an expert test automation engineer. Generate focused unit tests using the established patterns in the codebase."),
        new HumanMessage(prompt)
      ]);

      const tests = this.parseTestResponse(response.content as string, "unit", category);
      return tests;
    } catch (error) {
      logger.error(`Failed to generate unit tests for ${category}:`, error);
      return [];
    }
  }

  private createE2ETestPrompt(category: string, findings: AgentFinding[], baseUrl: string): string {
    const findingsText = findings.map(f => 
      `- ${f.description} at ${f.url} (selector: ${f.selector ?? 'N/A'})`
    ).join('\n');

    return `Generate comprehensive E2E tests for the following ${category} findings:

Base URL: ${baseUrl}

Findings:
${findingsText}

Requirements:
1. Use Playwright and TypeScript
2. Follow the existing test patterns in the codebase
3. Include proper setup/teardown with beforeAll/afterAll
4. Use descriptive test names that clearly explain what's being tested
5. Include assertions that verify the bugs are fixed
6. Add proper waiting and error handling
7. Include both positive (should work) and negative (should catch errors) test cases
8. Use the Bun test framework format (import from "bun:test")

Format your response as a single test file with proper imports and test structure.`;
  }

  private createIntegrationTestPrompt(category: string, findings: AgentFinding[]): string {
    const findingsText = findings.map(f => 
      `- ${f.description} (type: ${f.type})`
    ).join('\n');

    return `Generate integration tests for the following ${category} findings:

Findings:
${findingsText}

Requirements:
1. Focus on testing component interactions and data flow
2. Mock external dependencies where appropriate
3. Use TypeScript with proper typing
4. Include setup for required services/tools
5. Follow existing patterns in the codebase
6. Use the Bun test framework format

Generate tests that verify the integration between components works correctly.`;
  }

  private createUnitTestPrompt(category: string, findings: AgentFinding[]): string {
    const findingsText = findings.map(f => 
      `- ${f.description}`
    ).join('\n');

    return `Generate focused unit tests for the following ${category} findings:

Findings:
${findingsText}

Requirements:
1. Test individual functions/methods in isolation
2. Mock all external dependencies
3. Use TypeScript with proper typing
4. Follow existing patterns in the codebase
5. Focus on edge cases and error conditions
6. Use the Bun test framework format

Generate unit tests that verify the specific functions work correctly.`;
  }

  private parseTestResponse(
    response: string,
    testType: "unit" | "integration" | "e2e",
    category: string
  ): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Extract test blocks from the response
    const testBlocks = this.extractTestBlocks(response);

    testBlocks.forEach((testContent, index) => {
      const testName = this.generateTestName(category, testType, index, testContent);
      const filePath = this.generateFilePath(category, testType, index);

      tests.push({
        name: testName,
        description: this.extractTestDescription(testContent),
        filePath,
        content: testContent,
        testType,
        priority: this.determinePriority(category, testType)
      });
    });

    return tests;
  }

  private extractTestBlocks(response: string): string[] {
    // Look for test blocks enclosed in code fences
    const codeBlockRegex = /```(?:typescript|ts)?\s*\n([\s\S]*?)\n```/g;
    const matches = [...response.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
      return matches.map(match => match[1] as string);
    }

    // If no code blocks, try to extract import statements to the end
    const importRegex = /import[\s\S]*?(?=\n\n|\nimport|\ndescribe|\ntest|$)/g;
    const importMatches = [...response.matchAll(importRegex)];
    
    if (importMatches.length > 0) {
      return [response.trim()];
    }

    return [response.trim()];
  }

  private generateTestName(category: string, testType: string, index: number, content: string): string {
    // Try to extract test name from content
    const testNameMatch = content.match(/describe\s*\(\s*["']([^"']+)["']/);
    if (testNameMatch) {
      return testNameMatch[1]!;
    }

    // Generate fallback name
    return `${category}-${testType}-test-${index + 1}`;
  }

  private generateFilePath(category: string, testType: string, index: number): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return `${this.config.outputDir}/${category}/${testType}-${timestamp}-${index + 1}.test.ts`;
  }

  private extractTestDescription(content: string): string {
    // Look for the first test block or describe block comment
    const commentMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n/);
    if (commentMatch) {
      return commentMatch[1]!;
    }

    // Fallback to first line after describe
    const describeMatch = content.match(/describe\s*\(\s*["'][^"']*["']\s*,\s*\(\)\s*=>\s*\{\s*\/\/?\s*(.+?)\s*\n/);
    if (describeMatch) {
      return describeMatch[1]!;
    }

    return "Generated test based on agent findings";
  }

  private determinePriority(category: string, testType: string): "high" | "medium" | "low" {
    // High priority for functional bugs and critical issues
    if (category === "functional" || category === "network-errors") {
      return "high";
    }

    // Medium priority for E2E tests and integration tests
    if (testType === "e2e" || testType === "integration") {
      return "medium";
    }

    // Low priority for unit tests of less critical issues
    return "low";
  }
}