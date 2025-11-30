/**
 * Discord bot example with AI agent
 * Demonstrates full integration with Discord
 */

import { createDiscordAgent } from "../src/agents/index.ts";
import { createDiscordBot } from "../src/integrations/discord.ts";
import { RedisMemoryManager } from "../src/memory/redis.ts";
import { PGVectorRAG } from "../src/tools/rag-pgvector.ts";
import { ModelPresets } from "../src/config/models.ts";

async function main() {
    console.log("Starting Discord Bot with AI Agent...\n");

    // Initialize RAG (optional)
    const rag = new PGVectorRAG();

    // Create agent
    const agent = createDiscordAgent(rag, {
        model: ModelPresets.free(), // Use free model to save costs
    });

    // Create memory manager for conversation history
    const memoryManager = new RedisMemoryManager();

    // Create and start Discord bot
    const bot = await createDiscordBot({
        agent,
        memoryManager,
        prefix: "!", // Users can trigger bot with !command
        // allowedChannels: ["CHANNEL_ID_1", "CHANNEL_ID_2"], // Optional: restrict to specific channels
    });

    console.log("Discord bot is now running!");
    console.log("Commands:");
    console.log("  !<message> - Talk to the bot using prefix");
    console.log("  @Bot <message> - Mention the bot");

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log("\nShutting down bot...");
        await bot.stop();
        process.exit(0);
    });
}

main().catch(console.error);
