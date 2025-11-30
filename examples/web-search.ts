/**
 * Web search agent example
 * Demonstrates web search and URL fetching capabilities
 */

import { createWebAgent } from "../src/agents/index.ts";
import { ModelPresets } from "../src/config/models.ts";

async function main() {
    console.log("Web Search Agent Example\n");

    // Create web-enabled agent
    const agent = createWebAgent({
        model: ModelPresets.free(),
    });

    // Search for current information
    const response = await agent.invoke({
        messages: [
            {
                role: "user",
                content: "What are the latest developments in AI? Search the web for recent news.",
            },
        ],
    });

    console.log("Agent Response:", response);
}

main().catch(console.error);
