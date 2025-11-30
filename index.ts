/**
 * AI Agents Boilerplate
 * Quick start example - see /examples for more
 */

import { simpleAgent } from "./src/agents/index.ts";

async function main() {
    console.log("🤖 AI Agents Boilerplate\n");

    const response = await simpleAgent.invoke({
        messages: [
            {
                role: "user",
                content: "Hello! Tell me a fun fact about AI agents.",
            },
        ],
    });

    console.log("Agent:", response.messages);
    console.log("\n✓ Check the /examples folder for more use cases!");
}

main().catch(console.error);
