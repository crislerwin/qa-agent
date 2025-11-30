import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { chatRoutes } from "./routes/chat.ts";
import { ragRoutes } from "./routes/rag.ts";
import { toolsRoutes } from "./routes/tools.ts";
import { errorHandler } from "./middleware/error-handler.ts";

/**
 * API Server configuration
 */
export interface APIServerConfig {
    port?: number;
    hostname?: string;
    enableCors?: boolean;
}

/**
 * Create API server with all routes
 */
export function createAPIServer(config: APIServerConfig = {}) {
    const app = new Elysia()
        .use(cors(config.enableCors !== false ? {} : undefined))
        .use(errorHandler)
        .get("/", () => ({
            message: "AI Agents API",
            version: "1.0.0",
            endpoints: {
                chat: "/api/chat",
                rag: "/api/rag",
                tools: "/api/tools",
            },
        }))
        .get("/health", () => ({
            status: "ok",
            timestamp: new Date().toISOString(),
        }))
        .use(chatRoutes)
        .use(ragRoutes)
        .use(toolsRoutes);

    return app;
}

/**
 * Start API server
 */
export function startAPIServer(config: APIServerConfig = {}) {
    const app = createAPIServer(config);

    const port = config.port || parseInt(process.env.API_PORT || "3000");
    const hostname = config.hostname || process.env.API_HOST || "0.0.0.0";

    app.listen({ port, hostname });

    console.log(`🚀 API Server running at http://${hostname}:${port}`);
    console.log(`📚 Health check: http://${hostname}:${port}/health`);

    return app;
}

// Start server when file is run directly
if (import.meta.main) {
    startAPIServer();
}
