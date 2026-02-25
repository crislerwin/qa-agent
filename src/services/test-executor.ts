import { createLogger } from "../utils/logger.ts";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { GeneratedTest } from "./test-generator.ts";
import { execSync } from "child_process";

const logger = createLogger("test-executor");

export interface TestExecutionResult {
  test: GeneratedTest;
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}

export interface TestExecutionConfig {
  dryRun?: boolean;
  parallel?: boolean;
  maxConcurrency?: number;
  timeout?: number;
  retryCount?: number;
}

export class TestExecutor {
  private config: TestExecutionConfig;

  constructor(config: TestExecutionConfig = {}) {
    this.config = {
      dryRun: false,
      parallel: false,
      maxConcurrency: 4,
      timeout: 30000,
      retryCount: 2,
      ...config,
    };
  }

  async saveTests(tests: GeneratedTest[]): Promise<string[]> {
    const savedFiles: string[] = [];

    logger.info(`Saving ${tests.length} generated tests`);

    for (const test of tests) {
      try {
        const filePath = test.filePath;
        const dir = dirname(filePath);

        // Create directory if it doesn't exist
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Write test file
        writeFileSync(filePath, test.content, "utf8");
        savedFiles.push(filePath);

        logger.info(`Saved test: ${test.name} -> ${filePath}`);
      } catch (error) {
        logger.error(`Failed to save test ${test.name}:`, error);
      }
    }

    return savedFiles;
  }

  async executeTests(tests: GeneratedTest[]): Promise<TestExecutionResult[]> {
    if (this.config.dryRun) {
      logger.info("Dry run mode: skipping test execution");
      return tests.map((test) => ({
        test,
        success: true,
        output: "Dry run - test execution skipped",
        executionTime: 0,
      }));
    }

    logger.info(`Executing ${tests.length} tests`);

    if (this.config.parallel) {
      return this.executeTestsParallel(tests);
    } else {
      return this.executeTestsSequential(tests);
    }
  }

  private async executeTestsSequential(
    tests: GeneratedTest[],
  ): Promise<TestExecutionResult[]> {
    const results: TestExecutionResult[] = [];

    for (const test of tests) {
      const result = await this.executeSingleTest(test);
      results.push(result);
    }

    return results;
  }

  private async executeTestsParallel(
    tests: GeneratedTest[],
  ): Promise<TestExecutionResult[]> {
    const results: TestExecutionResult[] = [];
    const chunks = this.chunkArray(tests, this.config.maxConcurrency!);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((test) => this.executeSingleTest(test)),
      );
      results.push(...chunkResults);
    }

    return results;
  }

  private async executeSingleTest(
    test: GeneratedTest,
  ): Promise<TestExecutionResult> {
    const startTime = Date.now();
    let lastError: Error | undefined;

    logger.info(`Executing test: ${test.name}`);

    for (let attempt = 1; attempt <= this.config.retryCount! + 1; attempt++) {
      try {
        const output = execSync(`bun test "${test.filePath}"`, {
          encoding: "utf8",
          timeout: this.config.timeout,
        });

        const executionTime = Date.now() - startTime;

        return {
          test,
          success: true,
          output,
          executionTime,
        };
      } catch (error) {
        lastError = error as Error;
        const executionTime = Date.now() - startTime;

        if (attempt <= this.config.retryCount!) {
          logger.warn(
            `Test ${test.name} failed (attempt ${attempt}), retrying...`,
          );
          await this.delay(1000 * attempt); // Exponential backoff
        }
      }
    }

    // All retries failed
    const executionTime = Date.now() - startTime;
    return {
      test,
      success: false,
      output: (lastError as any)?.stdout || "",
      error: lastError?.message,
      executionTime,
    };
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  generateTestReport(results: TestExecutionResult[]): string {
    const totalTests = results.length;
    const passedTests = results.filter((r) => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);

    let report = `# Test Execution Report\n\n`;
    report += `**Summary:**\n`;
    report += `- Total Tests: ${totalTests}\n`;
    report += `- Passed: ${passedTests}\n`;
    report += `- Failed: ${failedTests}\n`;
    report += `- Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`;
    report += `- Total Execution Time: ${totalTime}ms\n\n`;

    if (failedTests > 0) {
      report += `## Failed Tests\n\n`;
      results
        .filter((r) => !r.success)
        .forEach((result) => {
          report += `### ${result.test.name}\n`;
          report += `- **Type:** ${result.test.testType}\n`;
          report += `- **Priority:** ${result.test.priority}\n`;
          report += `- **File:** ${result.test.filePath}\n`;
          report += `- **Error:** ${result.error || "Unknown error"}\n\n`;
        });
    }

    report += `## All Test Results\n\n`;
    results.forEach((result) => {
      const status = result.success ? "✅" : "❌";
      report += `${status} **${result.test.name}** (${result.executionTime}ms)\n`;
      report += `- Type: ${result.test.testType}, Priority: ${result.test.priority}\n`;
      report += `- File: ${result.test.filePath}\n\n`;
    });

    return report;
  }

  async saveTestReport(
    results: TestExecutionResult[],
    outputPath: string,
  ): Promise<void> {
    const report = this.generateTestReport(results);

    try {
      const dir = dirname(outputPath);
      mkdirSync(dir, { recursive: true });
      writeFileSync(outputPath, report, "utf8");
      logger.info(`Test report saved to: ${outputPath}`);
    } catch (error) {
      logger.error("Failed to save test report:", error);
    }
  }
}
