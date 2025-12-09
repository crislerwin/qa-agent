import { tool } from "langchain";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import type { Embeddings } from "@langchain/core/embeddings";
import { createLogger } from "../utils/logger.ts";
import { getDb, documents } from "../db/client";
import type { InsertDocument } from "../db/client";

const logger = createLogger("rag-pgvector");

/**
 * PGVector RAG configuration
 */
export interface PGVectorRAGConfig {
    connectionString?: string;
    tableName?: string;
    embeddings?: Embeddings;
    topK?: number;
}

/**
 * RAG system using PostgreSQL with pgvector extension
 */
export class PGVectorRAG {
    private db: ReturnType<typeof getDb>;
    private tableName: string;
    private embeddings: Embeddings;
    private topK: number;

    constructor(config: PGVectorRAGConfig = {}) {
        // Use singleton db instance
        this.db = getDb();

        if (config.connectionString) {
            logger.warn(
                "Custom connection string provided but using singleton db instance.",
            );
        }

        this.tableName = config.tableName || "documents";
        this.topK = config.topK || 3;

        // Use OpenRouter embeddings if available, fallback to OpenAI
        const apiKey = config.embeddings
            ? undefined
            : process.env.OPEN_ROUTER_API_KEY || process.env.OPENAI_API_KEY;

        if (!config.embeddings && !apiKey) {
            logger.warn(
                "No API key found for embeddings. RAG functionality will fail unless a custom embeddings instance is provided.",
            );
        }

        this.embeddings =
            config.embeddings ||
            new OpenAIEmbeddings({
                apiKey: apiKey || "dummy-key",
                modelName: process.env.OPEN_ROUTER_API_KEY
                    ? "openai/text-embedding-3-small"
                    : "text-embedding-3-small",
                configuration: process.env.OPEN_ROUTER_API_KEY
                    ? {
                          baseURL: "https://openrouter.ai/api/v1",
                      }
                    : undefined,
            });
    }

    /**
     * Initialize the database table (usually done via Docker init script)
     */
    async initialize(): Promise<void> {
        try {
            // Enable pgvector extension
            await this.db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

            // Create documents table if not exists
            await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS ${sql.identifier(this.tableName)} (
          id SERIAL PRIMARY KEY,
          content TEXT NOT NULL,
          metadata JSONB DEFAULT '{}',
          embedding vector(1536),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

            // Create HNSW index for vector similarity search
            await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS ${sql.identifier(this.tableName + "_embedding_idx")}
        ON ${sql.identifier(this.tableName)}
        USING hnsw (embedding vector_cosine_ops)
      `);

            // Create metadata index
            await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS ${sql.identifier(this.tableName + "_metadata_idx")}
        ON ${sql.identifier(this.tableName)}
        USING GIN (metadata)
      `);
        } catch (error) {
            logger.error("Error initializing RAG database:", error);
            throw error;
        }
    }

    /**
     * Add documents to PostgreSQL
     */
    async addDocuments(docs: Document[]): Promise<void> {
        try {
            // Generate embeddings for all documents
            const texts = docs.map((doc) => doc.pageContent);
            const embeddings = await this.embeddings.embedDocuments(texts);

            // Insert documents with embeddings
            for (let i = 0; i < docs.length; i++) {
                const doc = docs[i]!;
                const embedding = embeddings[i]!;

                await this.db.execute(sql`
          INSERT INTO ${sql.identifier(this.tableName)} (content, metadata, embedding)
          VALUES (
            ${doc.pageContent},
            ${JSON.stringify(doc.metadata)}::jsonb,
            ${`[${embedding.join(",")}]`}::vector
          )
        `);
            }
        } catch (error) {
            logger.error("Error adding documents:", error);
            throw error;
        }
    }

    /**
     * Search for relevant documents using vector similarity
     */
    async search(query: string, k?: number): Promise<Document[]> {
        try {
            // Generate embedding for query
            const queryEmbedding = await this.embeddings.embedQuery(query);
            const searchK = k || this.topK;

            // Search using cosine similarity
            const result = await this.db.execute<{
                content: string;
                metadata: any;
                similarity: number;
            }>(sql`
        SELECT
          content,
          metadata,
          1 - (embedding <=> ${`[${queryEmbedding.join(",")}]`}::vector) AS similarity
        FROM ${sql.identifier(this.tableName)}
        ORDER BY embedding <=> ${`[${queryEmbedding.join(",")}]`}::vector
        LIMIT ${searchK}
      `);

            // Convert to Documents
            return result.map(
                (row) =>
                    new Document({
                        pageContent: row.content,
                        metadata: {
                            ...row.metadata,
                            score: row.similarity,
                        },
                    }),
            );
        } catch (error: any) {
            // Handle missing table error gracefully
            if (error.code === "42P01") {
                logger.warn(
                    `RAG table '${this.tableName}' does not exist. Returning empty results.`,
                );
                return [];
            }
            logger.error("Error searching knowledge base:", error);
            throw error;
        }
    }

    /**
     * Delete all documents
     */
    async clear(): Promise<void> {
        try {
            await this.db.execute(
                sql`TRUNCATE TABLE ${sql.identifier(this.tableName)} RESTART IDENTITY`,
            );
        } catch (error) {
            logger.error("Error clearing documents:", error);
            throw error;
        }
    }

    /**
     * Close database connection pool
     */
    async close(): Promise<void> {
        // With singleton pattern, this is a no-op
        logger.info("Close called on PGVectorRAG (no-op with singleton db)");
    }

    /**
     * Create a search tool for use with agents
     */
    createSearchTool() {
        return tool(
            async ({ query }) => {
                try {
                    const results = await this.search(query);

                    if (results.length === 0) {
                        return "No relevant information found in the knowledge base.";
                    }

                    const formattedResults = results
                        .map((doc, i) => {
                            const score = doc.metadata.score as number;
                            return `[${i + 1}] (Relevance: ${(score * 100).toFixed(1)}%)\n${
                                doc.pageContent
                            }`;
                        })
                        .join("\n\n");

                    return `Found ${results.length} relevant documents:\n\n${formattedResults}`;
                } catch (error) {
                    return `Error searching knowledge base: ${
                        error instanceof Error ? error.message : String(error)
                    }`;
                }
            },
            {
                name: "search_knowledge_base",
                description:
                    "Search the PostgreSQL knowledge base for relevant information. Use this when you need to answer questions based on stored documents.",
                schema: z.object({
                    query: z.string().describe("The search query"),
                }),
            },
        );
    }

    /**
     * Create a tool to add information to knowledge base
     */
    createAddDocumentTool() {
        return tool(
            async ({ content, metadata }) => {
                try {
                    const doc = new Document({
                        pageContent: content,
                        metadata: metadata || {},
                    });

                    await this.addDocuments([doc]);
                    return `Successfully added document to knowledge base.`;
                } catch (error) {
                    return `Error adding document: ${
                        error instanceof Error ? error.message : String(error)
                    }`;
                }
            },
            {
                name: "add_to_knowledge_base",
                description:
                    "Add new information to the PostgreSQL knowledge base for future retrieval",
                schema: z.object({
                    content: z
                        .string()
                        .describe("The content to add to knowledge base"),
                    metadata: z
                        .any()
                        .optional()
                        .describe("Optional metadata for the document"),
                }),
            },
        );
    }

    /**
     * Get the embeddings instance
     */
    getEmbeddings(): Embeddings {
        return this.embeddings;
    }
}

/**
 * Helper function to create documents from text chunks
 */
export function createDocuments(
    texts: string[],
    metadata?: Record<string, unknown>[],
): Document[] {
    return texts.map(
        (text, i) =>
            new Document({
                pageContent: text,
                metadata: metadata?.[i] || {},
            }),
    );
}
