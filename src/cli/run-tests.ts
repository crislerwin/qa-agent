#!/usr/bin/env bun

// Simple helper script to run generated E2E tests
import * as clack from "@clack/prompts";
import { existsSync } from "fs";

console.log("🧪 Playwright Test Runner");
console.log("=".repeat(40));

async function main() {
  // Check if generated-tests directory exists
  if (!existsSync("./generated-tests")) {
    clack.log.error("❌ No 'generated-tests' directory found.");
    clack.log.info("💡 Run the agent first to generate some tests!");
    process.exit(1);
  }

  const action = await clack.select({
    message: "What would you like to do?",
    options: [
      { value: "all", label: "Run all generated tests" },
      { value: "select", label: "Choose specific test directory" },
      { value: "help", label: "Show help/commands" }
    ]
  });

  if (action === "help") {
    showHelp();
    return;
  }

  if (action === "all") {
    console.log("🚀 Running all generated E2E tests...");
    console.log("Command: npx playwright test generated-tests/");
    
    const { spawn } = require("child_process");
    const child = spawn("npx", ["playwright", "test", "generated-tests/"], {
      stdio: "inherit"
    });
    
    child.on("close", (code: number) => {
      if (code !== 0) {
        clack.log.error(`❌ Tests failed with exit code: ${code}`);
        process.exit(code);
      } else {
        clack.log.success("✅ All tests passed!");
      }
    });
    
    return;
  }

  if (action === "select") {
    console.log("📁 Available test directories:");
    console.log("  - broken-images");
    console.log("  - console-errors");
    console.log("  - network-errors");
    console.log("  - functional");
    
    const directory = await clack.text({
      message: "Enter directory name:",
      placeholder: "broken-images"
    });
    
    if (clack.isCancel(directory)) {
      return;
    }
    
    console.log(`🚀 Running tests in: generated-tests/${directory}`);
    console.log(`Command: npx playwright test "generated-tests/${directory}/"`);
    
    const { spawn } = require("child_process");
    const child = spawn("npx", ["playwright", "test", `generated-tests/${directory}/`], {
      stdio: "inherit"
    });
    
    child.on("close", (code: number) => {
      if (code !== 0) {
        clack.log.error(`❌ Tests failed with exit code: ${code}`);
        process.exit(code);
      } else {
        clack.log.success("✅ Tests passed!");
      }
    });
  }
}

function showHelp() {
  console.log(`
📚 Playwright Test Commands:

# Install Playwright browsers (one-time setup)
npx playwright install

# Run all tests
npx playwright test generated-tests/

# Run specific test file
npx playwright test path/to/test.spec.ts

# Run with browser UI
npx playwright test --ui

# Run in headed mode (show browser)
npx playwright test --headed

# Run on specific browser
npx playwright test --browser=chromium
npx playwright test --browser=firefox
npx playwright test --browser=webkit

# Run tests in parallel
npx playwright test --workers=4

# Debug mode
npx playwright test --debug

# Watch mode for development
npx playwright test --watch
`);
}

if (import.meta.main) {
  main();
}