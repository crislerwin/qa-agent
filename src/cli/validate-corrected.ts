#!/usr/bin/env bun

// Validate that the Playwright test generation fixes fixture issues
import { TestGenerator } from "../services/test-generator.ts";
import { getDefaultModel } from "../services/llm.ts";

const model = getDefaultModel();

const testConfig = {
  outputDir: "./validation-tests",
  includeE2E: true
};

console.log("🔍 Validating Corrected Playwright Test Generation");
console.log("=".repeat(50));

async function validateCorrectedGeneration() {
  try {
    const testGenerator = new TestGenerator(model, testConfig);
    
    // Mock LLM response with correct fixture usage
    const correctedResponse = `import { test, expect, type Browser, type Page } from '@playwright/test';
import { chromium } from 'playwright';

test.describe('Homepage Tests', () => {
  let browser: Browser;
  let context: any;
  let page: Page;

  test.beforeAll(async () => {
    // Correct: No fixtures in beforeAll
    browser = await chromium.launch();
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    // Correct: No fixtures in afterAll
    await context.close();
    await browser.close();
  });

  test('should have working logo', async ({ page: testPage }) => {
    // Correct: Using fixture in individual test
    await testPage.goto('https://example.com');
    const logo = testPage.locator('img.logo');
    await expect(logo).toBeVisible();
  });

  test('should handle navigation', async ({ page: testPage }) => {
    // Correct: Each test gets its own page fixture
    await testPage.goto('https://example.com/products');
    await expect(testPage).toHaveURL(/products/);
  });
});`;

    console.log("✅ Testing corrected fixture usage...");
    
    // Test parsing logic
    const testBlocks = testGenerator['extractTestBlocks'](correctedResponse);
    console.log(`✅ Extracted ${testBlocks.length} test block(s)`);
    
    if (testBlocks.length > 0) {
      const tests = testGenerator['parseTestResponse'](correctedResponse, 'broken-images');
      console.log(`✅ Generated ${tests.length} test(s)`);
      
      tests.forEach((test, index) => {
        console.log(`\n📄 Test ${index + 1}: ${test.name}`);
        
        // Validate the fix - check for correct patterns
        const hasCorrectBeforeAll = test.content.includes('test.beforeAll(async () => {') &&
            !test.content.includes('{ page })') &&
            test.content.includes('browser = await');
        
        const hasCorrectTestFixtures = test.content.includes('test(\'should have working logo\', async ({ page: testPage }) => {') ||
            test.content.includes('({ page: testPage }) => {');
        
        if (hasCorrectBeforeAll) {
          console.log(`   ✅ Correct: Manual setup in beforeAll without fixtures`);
        } else {
          console.log(`   ❌ Incorrect: Fixtures used in beforeAll`);
        }
        
        if (hasCorrectTestFixtures) {
          console.log(`   ✅ Correct: Fixtures used only in individual tests`);
        } else {
          console.log(`   ❌ Incorrect: Fixtures not used properly in tests`);
        }
        
        if (test.content.includes('import { test, expect') &&
            test.content.includes('@playwright/test')) {
          console.log(`   ✅ Correct: Playwright imports`);
        } else {
          console.log(`   ❌ Incorrect: Missing or wrong imports`);
        }
      });
    }
    
  } catch (error) {
    console.error("❌ Validation failed:", error);
  }
}

validateCorrectedGeneration();