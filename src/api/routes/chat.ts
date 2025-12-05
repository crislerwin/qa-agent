import { Elysia, t } from "elysia";
import {
  createConversationalAgent,
  createFullAgent,
} from "../../factory/agents.ts";
import { getDefaultModel } from "../../config/models.ts";
import { RedisChatMessageHistory } from "../../memory/redis.ts";
import { ConversationDB } from "../../services/conversation-db.ts";
import { UNIFIED_CHAT_SYSTEM_PROMPTS } from "../../prompts/index.ts";
import { getRAGInstance } from "../shared-instances.ts";
import { isAIMessage } from "@langchain/core/messages";
import { createLogger } from "../../utils/logger.ts";

const logger = createLogger("chat-routes");

/**
 * Message request type
 */
type MessageRequest = {
  message: string;
  conversation_id: string;
  locale: "pt" | "en";
};

/**
 * Initialize conversation database
 */
const conversationDB = new ConversationDB();

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
      const { message, conversation_id, locale } = body as MessageRequest;

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

        // Get RAG instance
        const rag = getRAGInstance();

        // Create agent with default model from environment
        logger.info("Creating full agent with default model...");
        const agent = createFullAgent(rag, {
          model: getDefaultModel(),
          systemPrompt: UNIFIED_CHAT_SYSTEM_PROMPTS[locale],
        });
        logger.info("Full agent created successfully");

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
        logger.info("Invoking agent...");
        const response = await agent.invoke({
          messages,
        });
        logger.info("Agent invoked successfully");

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
        logger.error("Chat error:", error);
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
   * Get conversation history from database
   */
  .get("/history/:conversation_id", async ({ params }) => {
    const { conversation_id } = params;

    try {
      const conversation = await conversationDB.getConversation(
        conversation_id
      );
      const messages = await conversationDB.getMessages(conversation_id);

      return {
        conversation_id,
        conversation,
        message_count: messages.length,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          created_at: msg.created_at,
        })),
      };
    } catch (error) {
      logger.error("Get history error:", error);
      throw error;
    }
  })
  /**
   * Clear conversation history (both Redis and database)
   */
  .delete("/history/:conversation_id", async ({ params }) => {
    const { conversation_id } = params;

    try {
      // Clear from Redis
      const chatHistory = new RedisChatMessageHistory(conversation_id);
      await chatHistory.clear();

      // Clear from database
      await conversationDB.deleteConversation(conversation_id);

      return {
        success: true,
        conversation_id,
        message: "Conversation history cleared from both Redis and database",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Clear history error:", error);
      throw error;
    }
  });
