import { ExploratoryAgent, type AgentConfig } from "./core.ts";
import { createLogger } from "../utils/logger.ts";
import { generateReport } from "./utils/report.ts";
import * as clack from "@clack/prompts";

const logger = createLogger("agent:cli");

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

  const config: AgentConfig = {
    baseUrl: baseUrl as string,
    maxSteps: 10,
  };

  const agent = new ExploratoryAgent(config);

  try {
    s.start("Starting Agent & Browser...");
    await agent.start();
    s.stop("Agent Started");

    let running = true;
    let nextGuidance: string | undefined = undefined;

    while (running) {
      // 1. Run Step
      s.start("Agent is thinking & acting...");

      const result = await agent.step(nextGuidance);
      nextGuidance = undefined; // Clear guidance after single use

      s.stop(`Step Complete: ${result.action}`);

      clack.note(
        `Reason: ${result.reason}\nAction: ${result.action}`,
        "Agent Status"
      );

      if (result.completed) {
        clack.log.success("Agent has decided to finish exploration.");
        running = false;
        break;
      }

      if (isAutonomous) {
        // In autonomous mode, we automatically continue.
        // We might want a small delay so the user can see what's happening or Ctrl+C if needed.
        await new Promise((resolve) => setTimeout(resolve, 2000));
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

    // Generate Report
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
    s.stop("Agent Failed");
    logger.error("Agent failed:", error);
    clack.log.error(`Critical Error: ${error}`);
  } finally {
    await agent.stop();
    clack.outro("Goodbye! 👋");
  }
}

if (import.meta.main) {
  main();
}
