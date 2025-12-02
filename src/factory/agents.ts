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
 * Create a simple conversational agent
 * No tools, just conversation
 */
export function createConversationalAgent(config: AgentConfig = {}) {
    const model = config.model || getDefaultModel();

    return createAgent({
        model,
        tools: config.tools || [],
        systemPrompt: config.systemPrompt,
    });
}

/**
 * Create a web-enabled agent
 * Can search the web, read news, and fetch URLs
 */
export function createWebAgent(config: AgentConfig = {}) {
    const model = config.model || getDefaultModel();

    const tools = [
        createWebSearchTool(),
        createNewsSearchTool(),
        createURLFetchTool(),
        ...(config.tools || []),
    ];

    return createAgent({
        model,
        tools,
        systemPrompt: config.systemPrompt,
    });
}

/**
 * Create a RAG-enabled agent
 * Can search and add to knowledge base
 */
export function createRAGAgent(rag: PGVectorRAG, config: AgentConfig = {}) {
    const model = config.model || getDefaultModel();

    const tools = [
        rag.createSearchTool(),
        rag.createAddDocumentTool(),
        ...(config.tools || []),
    ];

    return createAgent({
        model,
        tools,
        systemPrompt: config.systemPrompt,
    });
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

/**
 * Create a Discord bot agent
 * Optimized for Discord interactions with web and task capabilities
 */
export function createDiscordAgent(
    rag?: PGVectorRAG,
    config: AgentConfig = {},
) {
    const model = config.model || getDefaultModel();

    const tools = [
        createWebSearchTool(),
        createURLFetchTool(),
        ...(config.tools || []),
    ];

    // Add RAG tools if provided
    if (rag) {
        tools.push(rag.createSearchTool(), rag.createAddDocumentTool());
    }

    return createAgent({
        model,
        tools,
        systemPrompt: config.systemPrompt,
    });
}
