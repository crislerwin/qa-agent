#!/usr/bin/env bun

// Simple runner for generated Playwright tests
import * as clack from "@clack/prompts";
import { existsSync } from "fs";

console.log("🧪 Playwright Test Runner");

async function main() {
  if (!existsSync("./generated-tests")) {
    clack.log.error("❌ No generated tests found");
    clack.log.info("💡 Run agent first: bun run cli");
    return;
  }

  const choice = await clack.select({
    message: "Run tests:",
    options: [
      { value: "all", label: "🚀 Run all tests" },
      { value: "help", label: "📋 Show commands" }
    ]
  });

  if (choice === "help") {
    showHelp();
    return;
  }

  runAllTests();
}

function showHelp() {
  console.log(`
📚 Playwright Commands:

# Install browsers (one time)
npx playwright install

# Run all generated tests  
npx playwright test generated-tests/

# Run with UI
npx playwright test --ui

# Run headed (show browser)
npx playwright test --headed
`);
}

function runAllTests() {
  console.log("🚀 Running all generated tests...");
  console.log("Command: npx playwright test generated-tests/");
  
  const { spawn } = require("child_process");
  const child = spawn("npx", ["playwright", "test", "generated-tests/"], {
    stdio: "inherit"
  });
  
  child.on("close", (code: any) => {
    if (code !== 0) {
      clack.log.error(`❌ Tests failed (exit code: ${code})`);
      process.exit(code);
    } else {
      clack.log.success("✅ All tests passed!");
    }
  });
}

if (import.meta.main) {
  main();
}