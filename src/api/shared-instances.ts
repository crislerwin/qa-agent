import { PGVectorRAG } from "../tools/rag-pgvector.ts";
import { FileProcessor } from "../services/file-processor.ts";
import { ScraperService } from "../services/scraper.service.ts";

/**
 * Shared instances for RAG and file processing
 * This ensures all routes use the same database connection and instances
 */

let ragInstance: PGVectorRAG | null = null;
let fileProcessorInstance: FileProcessor | null = null;
let scraperServiceInstance: ScraperService | null = null;

export function getRAGInstance(): PGVectorRAG {
  if (!ragInstance) {
    ragInstance = new PGVectorRAG();
  }
  return ragInstance;
}

export function getFileProcessor(): FileProcessor {
  if (!fileProcessorInstance) {
    fileProcessorInstance = new FileProcessor({
      uploadDir: "./uploads",
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    // Initialize upload directory
    fileProcessorInstance.initialize().catch(console.error);
  }
  return fileProcessorInstance;
}

export function getScraperService(): ScraperService {
  if (!scraperServiceInstance) {
    scraperServiceInstance = new ScraperService();
  }
  return scraperServiceInstance;
}
