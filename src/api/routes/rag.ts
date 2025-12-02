import { Elysia, t } from "elysia";
import { createDocuments } from "../../tools/rag-pgvector.ts";
import { clusterSemanticChunking } from "../../utils/chunking.ts";
import { createRAGAgent } from "../../factory/agents.ts";
import { getDefaultModel } from "../../config/models.ts";
import { getRAGInstance } from "../shared-instances.ts";
import { RAG_CHAT_SYSTEM_PROMPTS } from "../../prompts/index.ts";
import { RedisChatMessageHistory } from "../../memory/redis.ts";
import { ConversationDB } from "../../services/conversation-db.ts";
import { isAIMessage } from "@langchain/core/messages";
import { createLogger } from "../../utils/logger.ts";

const logger = createLogger("rag-routes");

/**
 * Message request type for RAG chat
 */
type RAGMessageRequest = {
  message: string;
  conversation_id: string;
  locale: "pt" | "en";
};

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
          rag.getEmbeddings()
        );
        const chunkDocs = createDocuments(
          chunks,
          Array(chunks.length).fill(doc.metadata || {})
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
          })
        ),
      }),
    }
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
    }
  )
  /**
   * Chat with RAG agent with conversation history
   */
  .post(
    "/chat",
    async ({ body }) => {
      const { message, conversation_id, locale } = body as RAGMessageRequest;
      const rag = getRAGInstance();

      // Create Redis chat history for this conversation
      const chatHistory = new RedisChatMessageHistory(
        conversation_id,
        {},
        3600 // 1 hour TTL
      );

      try {
        // Create or update conversation in database
        await conversationDB.upsertConversation(conversation_id, locale);

        // Get conversation history
        const previousMessages = await chatHistory.getMessages();

        // Create agent with default model from environment
        logger.info("Creating RAG agent with default model...");
        const agent = createRAGAgent(rag, {
          model: getDefaultModel(),
          systemPrompt: RAG_CHAT_SYSTEM_PROMPTS[locale],
        });
        logger.info("RAG agent created successfully");

        // Build messages array with history
        const messages = [
          ...previousMessages.map((msg) => ({
            role: isAIMessage(msg) ? ("assistant" as const) : ("user" as const),
            content:
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content),
          })),
          { role: "user" as const, content: message },
        ];

        // Invoke agent
        logger.info("Invoking RAG agent...");
        const response = await agent.invoke({
          messages,
        });
        logger.info("RAG agent invoked successfully");

        // Extract response content
        const lastMessage = response.messages?.[response.messages.length - 1];
        const responseContent =
          lastMessage && typeof lastMessage.content === "string"
            ? lastMessage.content
            : JSON.stringify(response);

        // Save messages to Redis history
        await chatHistory.addUserMessage(message);
        await chatHistory.addAIMessage(String(responseContent));

        // Save messages to database
        await conversationDB.addMessage(conversation_id, "user", message);
        await conversationDB.addMessage(
          conversation_id,
          "assistant",
          String(responseContent)
        );

        return {
          response: responseContent,
          conversation_id,
          locale,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error("RAG chat error:", error);
        throw error;
      }
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1 }),
        conversation_id: t.String({ minLength: 1 }),
        locale: t.Union([t.Literal("pt"), t.Literal("en")]),
      }),
    }
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
