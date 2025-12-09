import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { createTelemetryConfig } from "../config/telemetry.ts";
import { chatRoutes } from "./routes/chat.ts";
import { ragRoutes } from "./routes/rag.ts";
import { toolsRoutes } from "./routes/tools.ts";
import { fileRoutes } from "./routes/files.ts";
import { scraperRoutes } from "./routes/scraper.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { requestLogger } from "./middleware/request-logger.ts";
import { correlationId } from "./middleware/correlation-id.ts";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("server");

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
    const app = new Elysia();

    // Setup OpenTelemetry tracing
    const telemetryConfig = createTelemetryConfig();
    if (telemetryConfig) {
        app.use(opentelemetry(telemetryConfig));
    }

    // IP Whitelisting Middleware
    app.onRequest(({ request, set }) => {
        const allowedIps = process.env.ALLOWED_IPS?.split(",").filter(Boolean);
        if (allowedIps && allowedIps.length > 0) {
            const clientIP = app.server?.requestIP(request)?.address;

            // Check if IP is allowed
            // Note: In Docker/Reverse Proxy scenarios, you might need to check X-Forwarded-For
            // But for direct connection or simple setups, requestIP works.
            // We also check X-Forwarded-For as a fallback/alternative if needed.
            const forwardedFor = request.headers.get("x-forwarded-for");
            const ip =
                clientIP ||
                (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null);

            if (ip && !allowedIps.includes(ip)) {
                logger.warn(`Blocked request from unauthorized IP: ${ip}`);
                set.status = 403;
                return "Forbidden: IP not allowed";
            }
        }
    });

    app.use(
        swagger({
            exclude: ["/"],
            documentation: {
                info: {
                    title: "AI Agents API",
                    version: "1.0.0",
                    description: "API for AI Agents Boilerplate",
                },
            },
        }),
    )
        .use(
            cors({
                origin: process.env.CORS_ORIGINS
                    ? process.env.CORS_ORIGINS.split(",")
                    : true,
                ...(config.enableCors !== false ? {} : { origin: false }),
            }),
        )
        .use(correlationId)
        .use(requestLogger)
        .use(errorHandler)
        .get("/", () => ({
            message: "AI Agents API",
            version: "1.0.0",
            endpoints: {
                chat: "/api/chat",
                rag: "/api/rag",
                tools: "/api/tools",
                files: "/api/files",
                scraper: "/api/scraper",
            },
        }))
        .get("/health", () => ({
            status: "ok",
            timestamp: new Date().toISOString(),
        }))
        .use(chatRoutes)
        .use(ragRoutes)
        .use(toolsRoutes)
        .use(fileRoutes)
        .use(scraperRoutes);

    return app;
}

/**
 * Start API server
 */
export function startAPIServer(config: APIServerConfig = {}) {
    const app = createAPIServer(config);

    const port = config.port || parseInt(process.env.API_PORT || "8000");
    const hostname = config.hostname || process.env.API_HOST || "0.0.0.0";

    app.listen({ port, hostname });

    logger.log(`🚀 API Server running at http://${hostname}:${port}`);
    logger.log(`📚 Health check: http://${hostname}:${port}/health`);

    return app;
}

// Start server when file is run directly
if (import.meta.main) {
    startAPIServer();
}
