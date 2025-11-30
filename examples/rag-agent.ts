/**
 * RAG (Retrieval-Augmented Generation) agent example
 * Demonstrates knowledge base creation and querying
 */

import { PGVectorRAG, createRAGAgent } from "../src/agents/index.ts";
import { ModelPresets } from "../src/config/models.ts";

async function main() {
    console.log("RAG Agent Example\n");

    // Initialize PGVector RAG
    const rag = new PGVectorRAG({
        // Uses DATABASE_URL from .env or defaults to localhost
    });

    // Create RAG-enabled agent
    const agent = createRAGAgent(rag, {
        model: ModelPresets.free(),
    });

    // First, add some knowledge
    console.log("Adding knowledge to the database...\n");
    await agent.invoke({
        messages: [
            {
                role: "user",
                content: `Add this to the knowledge base:
                TypeScript is a strongly typed programming language that builds on JavaScript.
                It was developed and is maintained by Microsoft. TypeScript adds optional static
                typing to JavaScript, which can help catch errors early in development.`,
            },
        ],
    });

    console.log("Knowledge added!\n");

    // Then, query the knowledge
    console.log("Querying the knowledge base...\n");
    const response = await agent.invoke({
        messages: [
            {
                role: "user",
                content: "What do you know about TypeScript? Search the knowledge base.",
            },
        ],
    });

    console.log("Agent Response:", response);
}

main().catch(console.error);
