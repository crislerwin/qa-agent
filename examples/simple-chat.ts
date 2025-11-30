/**
 * Simple conversational agent example
 * No tools, just basic chat
 */

import { simpleAgent } from "../src/agents/index.ts";

async function main() {
    console.log("Simple Chat Agent Example\n");

    const response = await simpleAgent.invoke({
        messages: [
            { role: "user", content: "Hello! Can you tell me a fun fact about TypeScript?" },
        ],
    });

    console.log("Agent:", response);
}

main().catch(console.error);
