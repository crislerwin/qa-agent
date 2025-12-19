import { createAgent } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { getDefaultModel } from "../config/models.ts";
import {
    createWebSearchTool,
    createNewsSearchTool,
    createURLFetchTool,
} from "../tools/web-search.ts";

import { PGVectorRAG } from "../tools/rag-pgvector.ts";
import type { RedisChatMessageHistory } from "../memory/redis.ts";

/**
 * Base agent configuration
 */
export interface AgentConfig {
    model?: BaseChatModel;
    systemPrompt?: string;
    tools?: StructuredToolInterface[];
    memory?: RedisChatMessageHistory;
}

/**
 * Create a full-featured agent
 * Combines web search, RAG, and task automation
 */
export function createFullAgent(rag: PGVectorRAG, config: AgentConfig = {}) {
    const model = config.model || getDefaultModel();

    const tools = [
        // Web tools
        createWebSearchTool(),
        createNewsSearchTool(),
        createURLFetchTool(),
        // RAG tools
        rag.createSearchTool(),
        rag.createAddDocumentTool(),
        // Additional custom tools
        ...(config.tools || []),
    ];

    return createAgent({
        model,
        tools,
        systemPrompt: config.systemPrompt,
    });
}
