/**
 * Pre-made agent exports
 * Import these directly for quick setup
 */

export * from "./conversational.ts";
export * from "./web.ts";

// Re-export factory functions for custom agents
export * from "../factory/agents.ts";

// Re-export configuration
export * from "../config/models.ts";

// Re-export tools
export * from "../tools/web-search.ts";
export * from "../tools/rag-pgvector.ts";

// Re-export memory
export * from "../memory/redis.ts";
