/**
 * Task automation agent example
 * Demonstrates Google Calendar/Meet scheduling
 */

import { createTaskAgent } from "../src/agents/index.ts";
import { ModelPresets } from "../src/config/models.ts";

async function main() {
    console.log("Task Automation Agent Example\n");

    const agent = createTaskAgent({
        model: ModelPresets.free(),
    });

    // Schedule a meeting
    const response = await agent.invoke({
        messages: [
            {
                role: "user",
                content: `Schedule a team meeting for tomorrow at 2 PM.
                Title: "Sprint Planning"
                Duration: 60 minutes
                Attendees: team@example.com, manager@example.com`,
            },
        ],
    });

    console.log("Agent Response:", response);

    // Check availability
    const availability = await agent.invoke({
        messages: [
            {
                role: "user",
                content: "What meetings do I have coming up?",
            },
        ],
    });

    console.log("\nUpcoming Meetings:", availability);
}

main().catch(console.error);
