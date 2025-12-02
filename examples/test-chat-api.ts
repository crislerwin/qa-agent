/**
 * Test the updated chat API with conversation history and locale support
 */

const API_BASE_URL = "http://localhost:3000";

// Generate a unique conversation ID for this test
const conversationId = `test-conversation-${Date.now()}`;

/**
 * Response types
 */
interface ChatResponse {
    response: string;
    conversation_id: string;
    locale: string;
    model: string;
    timestamp: string;
}

interface HistoryResponse {
    conversation_id: string;
    conversation: {
        id: number;
        conversation_id: string;
        user_id: string | null;
        locale: string;
        model: string | null;
        message_count: number;
        created_at: string;
        updated_at: string;
    } | null;
    message_count: number;
    messages: Array<{
        role: string;
        content: string;
        created_at: string;
    }>;
}

interface ClearResponse {
    success: boolean;
    conversation_id: string;
    message: string;
    timestamp: string;
}

/**
 * Helper function to make API calls
 */
async function chatRequest(
    message: string,
    locale: "pt" | "en" = "en",
    model?: string,
): Promise<ChatResponse> {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
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
async function getHistory(): Promise<HistoryResponse> {
    const response = await fetch(
        `${API_BASE_URL}/api/chat/history/${conversationId}`,
    );

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Clear conversation history
 */
async function clearHistory(): Promise<ClearResponse> {
    const response = await fetch(
        `${API_BASE_URL}/api/chat/history/${conversationId}`,
        { method: "DELETE" },
    );

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Main test function
 */
async function main(): Promise<void> {
    console.log("🧪 Testing Chat API with Conversation History\n");
    console.log(`Conversation ID: ${conversationId}\n`);
    console.log("=".repeat(60));

    try {
        // Test 1: First message in English
        console.log("\n📝 Test 1: First message (English)");
        const response1 = await chatRequest(
            "Hello! My name is Alice.",
            "en",
            "free",
        );
        console.log("User:", "Hello! My name is Alice.");
        console.log("Assistant:", response1.response);

        // Test 2: Second message - should remember context
        console.log("\n📝 Test 2: Second message (should remember name)");
        const response2 = await chatRequest("What's my name?", "en", "free");
        console.log("User:", "What's my name?");
        console.log("Assistant:", response2.response);

        // Test 3: Get conversation history
        console.log("\n📝 Test 3: Get conversation history");
        const history = await getHistory();
        console.log(`Message Count: ${history.message_count}`);
        console.log("Messages:");
        history.messages.forEach((msg, index) => {
            const preview = msg.content.substring(0, 100);
            const suffix = msg.content.length > 100 ? "..." : "";
            console.log(`  ${index + 1}. [${msg.role}]: ${preview}${suffix}`);
        });

        // Test 4: Portuguese conversation
        console.log("\n📝 Test 4: Switch to Portuguese");
        const response3 = await chatRequest(
            "Qual é a capital do Brasil?",
            "pt",
            "free",
        );
        console.log("User:", "Qual é a capital do Brasil?");
        console.log("Assistant:", response3.response);

        // Test 5: Continue in Portuguese
        console.log(
            "\n📝 Test 5: Continue in Portuguese (should remember context)",
        );
        const response4 = await chatRequest(
            "E qual é a população dessa cidade?",
            "pt",
            "free",
        );
        console.log("User:", "E qual é a população dessa cidade?");
        console.log("Assistant:", response4.response);

        // Test 6: Get updated history
        console.log("\n📝 Test 6: Get updated conversation history");
        const history2 = await getHistory();
        console.log(`Total Messages: ${history2.message_count}`);

        // Test 7: Clear history
        console.log("\n📝 Test 7: Clear conversation history");
        const clearResult = await clearHistory();
        console.log("Result:", clearResult.message);

        // Test 8: Verify history is cleared
        console.log("\n📝 Test 8: Verify history is cleared");
        const history3 = await getHistory();
        console.log(`Message Count after clear: ${history3.message_count}`);

        console.log("\n" + "=".repeat(60));
        console.log("✅ All tests completed successfully!");
    } catch (error) {
        console.error("\n❌ Test failed:", error);
        process.exit(1);
    }
}

// Run tests
main();
