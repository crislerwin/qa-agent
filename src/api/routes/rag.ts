import { Elysia, t } from "elysia";
import { createDocuments } from "../../tools/rag-pgvector.ts";
import { clusterSemanticChunking } from "../../utils/chunking.ts";
import { createRAGAgent } from "../../factory/agents.ts";
import { ModelPresets, getDefaultModel } from "../../config/models.ts";
import { getRAGInstance } from "../shared-instances.ts";
import { RAG_CHAT_SYSTEM_PROMPTS } from "../../prompts/index.ts";
import { RedisChatMessageHistory } from "../../memory/redis.ts";
import { ConversationDB } from "../../services/conversation-db.ts";

/**
 * Message request type for RAG chat
 */
type RAGMessageRequest = {
    message: string;
    conversation_id: string;
    locale: "pt" | "en";
    model?: string;
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
 * Initialize conversation database
 */
const conversationDB = new ConversationDB();

/**
 * RAG routes for knowledge base operations
 */
export const ragRoutes = new Elysia({ prefix: "/api/rag" })
    /**
     * Add documents to knowledge base
     */
    .post(
        "/documents",
        async ({ body }) => {
            const { documents } = body;
            const rag = getRAGInstance();

            const allDocs = [];
            for (const doc of documents) {
                const chunks = await clusterSemanticChunking(
                    doc.content,
                    rag.getEmbeddings(),
                );
                const chunkDocs = createDocuments(
                    chunks,
                    Array(chunks.length).fill(doc.metadata || {}),
                );
                allDocs.push(...chunkDocs);
            }

            await rag.addDocuments(allDocs);

            return {
                success: true,
                count: documents.length,
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                documents: t.Array(
                    t.Object({
                        content: t.String({ minLength: 1 }),
                        metadata: t.Optional(t.Record(t.String(), t.Unknown())),
                    }),
                ),
            }),
        },
    )
    /**
     * Search knowledge base
     */
    .post(
        "/search",
        async ({ body }) => {
            const { query, topK } = body;
            const rag = getRAGInstance();

            const results = await rag.search(query, topK);

            return {
                results: results.map((doc) => ({
                    content: doc.pageContent,
                    metadata: doc.metadata,
                })),
                count: results.length,
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                query: t.String({ minLength: 1 }),
                topK: t.Optional(t.Number({ minimum: 1, maximum: 20 })),
            }),
        },
    )
    /**
     * Chat with RAG agent with conversation history
     */
    .post(
        "/chat",
        async ({ body }) => {
            const { message, conversation_id, locale, model } =
                body as RAGMessageRequest;
            const rag = getRAGInstance();

            // Create Redis chat history for this conversation
            const chatHistory = new RedisChatMessageHistory(
                conversation_id,
                {},
                3600, // 1 hour TTL
            );

            try {
                // Create or update conversation in database
                await conversationDB.upsertConversation(
                    conversation_id,
                    locale,
                    model,
                );

                // Get conversation history
                const previousMessages = await chatHistory.getMessages();

                // Create agent with specified or default model
                const agentModel = getModelFromString(model);
                const agent = createRAGAgent(rag, {
                    model: agentModel,
                    systemPrompt: RAG_CHAT_SYSTEM_PROMPTS[locale],
                });

                // Build messages array with history
                const messages = [
                    {
                        role: "system" as const,
                        content: RAG_CHAT_SYSTEM_PROMPTS[locale],
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

                // Save messages to Redis history
                await chatHistory.addUserMessage(message);
                await chatHistory.addAIMessage(String(responseContent));

                // Save messages to database
                await conversationDB.addMessage(
                    conversation_id,
                    "user",
                    message,
                );
                await conversationDB.addMessage(
                    conversation_id,
                    "assistant",
                    String(responseContent),
                );

                return {
                    response: responseContent,
                    conversation_id,
                    locale,
                    model: model || "default",
                    timestamp: new Date().toISOString(),
                };
            } catch (error) {
                console.error("RAG chat error:", error);
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
     * Clear knowledge base
     */
    .delete("/documents", async () => {
        const rag = getRAGInstance();
        await rag.clear();

        return {
            success: true,
            message: "Knowledge base cleared",
            timestamp: new Date().toISOString(),
        };
    });
