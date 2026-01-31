# E2E Test Writing Capability Documentation

## Overview

The QA Agent now includes automated E2E test generation capabilities that create browser-based tests from exploration findings. This feature leverages the agent's bug discovery process to generate relevant, targeted Playwright tests that validate the issues found during exploration.

**Important Note**: The agent generates E2E tests because it interacts with the actual running application. Unit and integration tests would require access to source code/components, which is not available during exploration.

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

### Test Type: E2E Tests

- **Full browser automation tests** using Playwright
- **Tests user flows and interactions** through the actual application
- **Validates bug fixes** from end-user perspective
- **No source code required** - tests what users actually experience

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
  enableTestGeneration?: boolean;           // Enable/disable E2E test generation
  testOutputDir?: string;                    // Output directory for generated tests
  includeE2ETests?: boolean;                 // Generate E2E tests (default: true)
  
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

You'll be prompted with E2E test generation options:

1. **Enable Test Generation**: Choose whether to generate E2E tests from findings
2. **Execution Mode**: Select how tests should be executed:
   - Dry Run (Generate only, don't execute)
   - Sequential (Execute tests one by one)
   - Parallel (Execute multiple tests concurrently)
3. **Advanced Options** (optional): Configure concurrency, timeouts, and retry counts

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

Generated E2E tests follow this organizational pattern:

```
generated-tests/
├── broken-images/
│   └── e2e-2024-01-31-1.spec.ts
├── console-errors/
│   └── e2e-2024-01-31-1.spec.ts
├── network-errors/
│   └── e2e-2024-01-31-1.spec.ts
└── functional/
    └── e2e-2024-01-31-1.spec.ts
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

## Running Generated Tests

The generated E2E tests are standard Playwright tests and can be run in several ways:

### 🚀 **Quick Start Options**

#### 1. **Using Helper Script (Recommended)**
```bash
# Interactive test runner with UI
bun run run-tests
```

#### 2. **Direct Playwright Commands**
```bash
# Install Playwright browsers (one-time setup)
npx playwright install

# Run all generated tests
npx playwright test generated-tests/

# Run with provided config
npx playwright test --config=playwright.config.ts
```

### 📋 **Test Execution Options**

#### **Run All Tests**
```bash
# From project root
npx playwright test generated-tests/

# Using the provided config file
npx playwright test
```

#### **Run Specific Test Files**
```bash
# Run single test file
npx playwright test generated-tests/broken-images/e2e-2024-01-31-1.spec.ts

# Run all tests in a directory
npx playwright test generated-tests/broken-images/

# Run tests matching pattern
npx playwright test generated-tests/**/*.spec.ts
```

#### **Run with Options**
```bash
# Run with headed browser (show browser window)
npx playwright test --headed

# Run on specific browser
npx playwright test --browser=chromium
npx playwright test --browser=firefox
npx playwright test --browser=webkit

# Run in debug mode
npx playwright test --debug

# Run with timeout
npx playwright test --timeout=60000

# Run tests in parallel
npx playwright test --workers=4
```

#### **Development Mode**
```bash
# Run in watch mode (auto-rerun on changes)
npx playwright test --watch

# Run with visual test runner UI
npx playwright test --ui
```

### 🔧 **Setup Requirements**

#### **Install Playwright**
```bash
# Install all browsers
npx playwright install

# Install specific browsers
npx playwright install chromium
npx playwright install firefox
npx playwright install webkit
```

#### **Environment Variables**
```bash
# For CI environments
CI=true npx playwright test

# For specific browser preference
BROWSER=chromium npx playwright test
```

### 🎯 **Common Usage Patterns**

#### **After Agent Exploration**
```bash
# 1. Agent generates tests
bun run cli

# 2. Run the generated tests
bun run run-tests
# Choose "Run all generated tests"
```

#### **During Development**
```bash
# Generate tests with dry-run first
bun run cli

# Run in watch mode while fixing issues
npx playwright test generated-tests/ --watch

# Use UI for better debugging
npx playwright test --ui
```

### 📊 **Test Reports**

After running tests, reports are generated in:
- `test-results/` - HTML reports and screenshots
- `playwright-report/` - Detailed test execution reports

View reports:
```bash
# Open HTML report
npx playwright show-report

# Or open the report directory
open test-results/index.html
```

### 2. **Run Specific Test Files**
```bash
# Run single test file
npx playwright test generated-tests/broken-images/e2e-2024-01-31-1.spec.ts

# Run all tests in a directory
npx playwright test generated-tests/broken-images/

# Run tests matching pattern
npx playwright test generated-tests/**/*.spec.ts
```

### 3. **Run with Options**
```bash
# Run with headed browser (show browser)
npx playwright test --headed

# Run on specific browser
npx playwright test --browser=chromium
npx playwright test --browser=firefox

# Run in debug mode
npx playwright test --debug

# Run with timeout
npx playwright test --timeout=60000
```

### 4. **Install Playwright (if not already installed)**
```bash
# Install Playwright browsers
npx playwright install

# Install specific browsers
npx playwright install chromium
npx playwright install webkit
```

### 5. **Run During Development**
```bash
# Run in watch mode
npx playwright test --watch

# Run with UI
npx playwright test --ui
```

### 6. **CI/CD Integration**
```bash
# Headless mode (default for CI)
CI=true npx playwright test

# With specific config
npx playwright test --config=playwright.config.ts
```

### 7. **From Generated Test Directory**
```bash
cd generated-tests/broken-images
npx playwright test e2e-2024-01-31-1.spec.ts
```

## Best Practices

1. **Configure Appropriately**: Enable only the test types you need to reduce noise
2. **Review Generated Tests**: Always review generated tests before committing
3. **Use Dry Run**: Test with dry-run mode first to validate output
4. **Parallel Execution**: Use parallel execution for faster results on large test suites
5. **Custom Prompts**: The LLM prompts can be customized for specific requirements
6. **Install Playwright**: Ensure Playwright browsers are installed before running tests

## Example Generated Test

```typescript
import { test, expect } from '@playwright/test';

test.describe('Broken Images - E2E Tests', () => {
  test('should detect missing logo image', async ({ page }) => {
    // Navigate to page with broken image
    await page.goto('https://example.com/products');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for missing image
    const logoImage = page.locator('img.logo');
    await expect(logoImage).toBeVisible();
    
    // Verify image has valid src attribute
    const src = await logoImage.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toBe('');
  });

  test('should handle 404 image requests', async ({ page }) => {
    // Monitor network requests
    const failedRequests = [];
    page.on('response', response => {
      if (response.url().match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        if (response.status() === 404) {
          failedRequests.push(response.url());
        }
      }
    });
    
    await page.goto('https://example.com/products');
    await page.waitForLoadState('networkidle');
    
    // Assert no 404 image requests
    expect(failedRequests.length).toBe(0);
  });

  test('mocks API response for product images', async ({ page }) => {
    // Mock image API to prevent 404s
    await page.route('**/api/images/**', async (route) => {
      const json = [{ url: '/images/placeholder.jpg', id: 1 }];
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json',
        body: JSON.stringify(json)
      });
    });
    
    await page.goto('https://example.com/products');
    await page.waitForLoadState('networkidle');
    
    // Verify placeholder image is loaded
    const productImage = page.locator('img.product-image');
    await expect(productImage).toBeVisible();
  });
});
```

## 🚀 **Complete Workflow**

```bash
# 1. Start agent (choose "Enable Test Generation")
bun run cli

# 2. Agent explores and generates E2E tests automatically
# 3. Run generated tests
bun run run-tests
# Choose "Run all tests"
```

The generated tests are standard Playwright tests that run with any Playwright command.

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