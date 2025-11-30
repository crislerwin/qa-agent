/**
 * API Client Example
 * Demonstrates how to interact with the API endpoints
 */

const API_BASE_URL = "http://localhost:3000";

/**
 * Example 1: Simple Chat
 */
async function exampleChat() {
    console.log("\n=== Example 1: Simple Chat ===");

    const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: "Tell me a fun fact about TypeScript",
            model: "free",
        }),
    });

    const data = await response.json();
    console.log("Response:", data);
}

/**
 * Example 2: Web Search
 */
async function exampleWebSearch() {
    console.log("\n=== Example 2: Web Search ===");

    const response = await fetch(`${API_BASE_URL}/api/tools/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query: "latest AI news",
            model: "free",
        }),
    });

    const data = await response.json();
    console.log("Response:", data);
}

/**
 * Example 3: RAG - Add and Search
 */
async function exampleRAG() {
    console.log("\n=== Example 3: RAG - Add and Search ===");

    // Add documents
    console.log("\nAdding documents...");
    await fetch(`${API_BASE_URL}/api/rag/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            documents: [
                {
                    content: "Elysia is a fast and friendly web framework for Bun.",
                    metadata: { source: "docs", topic: "elysia" },
                },
                {
                    content: "Bun is a fast all-in-one JavaScript runtime.",
                    metadata: { source: "docs", topic: "bun" },
                },
            ],
        }),
    });

    // Search documents
    console.log("\nSearching knowledge base...");
    const searchResponse = await fetch(`${API_BASE_URL}/api/rag/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query: "What is Elysia?",
            topK: 3,
        }),
    });

    const searchData = await searchResponse.json();
    console.log("Search Results:", searchData);

    // Chat with RAG
    console.log("\nChatting with RAG agent...");
    const chatResponse = await fetch(`${API_BASE_URL}/api/rag/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: "What do you know about Bun and Elysia?",
            model: "free",
        }),
    });

    const chatData = await chatResponse.json();
    console.log("Chat Response:", chatData);
}

/**
 * Example 4: Multi-turn Conversation
 */
async function exampleConversation() {
    console.log("\n=== Example 4: Multi-turn Conversation ===");

    const response = await fetch(`${API_BASE_URL}/api/chat/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            messages: [
                { role: "user", content: "Hi! My name is Alice." },
                { role: "assistant", content: "Hello Alice! Nice to meet you." },
                { role: "user", content: "What's my name?" },
            ],
            model: "free",
        }),
    });

    const data = await response.json();
    console.log("Response:", data);
}

/**
 * Run all examples
 */
async function main() {
    console.log("🚀 API Client Examples");
    console.log("Make sure the API server is running on port 3000");

    try {
        // Check health
        const healthResponse = await fetch(`${API_BASE_URL}/health`);
        const health = await healthResponse.json();
        console.log("\n✓ Server is healthy:", health);

        // Run examples
        await exampleChat();
        await exampleWebSearch();
        await exampleRAG();
        await exampleConversation();

        console.log("\n✓ All examples completed!");
    } catch (error) {
        console.error("\n✗ Error:", error instanceof Error ? error.message : error);
        console.log("\nMake sure to start the API server first:");
        console.log("  bun run examples/api-server.ts");
    }
}

main();
