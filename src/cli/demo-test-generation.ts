#!/usr/bin/env bun

// Demo script to showcase test writing capability
import { TestGenerator } from "../services/test-generator.ts";
import { getDefaultModel } from "../services/llm.ts";
import type { AgentFinding, AgentState } from "../types/index.ts";

const model = getDefaultModel();

// Sample findings to demonstrate test generation
const sampleFindings: AgentFinding[] = [
  {
    type: "broken_image",
    description: "Product page has missing logo image",
    url: "https://example.com/products/1",
    selector: "img.logo",
    severity: "high",
    metadata: { reason: "Missing src attribute" }
  },
  {
    type: "console_error",
    description: "JavaScript error on checkout page",
    url: "https://example.com/checkout",
    severity: "critical",
    metadata: { error: "TypeError: Cannot read property 'value' of null" }
  },
  {
    type: "validation_error",
    description: "Email field accepts invalid email addresses",
    url: "https://example.com/register",
    selector: "input[type='email']",
    severity: "medium"
  }
];

const sampleState: AgentState = {
  visitedUrls: new Set(["https://example.com/products/1", "https://example.com/checkout", "https://example.com/register"]),
  findings: sampleFindings,
  steps: 25,
  history: [],
  todoQueue: []
};

const testConfig = {
  outputDir: "./demo-tests",
  includeE2E: true
};

console.log("🚀 Test Writing Capability Demo");
console.log("=".repeat(40));

async function runDemo() {
  console.log("Initializing test generator...");
  const testGenerator = new TestGenerator(model, testConfig);
  
  console.log("Generating tests from sample findings...");
  const tests = await testGenerator.generateTestsFromFindings(
    sampleFindings,
    sampleState,
    "https://example.com"
  );
  
  console.log(`\n✅ Generated ${tests.length} tests:`);
  console.log("-".repeat(30));
  
  tests.forEach((test, index) => {
    console.log(`${index + 1}. ${test.name}`);
    console.log(`   Type: ${test.testType}`);
    console.log(`   Priority: ${test.priority}`);
    console.log(`   File: ${test.filePath}`);
    console.log(`   Description: ${test.description}`);
    console.log();
  });
  
  // Show a sample of generated test content
  if (tests.length > 0) {
    console.log("📄 Sample Generated Test:");
    console.log("-".repeat(30));
    console.log((tests[0]?.content || "").substring(0, 500) + "...");
  }
}

runDemo().catch(console.error);