import { Elysia, t } from "elysia";
import { createDocuments } from "../../tools/rag-pgvector.ts";
import { clusterSemanticChunking } from "../../utils/chunking.ts";
import { createRAGAgent } from "../../factory/agents.ts";
import { ModelPresets } from "../../config/models.ts";
import { getRAGInstance } from "../shared-instances.ts";
import { RAG_SYSTEM_PROMPT } from "../../prompts";

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
     * Chat with RAG agent
     */
    .post(
        "/chat",
        async ({ body }) => {
            const { message, model } = body;
            const rag = getRAGInstance();

            const agentModel =
                model === "free"
                    ? ModelPresets.free()
                    : model === "balanced"
                      ? ModelPresets.balanced()
                      : ModelPresets.free();

            const agent = createRAGAgent(rag, {
                model: agentModel,
                systemPrompt: RAG_SYSTEM_PROMPT,
            });

            const response = await agent.invoke({
                messages: [{ role: "user", content: message }],
            });

            const messages = response?.messages;
            const lastMessage =
                Array.isArray(messages) && messages.length > 0
                    ? messages[messages.length - 1]
                    : null;

            const content = lastMessage?.content || "No response generated";

            return {
                response: content,
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                message: t.String({ minLength: 1 }),
                model: t.Optional(
                    t.Union([t.Literal("free"), t.Literal("balanced")]),
                ),
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
