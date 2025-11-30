import { tool } from "langchain";
import { z } from "zod";
import { Pool, type PoolConfig } from "pg";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import type { Embeddings } from "@langchain/core/embeddings";

/**
 * PGVector RAG configuration
 */
export interface PGVectorRAGConfig {
    connectionString?: string;
    poolConfig?: PoolConfig;
    tableName?: string;
    embeddings?: Embeddings;
    topK?: number;
}

/**
 * RAG system using PostgreSQL with pgvector extension
 */
export class PGVectorRAG {
    private pool: Pool;
    private tableName: string;
    private embeddings: Embeddings;
    private topK: number;

    constructor(config: PGVectorRAGConfig = {}) {
        const connectionString = config.connectionString ||
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:5432/agents_db";

        // Create PostgreSQL connection pool
        this.pool = new Pool(
            config.poolConfig || {
                connectionString,
            }
        );

        this.tableName = config.tableName || "documents";
        this.topK = config.topK || 3;

        // Use OpenRouter embeddings if available, fallback to OpenAI
        this.embeddings =
            config.embeddings ||
            new OpenAIEmbeddings({
                apiKey:
                    process.env.OPEN_ROUTER_API_KEY ||
                    process.env.OPENAI_API_KEY,
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
        const client = await this.pool.connect();
        try {
            // Enable pgvector extension
            await client.query("CREATE EXTENSION IF NOT EXISTS vector");

            // Create documents table
            await client.query(`
                CREATE TABLE IF NOT EXISTS ${this.tableName} (
                    id SERIAL PRIMARY KEY,
                    content TEXT NOT NULL,
                    metadata JSONB DEFAULT '{}',
                    embedding vector(1536),
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Create vector similarity index
            await client.query(`
                CREATE INDEX IF NOT EXISTS ${this.tableName}_embedding_idx
                ON ${this.tableName}
                USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100)
            `);

            // Create metadata index
            await client.query(`
                CREATE INDEX IF NOT EXISTS ${this.tableName}_metadata_idx
                ON ${this.tableName}
                USING GIN (metadata)
            `);
        } finally {
            client.release();
        }
    }

    /**
     * Add documents to PostgreSQL
     */
    async addDocuments(documents: Document[]): Promise<void> {
        const client = await this.pool.connect();
        try {
            // Generate embeddings for all documents
            const texts = documents.map((doc) => doc.pageContent);
            const embeddings = await this.embeddings.embedDocuments(texts);

            // Insert documents with embeddings
            for (let i = 0; i < documents.length; i++) {
                const doc = documents[i]!;
                const embedding = embeddings[i]!;

                await client.query(
                    `INSERT INTO ${this.tableName} (content, metadata, embedding)
                     VALUES ($1, $2, $3)`,
                    [
                        doc.pageContent,
                        JSON.stringify(doc.metadata),
                        `[${embedding.join(",")}]`,
                    ]
                );
            }
        } finally {
            client.release();
        }
    }

    /**
     * Search for relevant documents using vector similarity
     */
    async search(query: string, k?: number): Promise<Document[]> {
        const client = await this.pool.connect();
        try {
            // Generate embedding for query
            const queryEmbedding = await this.embeddings.embedQuery(query);

            // Search using cosine similarity
            const result = await client.query(
                `SELECT
                    content,
                    metadata,
                    1 - (embedding <=> $1::vector) AS similarity
                 FROM ${this.tableName}
                 ORDER BY embedding <=> $1::vector
                 LIMIT $2`,
                [`[${queryEmbedding.join(",")}]`, k || this.topK]
            );

            // Convert to Documents
            return result.rows.map(
                (row) =>
                    new Document({
                        pageContent: row.content,
                        metadata: {
                            ...row.metadata,
                            score: row.similarity,
                        },
                    })
            );
        } finally {
            client.release();
        }
    }

    /**
     * Delete all documents
     */
    async clear(): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(`TRUNCATE TABLE ${this.tableName} RESTART IDENTITY`);
        } finally {
            client.release();
        }
    }

    /**
     * Close database connection pool
     */
    async close(): Promise<void> {
        await this.pool.end();
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
                            return `[${i + 1}] (Relevance: ${(score * 100).toFixed(1)}%)\n${doc.pageContent}`;
                        })
                        .join("\n\n");

                    return `Found ${results.length} relevant documents:\n\n${formattedResults}`;
                } catch (error) {
                    return `Error searching knowledge base: ${error instanceof Error ? error.message : String(error)}`;
                }
            },
            {
                name: "search_knowledge_base",
                description:
                    "Search the PostgreSQL knowledge base for relevant information. Use this when you need to answer questions based on stored documents.",
                schema: z.object({
                    query: z.string().describe("The search query"),
                }),
            }
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
                    return `✓ Successfully added document to knowledge base.`;
                } catch (error) {
                    return `Error adding document: ${error instanceof Error ? error.message : String(error)}`;
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
                        .record(z.string(), z.unknown())
                        .optional()
                        .describe("Optional metadata for the document"),
                }),
            }
        );
    }
}

/**
 * Helper function to create documents from text chunks
 */
export function createDocuments(
    texts: string[],
    metadata?: Record<string, unknown>[]
): Document[] {
    return texts.map(
        (text, i) =>
            new Document({
                pageContent: text,
                metadata: metadata?.[i] || {},
            })
    );
}

/**
 * Simple text splitter for chunking documents
 */
export function splitText(
    text: string,
    chunkSize: number = 1000,
    overlap: number = 200
): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        start = end - overlap;

        if (start >= text.length - overlap) break;
    }

    return chunks;
}
