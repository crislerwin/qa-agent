import { Elysia, t } from "elysia";
import { getFileProcessor, getRAGInstance } from "../shared-instances.ts";

/**
 * File upload and processing routes
 */
export const fileRoutes = new Elysia({ prefix: "/api/files" })
    /**
     * Upload and process a file
     */
    .post(
        "/upload",
        async ({ body }) => {
            const { file, processImmediately } = body;
            const processor = getFileProcessor();

            // Validate file extension manually (MIME types can be unreliable)
            const filename = file.name.toLowerCase();
            const validExtensions = [".txt", ".md", ".markdown", ".json", ".csv"];
            const hasValidExtension = validExtensions.some(ext => filename.endsWith(ext));
            
            if (!hasValidExtension) {
                return {
                    success: false,
                    error: `Invalid file type. Supported: ${validExtensions.join(", ")}`,
                    timestamp: new Date().toISOString(),
                };
            }

            // Save file
            const metadata = await processor.saveFile(file);

            // Convert string to boolean if needed (FormData sends strings)
            const shouldProcess = processImmediately === true || processImmediately === "true";

            // Process and store in vector database if requested
            if (shouldProcess) {
                const rag = getRAGInstance();
                
                // Initialize database if needed
                try {
                    await rag.initialize();
                } catch (error) {
                    console.log("Database already initialized or error:", error);
                }
                
                const documents = await processor.processFile(metadata);
                await rag.addDocuments(documents);

                return {
                    success: true,
                    message: "File uploaded and processed successfully",
                    metadata,
                    documentsCreated: documents.length,
                    timestamp: new Date().toISOString(),
                };
            }

            return {
                success: true,
                message: "File uploaded successfully",
                metadata,
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                file: t.File({
                    maxSize: 10 * 1024 * 1024, // 10MB
                }),
                processImmediately: t.Optional(t.Union([t.Boolean(), t.String()])),
            }),
        }
    )
    /**
     * Process an already uploaded file
     */
    .post(
        "/process/:filename",
        async ({ params }) => {
            const { filename } = params;
            const processor = getFileProcessor();
            const rag = getRAGInstance();

            // Get file metadata
            const files = await processor.listFiles();
            const fileMetadata = files.find((f) => f.filename === filename);

            if (!fileMetadata) {
                return {
                    success: false,
                    error: "File not found",
                    timestamp: new Date().toISOString(),
                };
            }

            // Process file and add to vector database
            const documents = await processor.processFile(fileMetadata);
            await rag.addDocuments(documents);

            return {
                success: true,
                message: `File ${filename} processed successfully`,
                documentsCreated: documents.length,
                timestamp: new Date().toISOString(),
            };
        },
        {
            params: t.Object({
                filename: t.String(),
            }),
        }
    )
    /**
     * Process all uploaded files
     */
    .post("/process-all", async () => {
        const processor = getFileProcessor();
        const rag = getRAGInstance();

        const files = await processor.listFiles();
        let totalDocuments = 0;

        for (const fileMetadata of files) {
            const documents = await processor.processFile(fileMetadata);
            await rag.addDocuments(documents);
            totalDocuments += documents.length;
        }

        return {
            success: true,
            message: `Processed ${files.length} files`,
            filesProcessed: files.length,
            documentsCreated: totalDocuments,
            timestamp: new Date().toISOString(),
        };
    })
    /**
     * List all uploaded files
     */
    .get("/list", async () => {
        const processor = getFileProcessor();
        const files = await processor.listFiles();

        return {
            files: files.map((f) => ({
                filename: f.filename,
                fileType: f.fileType,
                size: f.size,
                uploadedAt: f.uploadedAt,
            })),
            count: files.length,
            timestamp: new Date().toISOString(),
        };
    })
    /**
     * Delete a file
     */
    .delete(
        "/:filename",
        async ({ params }) => {
            const { filename } = params;
            const processor = getFileProcessor();

            const success = await processor.deleteFile(filename);

            if (!success) {
                return {
                    success: false,
                    error: "Failed to delete file",
                    timestamp: new Date().toISOString(),
                };
            }

            return {
                success: true,
                message: `File ${filename} deleted successfully`,
                timestamp: new Date().toISOString(),
            };
        },
        {
            params: t.Object({
                filename: t.String(),
            }),
        }
    )
    /**
     * Clear all files
     */
    .delete("/", async () => {
        const processor = getFileProcessor();
        const count = await processor.clearAll();

        return {
            success: true,
            message: `Cleared ${count} files`,
            filesDeleted: count,
            timestamp: new Date().toISOString(),
        };
    });
