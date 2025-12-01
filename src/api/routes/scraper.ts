import { Elysia, t } from "elysia";
import { getScraperService, getRAGInstance } from "../shared-instances.ts";
import { splitText, createDocuments } from "../../tools/rag-pgvector.ts";

export const scraperRoutes = new Elysia({ prefix: "/api/scraper" }).post(
  "/scrape",
  async ({ body }) => {
    const { url } = body;
    const scraper = getScraperService();
    const rag = getRAGInstance();

    // Scrape the URL
    const markdown = await scraper.scrape(url);

    // Split into chunks
    const chunks = splitText(markdown);

    // Create documents with metadata
    const documents = createDocuments(
      chunks,
      chunks.map((_, i) => ({
        url,
        scraped_at: new Date().toISOString(),
        chunk_index: i,
        total_chunks: chunks.length,
        source: "web_scraper",
      }))
    );

    // Save to pgvector
    await rag.addDocuments(documents);

    return {
      success: true,
      markdown, // Optional: return the full markdown if needed
      chunks_count: chunks.length,
      message: `Successfully scraped ${url} and saved ${chunks.length} chunks to knowledge base.`,
    };
  },
  {
    body: t.Object({
      url: t.String({ format: "uri" }),
    }),
  }
);
