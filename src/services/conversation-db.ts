import { eq, desc, sql, and, lt } from "drizzle-orm";
import { getDb, conversations, messages } from "../db/client";
import type {
    Conversation,
    Message,
    InsertConversation,
    InsertMessage,
} from "../db/client";

/**
 * Database service for managing conversations and messages
 */
export class ConversationDB {
    private db: ReturnType<typeof getDb>;

    constructor(connectionString?: string) {
        // For now, we'll use the singleton db instance
        // If custom connection string is needed, we could create a new instance
        this.db = getDb();

        if (connectionString) {
            console.warn(
                "Custom connection string provided but using singleton db instance. Consider refactoring if multiple connections are needed.",
            );
        }
    }

    /**
     * Create or update a conversation
     */
    async upsertConversation(
        conversationId: string,
        locale: string,
        model?: string,
        userId?: string,
    ): Promise<Conversation> {
        const [result] = await this.db
            .insert(conversations)
            .values({
                conversationId,
                userId,
                locale,
                model,
                messageCount: 0,
            })
            .onConflictDoUpdate({
                target: conversations.conversationId,
                set: {
                    updatedAt: sql`NOW()`,
                    model: sql`COALESCE(${model}, ${conversations.model})`,
                    locale,
                },
            })
            .returning();

        return result!;
    }

    /**
     * Get a conversation by ID
     */
    async getConversation(
        conversationId: string,
    ): Promise<Conversation | null> {
        const [result] = await this.db
            .select()
            .from(conversations)
            .where(eq(conversations.conversationId, conversationId))
            .limit(1);

        return result || null;
    }

    /**
     * Get conversations by user ID
     */
    async getConversationsByUser(userId: string): Promise<Conversation[]> {
        return this.db
            .select()
            .from(conversations)
            .where(eq(conversations.userId, userId))
            .orderBy(desc(conversations.updatedAt));
    }

    /**
     * Add a message to a conversation
     */
    async addMessage(
        conversationId: string,
        role: "user" | "assistant" | "system",
        content: string,
        metadata?: Record<string, any>,
    ): Promise<Message> {
        return this.db.transaction(async (tx) => {
            // Insert message
            const [message] = await tx
                .insert(messages)
                .values({
                    conversationId,
                    role,
                    content,
                    metadata: metadata || {},
                })
                .returning();

            // Update message count and updated_at
            await tx
                .update(conversations)
                .set({
                    messageCount: sql`${conversations.messageCount} + 1`,
                    updatedAt: sql`NOW()`,
                })
                .where(eq(conversations.conversationId, conversationId));

            return message!;
        });
    }

    /**
     * Get messages for a conversation
     */
    async getMessages(
        conversationId: string,
        limit?: number,
    ): Promise<Message[]> {
        const query = this.db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(messages.createdAt);

        if (limit) {
            return query.limit(limit);
        }

        return query;
    }

    /**
     * Get recent messages for a conversation
     */
    async getRecentMessages(
        conversationId: string,
        count: number,
    ): Promise<Message[]> {
        const results = await this.db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(desc(messages.createdAt))
            .limit(count);

        // Reverse to get chronological order
        return results.reverse();
    }

    /**
     * Delete a conversation and all its messages
     */
    async deleteConversation(conversationId: string): Promise<void> {
        await this.db
            .delete(conversations)
            .where(eq(conversations.conversationId, conversationId));
    }

    /**
     * Delete old conversations (older than specified days)
     */
    async deleteOldConversations(daysOld: number): Promise<number> {
        const result = await this.db
            .delete(conversations)
            .where(
                lt(
                    conversations.updatedAt,
                    sql`NOW() - INTERVAL '${sql.raw(daysOld.toString())} days'`,
                ),
            );

        return result.length || 0;
    }

    /**
     * Get conversation count by user
     */
    async getConversationCount(userId?: string): Promise<number> {
        if (userId) {
            const result = await this.db
                .select({ count: sql<number>`count(*)` })
                .from(conversations)
                .where(eq(conversations.userId, userId));

            return Number(result[0]?.count || 0);
        }

        const result = await this.db
            .select({ count: sql<number>`count(*)` })
            .from(conversations);

        return Number(result[0]?.count || 0);
    }

    /**
     * Get message count for a conversation
     */
    async getMessageCount(conversationId: string): Promise<number> {
        const [result] = await this.db
            .select({ messageCount: conversations.messageCount })
            .from(conversations)
            .where(eq(conversations.conversationId, conversationId))
            .limit(1);

        return result?.messageCount || 0;
    }

    /**
     * Close database connection
     * Note: With the singleton pattern, this might not be needed
     * but keeping for API compatibility
     */
    async close(): Promise<void> {
        // With postgres-js and singleton pattern, connection management
        // is handled automatically. This is a no-op for compatibility.
        console.log("Close called on ConversationDB (no-op with singleton db)");
    }
}

// Re-export types for convenience
export type { Conversation, Message };
