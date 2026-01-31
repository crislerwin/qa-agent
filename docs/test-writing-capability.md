# Test Writing Capability Documentation

## Overview

The QA Agent now includes automated test generation capabilities that can create comprehensive test suites based on exploration findings. This feature leverages the agent's bug discovery process to generate relevant, targeted tests that validate the issues found during exploration.

## Architecture

### Core Components

1. **TestGenerator** (`src/services/test-generator.ts`)
   - Generates tests from agent findings using LLM-powered analysis
   - Supports multiple test types: E2E, Integration, and Unit tests
   - Categorizes findings and creates appropriate test scenarios

2. **TestExecutor** (`src/services/test-executor.ts`)
   - Saves generated tests to the filesystem
   - Executes tests with configurable options (parallel/sequential, retry logic)
   - Generates comprehensive execution reports

3. **Integration with ExploratoryAgent**
   - Seamlessly integrated into the main exploration workflow
   - Configurable via AgentConfig options

## Features

### Test Types

1. **E2E Tests**
   - Full browser automation tests using Playwright
   - Tests user flows and interactions
   - Validates bug fixes from end-user perspective

2. **Integration Tests**
   - Component interaction testing
   - Service/API integration validation
   - Mocked external dependencies

3. **Unit Tests**
   - Isolated function testing
   - Edge cases and error conditions
   - Pure logic validation

### Test Generation Process

1. **Finding Categorization**: Groups findings by type (broken-images, console-errors, network-errors, etc.)
2. **LLM-Powered Generation**: Uses the configured LLM to create appropriate test code
3. **Pattern Matching**: Follows existing codebase patterns and conventions
4. **Test Organization**: Generates structured test files with proper naming and organization

## Configuration

### AgentConfig Options

```typescript
interface AgentConfig {
  // ... existing config
  
  // Test generation settings
  enableTestGeneration?: boolean;           // Enable/disable test generation
  testOutputDir?: string;                    // Output directory for generated tests
  includeE2ETests?: boolean;                 // Generate E2E tests (default: true)
  includeIntegrationTests?: boolean;         // Generate integration tests (default: true)
  includeUnitTests?: boolean;                // Generate unit tests (default: true)
  
  // Execution settings
  testDryRun?: boolean;                      // Skip actual test execution (default: false)
  testParallelExecution?: boolean;           // Execute tests in parallel (default: false)
  testMaxConcurrency?: number;              // Max parallel test execution (default: 4)
  testTimeout?: number;                      // Test execution timeout in ms (default: 30000)
  testRetryCount?: number;                   // Number of retry attempts (default: 2)
}
```

## Usage

### CLI Usage

The test generation capability is now integrated into the main CLI flow. When you run:

```bash
bun run cli
```

You'll be prompted with test generation options:

1. **Enable Test Generation**: Choose whether to generate automated tests from findings
2. **Select Test Types**: Choose which test types to generate:
   - E2E Tests (Browser automation)
   - Integration Tests (Component interactions)  
   - Unit Tests (Individual functions)
3. **Execution Mode**: Select how tests should be executed:
   - Dry Run (Generate only, don't execute)
   - Sequential (Execute tests one by one)
   - Parallel (Execute multiple tests concurrently)
4. **Advanced Options** (optional): Configure concurrency, timeouts, and retry counts

The tests will be generated automatically after exploration completes, or you can choose "Generate Tests Now" during exploration.

### Programmatic Usage

```typescript
import { ExploratoryAgent, type AgentConfig } from './src/agents/exploratory.ts';

const config: AgentConfig = {
  baseUrl: 'https://your-app.com',
  enableTestGeneration: true,
  testOutputDir: './generated-tests',
  includeE2ETests: true,
  includeIntegrationTests: true,
  includeUnitTests: false,  // Skip unit tests
  testParallelExecution: true,
  testMaxConcurrency: 8
};

const agent = new ExploratoryAgent(config);

// Run exploration
await agent.start();

// Generate and execute tests
const tests = await agent.generateTests();
console.log(`Generated ${tests.length} tests`);
```

## Test File Structure

Generated tests follow this organizational pattern:

```
generated-tests/
├── broken-images/
│   ├── e2e-2024-01-31-1.test.ts
│   └── integration-2024-01-31-1.test.ts
├── console-errors/
│   ├── e2e-2024-01-31-1.test.ts
│   └── unit-2024-01-31-1.test.ts
├── network-errors/
│   └── e2e-2024-01-31-1.test.ts
└── functional/
    ├── e2e-2024-01-31-1.test.ts
    └── integration-2024-01-31-1.test.ts
```

## Test Reports

After execution, comprehensive reports are generated in `reports/test-execution-{timestamp}.md` with:

- **Summary**: Pass/fail statistics, success rates, execution times
- **Failed Tests**: Detailed error information for debugging
- **All Test Results**: Complete list with status and metadata

## Integration with Existing Workflow

The test generation capability is designed to work seamlessly with the existing agent workflow:

1. **Exploration Phase**: Agent explores the application and discovers issues
2. **Finding Collection**: All issues are collected and categorized
3. **Test Generation**: LLM analyzes findings and generates appropriate tests
4. **Test Execution**: Tests are executed with configurable options
5. **Reporting**: Comprehensive reports are generated

## Best Practices

1. **Configure Appropriately**: Enable only the test types you need to reduce noise
2. **Review Generated Tests**: Always review generated tests before committing
3. **Use Dry Run**: Test with dry-run mode first to validate output
4. **Parallel Execution**: Use parallel execution for faster results on large test suites
5. **Custom Prompts**: The LLM prompts can be customized for specific requirements

## Example Generated Test

```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { chromium, type Browser, type Page, type BrowserContext } from "playwright-core";

describe("Broken Images - E2E Tests", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("should detect and report broken images on product pages", async () => {
    await page.goto("https://your-app.com/products");
    
    // Wait for images to load
    await page.waitForTimeout(2000);
    
    // Check for broken images
    const brokenImages = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const broken = [];
      
      images.forEach(img => {
        if (!img.src && !img.srcset) {
          broken.push({
            selector: img.tagName.toLowerCase() + 
                     (img.id ? '#' + img.id : '') + 
                     (img.className ? '.' + img.className.split(' ').join('.') : ''),
            alt: img.alt || 'No alt text',
            reason: 'Missing src and srcset attributes'
          });
        }
      });
      
      return broken;
    });

    expect(brokenImages.length).toBe(0);
  });

  test("should handle images with 404 errors gracefully", async () => {
    await page.goto("https://your-app.com/products");
    
    // Monitor for failed image requests
    const failedRequests: string[] = [];
    
    page.on('response', response => {
      if (response.url().includes('.jpg') || response.url().includes('.png')) {
        if (response.status() === 404) {
          failedRequests.push(response.url());
        }
      }
    });
    
    await page.waitForTimeout(2000);
    
    expect(failedRequests.length).toBe(0);
  });
});
```

### Demo Script

For a quick demonstration of the test generation capability:

```bash
bun run demo-test-generation
```

This script shows sample test generation from example findings.

## Future Enhancements

1. **Custom Test Templates**: Allow custom test templates for different patterns
2. **Test Refactoring**: Automatic refactoring of existing tests based on new findings
3. **Regression Test Generation**: Generate tests specifically for regression prevention
4. **Performance Test Integration**: Add performance testing capabilities
5. **CI/CD Integration**: Direct integration with CI/CD pipelines

## Troubleshooting

### Common Issues

1. **LLM Connection**: Ensure the LLM API is properly configured
2. **Test Execution**: Check that Playwright is properly installed for E2E tests
3. **File Permissions**: Ensure write permissions for output directories
4. **Memory Usage**: Monitor memory usage with large test suites

### Debug Mode

Enable verbose logging to debug issues:

```typescript
const logger = createLogger("test-generator", { level: "debug" });
```

This comprehensive test writing capability significantly enhances the QA Agent's ability to not just find issues, but also create the validation needed to ensure they stay fixed.