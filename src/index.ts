import { ExploratoryAgent } from "./agents/exploratory.ts";
import type { AgentConfig } from "./types/index.ts";
import { createLogger, setVerbose } from "./utils/logger.ts";
import { generateReport } from "./utils/report.ts";
import * as clack from "@clack/prompts";

const logger = createLogger("cli");

async function main() {
  clack.intro(`✨ Welcome to the Exploratory Agent CLI ✨`);
  const s = clack.spinner();

  const defaultUrl = "https://with-bugs.practicesoftwaretesting.com";

  const baseUrl = await clack.text({
    message: "Enter the target website URL:",
    placeholder: defaultUrl,
    defaultValue: defaultUrl,
  });

  if (clack.isCancel(baseUrl)) {
    clack.outro("Operation cancelled.");
    process.exit(0);
  }

  // 0. Configuration: Autonomous Mode
  const isAutonomous = await clack.confirm({
    message: "Run in Autonomous Mode? (No user confirmation between steps)",
    initialValue: false,
  });

  if (clack.isCancel(isAutonomous)) {
    clack.outro("Operation cancelled.");
    process.exit(0);
  }

  // 0b. Configuration: Verbose Mode
  const isVerbose = await clack.confirm({
    message: "Enable Verbose Logging? (Show detailed tool outputs)",
    initialValue: false,
  });

  // Set global log level
  setVerbose(isVerbose as boolean);

  const config: AgentConfig = {
    baseUrl: baseUrl as string,
    maxSteps: 10,
  };

  const agent = new ExploratoryAgent(config);

  // Helper function to generate and display report
  const generateAndDisplayReport = async () => {
    try {
      s.start("Generating Report...");
      const reportPath = await generateReport(
        agent.getFindings(),
        agent.getVisitedUrls()
      );
      s.stop("Report Generated");

      clack.log.success(`Report saved to: ${reportPath}`);

      // Feature: See Report in Terminal
      try {
        const reportContent = await Bun.file(reportPath).text();
        console.log("\n"); // Spacing
        clack.note(reportContent, "Report Preview");
      } catch (error) {
        clack.log.error("Could not read report file for preview.");
      }
    } catch (error) {
      logger.error("Failed to generate report:", error);
      clack.log.error("Failed to generate report");
    }
  };

  try {
    s.start("Starting Agent & Browser...");
    await agent.start();
    s.stop("Agent Started");

    let nextGuidance: string | undefined = undefined;
    let running = true; // Keep running flag for normal loop termination

    while (running) {
      // 1. Run Step
      s.start("Agent is thinking & acting...");

      const result = await agent.step(nextGuidance);
      nextGuidance = undefined; // Clear guidance after single use

      s.stop(`Step Complete: ${result.action}`);

      // Helper to wrap text at a specific length to prevent UI breakage
      const wrapText = (str: string, maxWidth: number = 80): string => {
        if (!str) return "";
        const words = str.split(" ");
        if (words.length === 0) return "";

        let lines: string[] = [];
        let currentLine = words[0] || "";

        for (let i = 1; i < words.length; i++) {
          const word = words[i] || "";
          if (currentLine.length + 1 + word.length <= maxWidth) {
            currentLine += " " + word;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        lines.push(currentLine);
        return lines.join("\n");
      };

      if (result.stats) {
        const { currentUrl, queueLength, visitedCount, findingsCount } =
          result.stats;
        clack.note(
          `Current Page: ${currentUrl}
Queue Size:   ${queueLength} items pending
Discovered:   ${visitedCount} pages visited
Issues Found: ${findingsCount}

Action:
${wrapText(result.action, 80)}

Reason:
${wrapText(result.reason, 80)}`,
          "Agent Progress"
        );
      } else {
        clack.note(
          `Reason:
${wrapText(result.reason, 80)}

Action:
${wrapText(result.action, 80)}`,
          "Agent Status"
        );
      }

      if (result.completed) {
        clack.log.success("Agent has decided to finish exploration.");
        running = false;
        break;
      }

      if (isAutonomous) {
        // In autonomous mode, check if we should still be running
        if (!running) break;

        // Small delay to make output readable and allow I/O events (like keypress) to process
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // 2. Human-in-the-loop
      const answer = await clack.select({
        message: "What should the agent do next?",
        options: [
          { value: "continue", label: "Continue Exploration" },
          { value: "guidance", label: "Give Guidance/Feedback" },
          { value: "stop", label: "Stop & Report" },
        ],
      });

      if (clack.isCancel(answer)) {
        running = false;
        break;
      }

      if (answer === "stop") {
        running = false;
      } else if (answer === "guidance") {
        const userGuidance = await clack.text({
          message: "Enter your guidance for the next step:",
          placeholder:
            "e.g., 'Click on the login button' or 'Check the cart page'",
        });

        if (clack.isCancel(userGuidance)) {
          // Treat cancel as generic continue
          continue;
        }

        if (typeof userGuidance === "string") {
          nextGuidance = userGuidance;
          clack.log.info(`Guidance recorded: "${nextGuidance}"`);
        }
      }
    }

    // Generate Report (normal flow)
    await generateAndDisplayReport();
  } catch (error: any) {
    // Check if this is a user cancellation
    if (error?.name === "AbortError" || error?.message?.includes("cancel")) {
      console.log("\n\n⚠️  User cancelled. Saving report...\n");
    } else {
      s.stop("Agent Failed");
      logger.error("Agent failed:", error);
      clack.log.error(`Critical Error: ${error}`);
    }

    // ALWAYS try to generate report even on error or cancellation
    await generateAndDisplayReport();
  } finally {
    await agent.stop();
    clack.outro("Goodbye! 👋");
  }
}

if (import.meta.main) {
  main();
}
