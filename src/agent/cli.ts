import { ExploratoryAgent, type AgentConfig } from "./core.ts";
import { createLogger } from "../utils/logger.ts";
import { generateReport } from "./utils/report.ts";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const logger = createLogger("agent:cli");

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log("Welcome to the Exploratory Testing Agent!");
  console.log("Target: https://with-bugs.practicesoftwaretesting.com");

  const config: AgentConfig = {
    baseUrl: "https://with-bugs.practicesoftwaretesting.com",
    maxSteps: 10,
  };

  const agent = new ExploratoryAgent(config);

  try {
    await agent.start();
    let running = true;

    while (running) {
      // Run a step
      console.log("\n--- Agent Step ---");
      const result = await agent.step();

      console.log(`\nAction: ${result.action}`);
      console.log(`Reason: ${result.reason}`);

      if (result.completed) {
        console.log("Agent has decided to finish exploration.");
        running = false;
        break;
      }

      // Human-in-the-loop interaction
      // Ask user every 2-3 steps or always? The challenge says "periodically".
      // Let's do it every step for control, or default to "continue".

      // For a smoother demo, maybe just prompt "Press key to continue" or type "stop"?
      // But requirement says "Allow current page summary, proposed next steps, continue/stop/guidance".
      // The agent step() already happened, so we actually see what it DID.
      // Ideally, we should ASK the agent what it WANTS to do, then approve it?
      // My implementation does "Observation -> Think -> Act" in one step().
      // If I want to approve, I should split step() or just review AFTER the action?
      // "Human-in-the-loop mechanism... periodical... asking... to continue... stop... or provide guidance".
      // It doesn't strictly say "approve every action". It says "periodically ask".
      // So asking AFTER an action is fine for "continue exploration".
      // Guidance can be injected into the next prompt?
      // The current `step()` doesn't take input. I should update `step()` to take optional user guidance?
      // I'll update `ExploratoryAgent.step()` signature in next iteration if needed, or simply inject it via state?
      // Actually, I can just not pass it for now, unless I modify core.ts.
      // Let's modify core.ts to accept `additionalContext` in step()!

      const answer = await rl.question(
        "\n[Enter] Continue | [s] Stop | [g] Guidance: "
      );

      if (answer.toLowerCase() === "s") {
        running = false;
      } else if (answer.toLowerCase() === "g") {
        const guidance = await rl.question("Enter guidance for the agent: ");
        // We need to pass this guidance to the agent's next step.
        // Since step() doesn't support it yet, I'll rely on the agent's memory?
        // Or I should patch `step` to accept a string argument.
        // I will modify `src/agent/core.ts` via multi_replace in a moment to accept guidance.
        // For now, I'll assume we can't or I'll implement it shortly.
        console.log(
          "Guidance recorded (Not fully implemented in core yet, will add)."
        );
      }
    }

    // Generate Report
    console.log("\nGenerating Report...");
    const reportPath = await generateReport(agent.getFindings());
    console.log(`Report generated at: ${reportPath}`);
  } catch (error) {
    logger.error("Agent failed:", error);
  } finally {
    await agent.stop();
    rl.close();
  }
}

if (import.meta.main) {
  main();
}
