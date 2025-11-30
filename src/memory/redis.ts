import Redis from "ioredis";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { BaseChatMessageHistory } from "@langchain/core/chat_history";

/**
 * Redis configuration
 */
export interface RedisConfig {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
}

/**
 * Redis-backed chat message history
 * Stores conversation history with TTL support
 */
export class RedisChatMessageHistory extends BaseChatMessageHistory {
    lc_namespace = ["langchain", "stores", "message", "redis"];

    private redis: Redis;
    private sessionId: string;
    private keyPrefix: string;
    private ttl?: number;

    constructor(sessionId: string, config: RedisConfig = {}, ttl?: number) {
        super();

        this.sessionId = sessionId;
        this.keyPrefix = config.keyPrefix || "chat_history:";
        this.ttl = ttl;

        // Create Redis client
        if (config.url || process.env.REDIS_URL) {
            this.redis = new Redis(config.url || process.env.REDIS_URL!);
        } else {
            this.redis = new Redis({
                host: config.host || process.env.REDIS_HOST || "localhost",
                port: config.port || parseInt(process.env.REDIS_PORT || "6379"),
                password: config.password || process.env.REDIS_PASSWORD,
                db: config.db || parseInt(process.env.REDIS_DB || "0"),
            });
        }
    }

    /**
     * Get Redis key for session
     */
    private getKey(): string {
        return `${this.keyPrefix}${this.sessionId}`;
    }

    /**
     * Get all messages for this session
     */
    async getMessages(): Promise<BaseMessage[]> {
        const key = this.getKey();
        const items = await this.redis.lrange(key, 0, -1);

        return items.map((item) => {
            const parsed = JSON.parse(item);
            return this.deserializeMessage(parsed);
        });
    }

    /**
     * Add a message to history
     */
    async addMessage(message: BaseMessage): Promise<void> {
        const key = this.getKey();
        const serialized = JSON.stringify(this.serializeMessage(message));

        await this.redis.rpush(key, serialized);

        // Set TTL if configured
        if (this.ttl) {
            await this.redis.expire(key, this.ttl);
        }
    }

    /**
     * Add a user message to history
     */
    async addUserMessage(content: string): Promise<void> {
        await this.addMessage(new HumanMessage(content));
    }

    /**
     * Add an AI message to history
     */
    async addAIMessage(content: string): Promise<void> {
        await this.addMessage(new AIMessage(content));
    }

    /**
     * Clear all messages for this session
     */
    async clear(): Promise<void> {
        await this.redis.del(this.getKey());
    }

    /**
     * Serialize message for storage
     */
    private serializeMessage(message: BaseMessage) {
        return {
            type: message._getType(),
            content: message.content,
            additional_kwargs: message.additional_kwargs,
        };
    }

    /**
     * Deserialize message from storage
     */
    private deserializeMessage(data: {
        type: string;
        content: string;
        additional_kwargs?: Record<string, unknown>;
    }): BaseMessage {
        switch (data.type) {
            case "human":
                return new HumanMessage({
                    content: data.content,
                    additional_kwargs: data.additional_kwargs,
                });
            case "ai":
                return new AIMessage({
                    content: data.content,
                    additional_kwargs: data.additional_kwargs,
                });
            case "system":
                return new SystemMessage({
                    content: data.content,
                    additional_kwargs: data.additional_kwargs,
                });
            default:
                return new HumanMessage({
                    content: data.content,
                    additional_kwargs: data.additional_kwargs,
                });
        }
    }

    /**
     * Get message count for this session
     */
    async getMessageCount(): Promise<number> {
        return await this.redis.llen(this.getKey());
    }

    /**
     * Get recent N messages
     */
    async getRecentMessages(count: number): Promise<BaseMessage[]> {
        const key = this.getKey();
        const items = await this.redis.lrange(key, -count, -1);

        return items.map((item) => {
            const parsed = JSON.parse(item);
            return this.deserializeMessage(parsed);
        });
    }

    /**
     * Close Redis connection
     */
    async close(): Promise<void> {
        await this.redis.quit();
    }
}

/**
 * Create a Redis-backed chat history
 */
export function createRedisHistory(
    sessionId: string,
    config?: RedisConfig,
    ttl?: number
): RedisChatMessageHistory {
    return new RedisChatMessageHistory(sessionId, config, ttl);
}

/**
 * Redis memory manager for multiple sessions
 */
export class RedisMemoryManager {
    private redis: Redis;
    private keyPrefix: string;

    constructor(config: RedisConfig = {}) {
        this.keyPrefix = config.keyPrefix || "chat_history:";

        if (config.url || process.env.REDIS_URL) {
            this.redis = new Redis(config.url || process.env.REDIS_URL!);
        } else {
            this.redis = new Redis({
                host: config.host || process.env.REDIS_HOST || "localhost",
                port: config.port || parseInt(process.env.REDIS_PORT || "6379"),
                password: config.password || process.env.REDIS_PASSWORD,
                db: config.db || parseInt(process.env.REDIS_DB || "0"),
            });
        }
    }

    /**
     * Get history for a session
     */
    getHistory(sessionId: string, ttl?: number): RedisChatMessageHistory {
        return new RedisChatMessageHistory(
            sessionId,
            { keyPrefix: this.keyPrefix },
            ttl
        );
    }

    /**
     * List all session IDs
     */
    async listSessions(): Promise<string[]> {
        const keys = await this.redis.keys(`${this.keyPrefix}*`);
        return keys.map((key) => key.replace(this.keyPrefix, ""));
    }

    /**
     * Delete a session
     */
    async deleteSession(sessionId: string): Promise<void> {
        await this.redis.del(`${this.keyPrefix}${sessionId}`);
    }

    /**
     * Delete all sessions
     */
    async clearAll(): Promise<void> {
        const keys = await this.redis.keys(`${this.keyPrefix}*`);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }

    /**
     * Close Redis connection
     */
    async close(): Promise<void> {
        await this.redis.quit();
    }
}
