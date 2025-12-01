import { Document } from "@langchain/core/documents";
import { splitText } from "../tools/rag-pgvector.ts";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Supported file types for processing
 */
export enum FileType {
    TEXT = "text",
    MARKDOWN = "markdown",
    JSON = "json",
    CSV = "csv",
    UNKNOWN = "unknown",
}

/**
 * File processing configuration
 */
export interface FileProcessorConfig {
    chunkSize?: number;
    chunkOverlap?: number;
    uploadDir?: string;
}

/**
 * File metadata
 */
export interface FileMetadata {
    filename: string;
    fileType: FileType;
    size: number;
    uploadedAt: string;
    path: string;
}

/**
 * Service for processing files and converting them to documents
 */
export class FileProcessor {
    private chunkSize: number;
    private chunkOverlap: number;
    private uploadDir: string;

    constructor(config: FileProcessorConfig = {}) {
        this.chunkSize = config.chunkSize || 1000;
        this.chunkOverlap = config.chunkOverlap || 200;
        this.uploadDir = config.uploadDir || "./uploads";
    }

    /**
     * Initialize upload directory
     */
    async initialize(): Promise<void> {
        try {
            await fs.mkdir(this.uploadDir, { recursive: true });
            console.log(`📁 Upload directory initialized: ${this.uploadDir}`);
        } catch (error) {
            console.error("Failed to create upload directory:", error);
            throw error;
        }
    }

    /**
     * Detect file type from extension
     */
    private detectFileType(filename: string): FileType {
        const ext = path.extname(filename).toLowerCase();
        
        switch (ext) {
            case ".txt":
                return FileType.TEXT;
            case ".md":
            case ".markdown":
                return FileType.MARKDOWN;
            case ".json":
                return FileType.JSON;
            case ".csv":
                return FileType.CSV;
            default:
                return FileType.UNKNOWN;
        }
    }

    /**
     * Save uploaded file to disk
     */
    async saveFile(file: File): Promise<FileMetadata> {
        const filename = file.name;
        const filepath = path.join(this.uploadDir, filename);
        const fileType = this.detectFileType(filename);

        // Read file content
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Save to disk
        await fs.writeFile(filepath, buffer);

        const metadata: FileMetadata = {
            filename,
            fileType,
            size: buffer.length,
            uploadedAt: new Date().toISOString(),
            path: filepath,
        };

        console.log(`✓ File saved: ${filename} (${fileType})`);
        return metadata;
    }

    /**
     * Read and parse file content
     */
    private async readFileContent(filepath: string, fileType: FileType): Promise<string> {
        const content = await fs.readFile(filepath, "utf-8");

        switch (fileType) {
            case FileType.JSON:
                // Pretty print JSON for better readability
                try {
                    const parsed = JSON.parse(content);
                    return JSON.stringify(parsed, null, 2);
                } catch {
                    return content;
                }
            
            case FileType.CSV:
                // Convert CSV to readable format
                return this.parseCSV(content);
            
            case FileType.TEXT:
            case FileType.MARKDOWN:
            default:
                return content;
        }
    }

    /**
     * Simple CSV parser
     */
    private parseCSV(content: string): string {
        const lines = content.split("\n").filter(line => line.trim());
        if (lines.length === 0) return content;

        const headers = lines[0]?.split(",").map(h => h.trim()) || [];
        const rows = lines.slice(1);

        let formatted = `CSV Data:\n\n`;
        formatted += `Headers: ${headers.join(", ")}\n\n`;
        
        rows.forEach((row, idx) => {
            const values = row.split(",").map(v => v.trim());
            formatted += `Row ${idx + 1}:\n`;
            headers.forEach((header, i) => {
                formatted += `  ${header}: ${values[i] || "N/A"}\n`;
            });
            formatted += "\n";
        });

        return formatted;
    }

    /**
     * Process file and convert to documents with embeddings
     */
    async processFile(metadata: FileMetadata): Promise<Document[]> {
        // Read file content
        const content = await this.readFileContent(metadata.path, metadata.fileType);

        // Split into chunks
        const chunks = splitText(content, this.chunkSize, this.chunkOverlap);

        // Create documents with metadata
        const documents = chunks.map((chunk, index) => 
            new Document({
                pageContent: chunk,
                metadata: {
                    filename: metadata.filename,
                    fileType: metadata.fileType,
                    chunkIndex: index,
                    totalChunks: chunks.length,
                    uploadedAt: metadata.uploadedAt,
                    source: metadata.path,
                },
            })
        );

        console.log(`✓ Processed ${metadata.filename}: ${documents.length} chunks created`);
        return documents;
    }

    /**
     * List all uploaded files
     */
    async listFiles(): Promise<FileMetadata[]> {
        try {
            const files = await fs.readdir(this.uploadDir);
            const metadata: FileMetadata[] = [];

            for (const filename of files) {
                const filepath = path.join(this.uploadDir, filename);
                const stats = await fs.stat(filepath);

                if (stats.isFile()) {
                    metadata.push({
                        filename,
                        fileType: this.detectFileType(filename),
                        size: stats.size,
                        uploadedAt: stats.mtime.toISOString(),
                        path: filepath,
                    });
                }
            }

            return metadata;
        } catch (error) {
            console.error("Failed to list files:", error);
            return [];
        }
    }

    /**
     * Delete a file
     */
    async deleteFile(filename: string): Promise<boolean> {
        try {
            const filepath = path.join(this.uploadDir, filename);
            await fs.unlink(filepath);
            console.log(`✓ File deleted: ${filename}`);
            return true;
        } catch (error) {
            console.error(`Failed to delete file ${filename}:`, error);
            return false;
        }
    }

    /**
     * Clear all uploaded files
     */
    async clearAll(): Promise<number> {
        try {
            const files = await fs.readdir(this.uploadDir);
            let count = 0;

            for (const filename of files) {
                const filepath = path.join(this.uploadDir, filename);
                const stats = await fs.stat(filepath);
                
                if (stats.isFile()) {
                    await fs.unlink(filepath);
                    count++;
                }
            }

            console.log(`✓ Cleared ${count} files from upload directory`);
            return count;
        } catch (error) {
            console.error("Failed to clear files:", error);
            return 0;
        }
    }
}
