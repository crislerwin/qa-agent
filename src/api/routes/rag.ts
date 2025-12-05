import { Elysia, t } from "elysia";
import { createDocuments } from "../../tools/rag-pgvector.ts";
import { clusterSemanticChunking } from "../../utils/chunking.ts";
import { getRAGInstance } from "../shared-instances.ts";
import { createLogger } from "../../utils/logger.ts";

const logger = createLogger("rag-routes");

/**
 * RAG routes for knowledge base operations
 */
export const ragRoutes = new Elysia({ prefix: "/api/rag" })
  /**
   * Add documents to knowledge base
   */
  .post(
    "/documents",
    async ({ body }) => {
      const { documents } = body;
      const rag = getRAGInstance();

      const allDocs = [];
      for (const doc of documents) {
        const chunks = await clusterSemanticChunking(
          doc.content,
          rag.getEmbeddings()
        );
        const chunkDocs = createDocuments(
          chunks,
          Array(chunks.length).fill(doc.metadata || {})
        );
        allDocs.push(...chunkDocs);
      }

      await rag.addDocuments(allDocs);

      return {
        success: true,
        count: documents.length,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        documents: t.Array(
          t.Object({
            content: t.String({ minLength: 1 }),
            metadata: t.Optional(t.Record(t.String(), t.Unknown())),
          })
        ),
      }),
    }
  )
  /**
   * Search knowledge base
   */
  .post(
    "/search",
    async ({ body }) => {
      const { query, topK } = body;
      const rag = getRAGInstance();

      const results = await rag.search(query, topK);

      return {
        results: results.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        })),
        count: results.length,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        query: t.String({ minLength: 1 }),
        topK: t.Optional(t.Number({ minimum: 1, maximum: 20 })),
      }),
    }
  )

  /**
   * Clear knowledge base
   */
  .delete("/documents", async () => {
    const rag = getRAGInstance();
    await rag.clear();

    return {
      success: true,
      message: "Knowledge base cleared",
      timestamp: new Date().toISOString(),
    };
  });
