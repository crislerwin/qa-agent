/**
 * Test the RAG chat API with conversation history and locale support
 */

const API_BASE_URL = "http://localhost:3000";

// Generate a unique conversation ID for this test
const conversationId = `rag-test-${Date.now()}`;

/**
 * Add documents to knowledge base
 */
async function addDocuments() {
    const response = await fetch(`${API_BASE_URL}/api/rag/documents`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            documents: [
                {
                    content:
                        "AgentForge is a modular, production-ready boilerplate for building AI agents with LangChain and LangGraph.",
                    metadata: { source: "readme", topic: "overview" },
                },
                {
                    content:
                        "The framework supports multiple agent types including conversational agents, web-enabled agents, and RAG-powered agents.",
                    metadata: { source: "readme", topic: "features" },
                },
                {
                    content:
                        "AgentForge includes built-in support for PostgreSQL with pgvector for RAG and Redis for chat memory.",
                    metadata: { source: "readme", topic: "databases" },
                },
                {
                    content:
                        "You can use free AI models like Gemini Flash via OpenRouter or Google AI Studio.",
                    metadata: { source: "readme", topic: "models" },
                },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Helper function to make RAG chat requests
 */
async function ragChatRequest(
    message: string,
    locale: "pt" | "en" = "en",
    model?: string
) {
    const response = await fetch(`${API_BASE_URL}/api/rag/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message,
            conversation_id: conversationId,
            locale,
            model,
        }),
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Get conversation history
 */
async function getHistory() {
    const response = await fetch(
        `${API_BASE_URL}/api/chat/history/${conversationId}`
    );

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Clear conversation history
 */
async function clearHistory() {
    const response = await fetch(
        `${API_BASE_URL}/api/chat/history/${conversationId}`,
        { method: "DELETE" }
    );

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Main test function
 */
async function main() {
    console.log("🧪 Testing RAG Chat API with Conversation History\n");
    console.log(`Conversation ID: ${conversationId}\n`);
    console.log("=".repeat(60));

    try {
        // Test 1: Add documents to knowledge base
        console.log("\n📝 Test 1: Adding documents to knowledge base");
        const addResult = await addDocuments();
        console.log(`Added ${addResult.count} documents to knowledge base`);

        // Wait a moment for indexing
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Test 2: First RAG question in English
        console.log("\n📝 Test 2: First RAG question (English)");
        const response1 = await ragChatRequest(
            "What is AgentForge?",
            "en",
            "free"
        );
        console.log("User:", "What is AgentForge?");
        console.log("Assistant:", response1.response.substring(0, 200) + "...");

        // Test 3: Follow-up question - should remember context
        console.log("\n📝 Test 3: Follow-up question (should remember context)");
        const response2 = await ragChatRequest(
            "What databases does it support?",
            "en",
            "free"
        );
        console.log("User:", "What databases does it support?");
        console.log("Assistant:", response2.response.substring(0, 200) + "...");

        // Test 4: Switch to Portuguese
        console.log("\n📝 Test 4: Switch to Portuguese");
        const response3 = await ragChatRequest(
            "Quais tipos de agentes são suportados?",
            "pt",
            "free"
        );
        console.log("User:", "Quais tipos de agentes são suportados?");
        console.log("Assistant:", response3.response.substring(0, 200) + "...");

        // Test 5: Continue in Portuguese
        console.log("\n📝 Test 5: Continue in Portuguese (should remember context)");
        const response4 = await ragChatRequest(
            "E quais modelos de IA posso usar?",
            "pt",
            "free"
        );
        console.log("User:", "E quais modelos de IA posso usar?");
        console.log("Assistant:", response4.response.substring(0, 200) + "...");

        // Test 6: Get conversation history
        console.log("\n📝 Test 6: Get conversation history");
        const history = await getHistory();
        console.log(`Total Messages: ${history.message_count}`);
        console.log("Conversation Details:");
        console.log(`  - Locale: ${history.conversation?.locale}`);
        console.log(`  - Model: ${history.conversation?.model}`);
        console.log(`  - Created: ${history.conversation?.created_at}`);
        console.log(`  - Updated: ${history.conversation?.updated_at}`);

        // Test 7: Display message history
        console.log("\n📝 Test 7: Message History:");
        history.messages.forEach((msg: any, index: number) => {
            const preview = msg.content.substring(0, 60);
            console.log(
                `  ${index + 1}. [${msg.role}]: ${preview}${msg.content.length > 60 ? "..." : ""}`
            );
        });

        // Test 8: Clear history
        console.log("\n📝 Test 8: Clear conversation history");
        const clearResult = await clearHistory();
        console.log("Result:", clearResult.message);

        // Test 9: Verify history is cleared
        console.log("\n📝 Test 9: Verify history is cleared");
        const history2 = await getHistory();
        console.log(`Message Count after clear: ${history2.message_count}`);

        console.log("\n" + "=".repeat(60));
        console.log("✅ All RAG chat tests completed successfully!");
        console.log("\nNote: Don't forget to clear the knowledge base if needed:");
        console.log("curl -X DELETE http://localhost:3000/api/rag/documents");
    } catch (error) {
        console.error("\n❌ Test failed:", error);
        process.exit(1);
    }
}

// Run tests
main();
