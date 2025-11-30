/**
 * Full-featured agent example
 * Combines all capabilities: web search, RAG, task automation
 */

import { createFullAgent } from "../src/agents/index.ts";
import { PGVectorRAG } from "../src/tools/rag-pgvector.ts";
import { ModelPresets } from "../src/config/models.ts";

async function main() {
    console.log("Full-Featured Agent Example\n");

    // Initialize RAG
    const rag = new PGVectorRAG();

    // Create full agent with all tools
    const agent = createFullAgent(rag, {
        model: ModelPresets.balanced(),
    });

    // Demonstrate combined capabilities
    const response = await agent.invoke({
        messages: [
            {
                role: "user",
                content: `I need you to:
                1. Search the web for the latest TypeScript features
                2. Add what you learn to the knowledge base
                3. Schedule a meeting tomorrow at 3 PM titled "TypeScript Updates" with dev-team@example.com`,
            },
        ],
    });

    console.log("Agent Response:", response);
}

main().catch(console.error);
