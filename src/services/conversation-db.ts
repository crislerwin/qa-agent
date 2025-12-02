import { Pool } from "pg";

/**
 * Conversation data structure
 */
export interface Conversation {
    id: number;
    conversation_id: string;
    user_id?: string;
    locale: string;
    model?: string;
    message_count: number;
    created_at: Date;
    updated_at: Date;
}

/**
 * Message data structure
 */
export interface Message {
    id: number;
    conversation_id: string;
    role: "user" | "assistant" | "system";
    content: string;
    metadata?: Record<string, any>;
    created_at: Date;
}

/**
 * Database service for managing conversations and messages
 */
export class ConversationDB {
    private pool: Pool;

    constructor(connectionString?: string) {
        this.pool = new Pool({
            connectionString:
                connectionString ||
                process.env.DATABASE_URL ||
                "postgresql://postgres:postgres@localhost:5432/agents_db",
        });
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
        const query = `
            INSERT INTO conversations (conversation_id, user_id, locale, model, message_count, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
            ON CONFLICT (conversation_id)
            DO UPDATE SET
                updated_at = NOW(),
                model = COALESCE($4, conversations.model),
                locale = $3
            RETURNING *
        `;

        const result = await this.pool.query(query, [
            conversationId,
            userId,
            locale,
            model,
        ]);
        return result.rows[0];
    }

    /**
     * Get a conversation by ID
     */
    async getConversation(
        conversationId: string,
    ): Promise<Conversation | null> {
        const query = `
            SELECT * FROM conversations
            WHERE conversation_id = $1
        `;

        const result = await this.pool.query(query, [conversationId]);
        return result.rows[0] || null;
    }

    /**
     * Get conversations by user ID
     */
    async getConversationsByUser(userId: string): Promise<Conversation[]> {
        const query = `
            SELECT * FROM conversations
            WHERE user_id = $1
            ORDER BY updated_at DESC
        `;

        const result = await this.pool.query(query, [userId]);
        return result.rows;
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
        const client = await this.pool.connect();

        try {
            await client.query("BEGIN");

            // Insert message
            const insertQuery = `
                INSERT INTO messages (conversation_id, role, content, metadata, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING *
            `;

            const messageResult = await client.query(insertQuery, [
                conversationId,
                role,
                content,
                metadata ? JSON.stringify(metadata) : "{}",
            ]);

            // Update message count and updated_at
            const updateQuery = `
                UPDATE conversations
                SET message_count = message_count + 1,
                    updated_at = NOW()
                WHERE conversation_id = $1
            `;

            await client.query(updateQuery, [conversationId]);

            await client.query("COMMIT");

            return messageResult.rows[0];
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get messages for a conversation
     */
    async getMessages(
        conversationId: string,
        limit?: number,
    ): Promise<Message[]> {
        const query = limit
            ? `
                SELECT * FROM messages
                WHERE conversation_id = $1
                ORDER BY created_at ASC
                LIMIT $2
            `
            : `
                SELECT * FROM messages
                WHERE conversation_id = $1
                ORDER BY created_at ASC
            `;

        const params = limit ? [conversationId, limit] : [conversationId];
        const result = await this.pool.query(query, params);
        return result.rows;
    }

    /**
     * Get recent messages for a conversation
     */
    async getRecentMessages(
        conversationId: string,
        count: number,
    ): Promise<Message[]> {
        const query = `
            SELECT * FROM (
                SELECT * FROM messages
                WHERE conversation_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            ) AS recent_messages
            ORDER BY created_at ASC
        `;

        const result = await this.pool.query(query, [conversationId, count]);
        return result.rows;
    }

    /**
     * Delete a conversation and all its messages
     */
    async deleteConversation(conversationId: string): Promise<void> {
        const query = `
            DELETE FROM conversations
            WHERE conversation_id = $1
        `;

        await this.pool.query(query, [conversationId]);
    }

    /**
     * Delete old conversations (older than specified days)
     */
    async deleteOldConversations(daysOld: number): Promise<number> {
        const query = `
            DELETE FROM conversations
            WHERE updated_at < NOW() - INTERVAL '${daysOld} days'
        `;

        const result = await this.pool.query(query);
        return result.rowCount || 0;
    }

    /**
     * Get conversation count by user
     */
    async getConversationCount(userId?: string): Promise<number> {
        const query = userId
            ? `SELECT COUNT(*) FROM conversations WHERE user_id = $1`
            : `SELECT COUNT(*) FROM conversations`;

        const params = userId ? [userId] : [];
        const result = await this.pool.query(query, params);
        return parseInt(result.rows[0].count);
    }

    /**
     * Get message count for a conversation
     */
    async getMessageCount(conversationId: string): Promise<number> {
        const query = `
            SELECT message_count FROM conversations
            WHERE conversation_id = $1
        `;

        const result = await this.pool.query(query, [conversationId]);
        return result.rows[0]?.message_count || 0;
    }

    /**
     * Close database connection
     */
    async close(): Promise<void> {
        await this.pool.end();
    }
}
