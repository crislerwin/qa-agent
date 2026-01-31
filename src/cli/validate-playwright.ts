#!/usr/bin/env bun

// Quick validation that test generation produces correct Playwright format
import { TestGenerator } from "../services/test-generator.ts";
import { getDefaultModel } from "../services/llm.ts";

const model = getDefaultModel();

const simpleFindings = [
  {
    type: "broken_image" as const,
    description: "Missing logo image on homepage",
    url: "https://example.com",
    selector: "img.logo",
    severity: "high" as const
  }
];

const testConfig = {
  outputDir: "./validation-tests",
  includeE2E: true
};

console.log("🔍 Validating Playwright Test Generation");
console.log("=".repeat(40));

async function validateGeneration() {
  try {
    const testGenerator = new TestGenerator(model, testConfig);
    
    console.log("📝 Creating mock LLM response for validation...");
    
    // Mock LLM response to test parsing logic without API call
    const mockResponse = `import { test, expect } from '@playwright/test';

test.describe('Homepage Tests', () => {
  test('should have working logo image', async ({ page }) => {
    await page.goto('https://example.com');
    
    const logo = page.locator('img.logo');
    await expect(logo).toBeVisible();
    
    const src = await logo.getAttribute('src');
    expect(src).toBeTruthy();
  });
});`;

    // Test parsing logic directly
    const testBlocks = testGenerator['extractTestBlocks'](mockResponse);
    console.log(`✅ Extracted ${testBlocks.length} test block(s)`);
    
    if (testBlocks.length > 0) {
      const tests = testGenerator['parseTestResponse'](mockResponse, 'broken-images');
      console.log(`✅ Generated ${tests.length} test(s)`);
      
      tests.forEach((test, index) => {
        console.log(`\n📄 Test ${index + 1}:`);
        console.log(`   Name: ${test.name}`);
        console.log(`   Type: ${test.testType}`);
        console.log(`   File: ${test.filePath}`);
        
        // Validate the content is Playwright format
        if (test.content.includes('@playwright/test')) {
          console.log(`   ✅ Uses Playwright imports`);
        } else {
          console.log(`   ❌ Missing Playwright imports`);
        }
        
        if (test.content.includes('test.describe')) {
          console.log(`   ✅ Uses Playwright test.describe`);
        } else {
          console.log(`   ❌ Missing Playwright test.describe`);
        }
        
        if (test.content.includes('({ page })')) {
          console.log(`   ✅ Uses Playwright page fixture`);
        } else {
          console.log(`   ❌ Missing Playwright page fixture`);
        }
      });
    }
    
  } catch (error) {
    console.error("❌ Validation failed:", error);
  }
}

validateGeneration();