import { Elysia, t } from "elysia";
import {
    createConversationalAgent,
    createWebAgent,
} from "../../factory/agents.ts";
import { getDefaultModel, ModelPresets } from "../../config/models.ts";
import { RedisChatMessageHistory } from "../../memory/redis.ts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

/**
 * Message request type
 */
type MessageRequest = {
    message: string;
    conversation_id: string;
    locale: "pt" | "en";
    model?: string;
};

/**
 * System prompts by locale
 */
const SYSTEM_PROMPTS = {
    pt: "Você é um assistente útil e prestativo. Responda sempre em português do Brasil.",
    en: "You are a helpful and friendly assistant. Always respond in English.",
};

/**
 * Get model based on model string
 */
function getModelFromString(model?: string) {
    if (!model) return getDefaultModel();

    switch (model) {
        case "free":
            return ModelPresets.free();
        case "balanced":
            return ModelPresets.balanced();
        case "powerful":
            return ModelPresets.powerful();
        default:
            return getDefaultModel();
    }
}

/**
 * Chat routes for conversational agents
 */
export const chatRoutes = new Elysia({ prefix: "/api/chat" })
    /**
     * Simple chat endpoint with conversation history
     */
    .post(
        "/",
        async ({ body }) => {
            const { message, conversation_id, locale, model } =
                body as MessageRequest;

            // Create Redis chat history for this conversation
            const chatHistory = new RedisChatMessageHistory(
                conversation_id,
                {},
                3600, // 1 hour TTL
            );

            try {
                // Get conversation history
                const previousMessages = await chatHistory.getMessages();

                // Create agent with specified or default model
                const agentModel = getModelFromString(model);
                const agent = createConversationalAgent({ model: agentModel });

                // Build messages array with history
                const messages = [
                    {
                        role: "system" as const,
                        content: SYSTEM_PROMPTS[locale],
                    },
                    ...previousMessages.map((msg) => ({
                        role:
                            msg._getType() === "human"
                                ? ("user" as const)
                                : ("assistant" as const),
                        content:
                            typeof msg.content === "string"
                                ? msg.content
                                : JSON.stringify(msg.content),
                    })),
                    { role: "user" as const, content: message },
                ];

                // Invoke agent
                const response = await agent.invoke({
                    messages,
                });

                // Extract response content
                const lastMessage =
                    response.messages?.[response.messages.length - 1];
                const responseContent =
                    lastMessage && typeof lastMessage.content === "string"
                        ? lastMessage.content
                        : JSON.stringify(response);

                // Save messages to history
                await chatHistory.addUserMessage(message);
                await chatHistory.addAIMessage(String(responseContent));

                return {
                    response: responseContent,
                    conversation_id,
                    locale,
                    model: model || "default",
                    timestamp: new Date().toISOString(),
                };
            } catch (error) {
                console.error("Chat error:", error);
                throw error;
            }
        },
        {
            body: t.Object({
                message: t.String({ minLength: 1 }),
                conversation_id: t.String({ minLength: 1 }),
                locale: t.Union([t.Literal("pt"), t.Literal("en")]),
                model: t.Optional(t.String()),
            }),
        },
    )
    /**
     * Web-enabled chat endpoint with conversation history
     */
    .post(
        "/web",
        async ({ body }) => {
            const { message, conversation_id, locale, model } =
                body as MessageRequest;

            // Create Redis chat history for this conversation
            const chatHistory = new RedisChatMessageHistory(
                conversation_id,
                {},
                3600, // 1 hour TTL
            );

            try {
                // Get conversation history
                const previousMessages = await chatHistory.getMessages();

                // Create agent with specified or default model
                const agentModel = getModelFromString(model);
                const agent = createWebAgent({ model: agentModel });

                // Build messages array with history
                const messages = [
                    {
                        role: "system" as const,
                        content: SYSTEM_PROMPTS[locale],
                    },
                    ...previousMessages.map((msg) => ({
                        role:
                            msg._getType() === "human"
                                ? ("user" as const)
                                : ("assistant" as const),
                        content:
                            typeof msg.content === "string"
                                ? msg.content
                                : JSON.stringify(msg.content),
                    })),
                    { role: "user" as const, content: message },
                ];

                // Invoke agent
                const response = await agent.invoke({
                    messages,
                });

                // Extract response content
                const lastMessage =
                    response.messages?.[response.messages.length - 1];
                const responseContent =
                    lastMessage && typeof lastMessage.content === "string"
                        ? lastMessage.content
                        : JSON.stringify(response);

                // Save messages to history
                await chatHistory.addUserMessage(message);
                await chatHistory.addAIMessage(String(responseContent));

                return {
                    response: responseContent,
                    conversation_id,
                    locale,
                    model: model || "default",
                    timestamp: new Date().toISOString(),
                };
            } catch (error) {
                console.error("Web chat error:", error);
                throw error;
            }
        },
        {
            body: t.Object({
                message: t.String({ minLength: 1 }),
                conversation_id: t.String({ minLength: 1 }),
                locale: t.Union([t.Literal("pt"), t.Literal("en")]),
                model: t.Optional(t.String()),
            }),
        },
    )
    /**
     * Get conversation history
     */
    .get("/history/:conversation_id", async ({ params }) => {
        const { conversation_id } = params;

        const chatHistory = new RedisChatMessageHistory(conversation_id);

        try {
            const messages = await chatHistory.getMessages();
            const messageCount = await chatHistory.getMessageCount();

            return {
                conversation_id,
                message_count: messageCount,
                messages: messages.map((msg) => ({
                    type: msg._getType(),
                    content:
                        typeof msg.content === "string"
                            ? msg.content
                            : JSON.stringify(msg.content),
                })),
            };
        } catch (error) {
            console.error("Get history error:", error);
            throw error;
        }
    })
    /**
     * Clear conversation history
     */
    .delete("/history/:conversation_id", async ({ params }) => {
        const { conversation_id } = params;

        const chatHistory = new RedisChatMessageHistory(conversation_id);

        try {
            await chatHistory.clear();

            return {
                success: true,
                conversation_id,
                message: "Conversation history cleared",
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            console.error("Clear history error:", error);
            throw error;
        }
    });
