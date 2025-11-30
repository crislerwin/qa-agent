import { Client, GatewayIntentBits, Message, Events } from "discord.js";
import type { ReactAgent } from "langchain";
import { RedisMemoryManager } from "../memory/redis.ts";

/**
 * Discord bot configuration
 */
export interface DiscordBotConfig {
    token?: string;
    agent: ReactAgent;
    memoryManager?: RedisMemoryManager;
    prefix?: string;
    allowedChannels?: string[];
    maxHistoryMessages?: number;
}

/**
 * Discord Bot with AI Agent integration
 */
export class DiscordAgentBot {
    private client: Client;
    private agent: ReactAgent;
    private memoryManager?: RedisMemoryManager;
    private prefix: string;
    private allowedChannels?: string[];
    private maxHistoryMessages: number;

    constructor(config: DiscordBotConfig) {
        this.agent = config.agent;
        this.memoryManager = config.memoryManager;
        this.prefix = config.prefix || "!";
        this.allowedChannels = config.allowedChannels;
        this.maxHistoryMessages = config.maxHistoryMessages || 10;

        // Create Discord client
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
        });

        this.setupEventHandlers();
    }

    /**
     * Setup Discord event handlers
     */
    private setupEventHandlers() {
        this.client.on(Events.ClientReady, () => {
            console.log(`✓ Discord bot logged in as ${this.client.user?.tag}`);
        });

        this.client.on(Events.MessageCreate, async (message) => {
            await this.handleMessage(message);
        });

        this.client.on(Events.Error, (error) => {
            console.error("Discord client error:", error);
        });
    }

    /**
     * Handle incoming Discord messages
     */
    private async handleMessage(message: Message) {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check if message is in allowed channels
        if (this.allowedChannels && !this.allowedChannels.includes(message.channelId)) {
            return;
        }

        // Check for prefix or mention
        const isMention = message.mentions.has(this.client.user!);
        const hasPrefix = message.content.startsWith(this.prefix);

        if (!isMention && !hasPrefix) return;

        // Extract user message
        let userMessage = message.content;
        if (hasPrefix) {
            userMessage = userMessage.slice(this.prefix.length).trim();
        } else if (isMention) {
            userMessage = userMessage.replace(`<@${this.client.user!.id}>`, "").trim();
        }

        if (!userMessage) return;

        try {
            // Show typing indicator (only if channel supports it)
            if (message.channel.isTextBased() && "sendTyping" in message.channel) {
                await message.channel.sendTyping();
            }

            // Get conversation history if memory is enabled
            const userMessages: Array<{ role: "user"; content: string }> = [];
            const assistantMessages: Array<{ role: "assistant"; content: string }> = [];

            if (this.memoryManager) {
                const sessionId = `discord:${message.channelId}`;
                const history = this.memoryManager.getHistory(sessionId, 3600); // 1 hour TTL

                const pastMessages = await history.getRecentMessages(this.maxHistoryMessages);
                pastMessages.forEach((msg) => {
                    if (msg._getType() === "human") {
                        userMessages.push({ role: "user", content: msg.content as string });
                    } else {
                        assistantMessages.push({ role: "assistant", content: msg.content as string });
                    }
                });

                // Add current message to history
                await history.addUserMessage(userMessage);
            }

            // Combine messages for agent
            const allMessages = [...userMessages, ...assistantMessages, { role: "user" as const, content: userMessage }];

            // Invoke agent
            const response = await this.agent.invoke({
                messages: allMessages,
            });

            // Extract response content
            const responseText = this.extractResponseContent(response);

            // Save response to history
            if (this.memoryManager) {
                const sessionId = `discord:${message.channelId}`;
                const history = this.memoryManager.getHistory(sessionId, 3600);
                await history.addAIMessage(responseText);
            }

            // Send response (split if too long)
            await this.sendResponse(message, responseText);
        } catch (error) {
            console.error("Error processing message:", error);
            await message.reply("Sorry, I encountered an error processing your message.");
        }
    }

    /**
     * Extract content from agent response
     */
    private extractResponseContent(response: unknown): string {
        if (typeof response === "string") {
            return response;
        }

        if (typeof response === "object" && response !== null) {
            // Check for content property
            if ("content" in response) {
                const content = response.content;
                return typeof content === "string"
                    ? content
                    : JSON.stringify(content);
            }

            // Check for messages array
            if ("messages" in response && Array.isArray(response.messages) && response.messages.length > 0) {
                const lastMessage = response.messages[response.messages.length - 1];
                if (lastMessage && typeof lastMessage === "object" && "content" in lastMessage) {
                    return String(lastMessage.content || "");
                }
            }
        }

        return JSON.stringify(response);
    }

    /**
     * Send response, splitting if necessary
     */
    private async sendResponse(message: Message, content: string) {
        const maxLength = 2000;

        if (content.length <= maxLength) {
            await message.reply(content);
            return;
        }

        // Split into chunks
        const chunks = this.splitMessage(content, maxLength);

        for (const chunk of chunks) {
            if (message.channel.isTextBased() && "send" in message.channel) {
                await message.channel.send(chunk);
            }
        }
    }

    /**
     * Split message into chunks
     */
    private splitMessage(text: string, maxLength: number): string[] {
        const chunks: string[] = [];
        let currentChunk = "";

        const lines = text.split("\n");

        for (const line of lines) {
            if (currentChunk.length + line.length + 1 > maxLength) {
                chunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk += (currentChunk ? "\n" : "") + line;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * Start the bot
     */
    async start(token?: string) {
        const botToken = token || process.env.DISCORD_BOT_TOKEN;

        if (!botToken) {
            throw new Error("DISCORD_BOT_TOKEN not found in environment or config");
        }

        await this.client.login(botToken);
    }

    /**
     * Stop the bot
     */
    async stop() {
        if (this.memoryManager) {
            await this.memoryManager.close();
        }
        this.client.destroy();
    }

    /**
     * Get the Discord client
     */
    getClient(): Client {
        return this.client;
    }
}

/**
 * Create and start a Discord bot
 */
export async function createDiscordBot(config: DiscordBotConfig): Promise<DiscordAgentBot> {
    const bot = new DiscordAgentBot(config);
    await bot.start(config.token);
    return bot;
}
