/**
 * OpenTelemetry Configuration
 *
 * Sets up distributed tracing for:
 * - HTTP requests (Elysia server)
 * - Database queries (PostgreSQL/Drizzle)
 * - Redis operations
 * - Custom application spans
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { createLogger } from "../utils/logger";

const logger = createLogger("telemetry");

/**
 * OpenTelemetry configuration from environment variables
 */
interface TelemetryConfig {
    enabled: boolean;
    serviceName: string;
    serviceVersion: string;
    environment: string;
    otlpEndpoint: string;
    logLevel: DiagLogLevel;
}

/**
 * Get telemetry configuration from environment
 */
function getTelemetryConfig(): TelemetryConfig {
    return {
        enabled: process.env.OTEL_ENABLED === "true",
        serviceName: process.env.OTEL_SERVICE_NAME || "agentforge-api",
        serviceVersion: process.env.OTEL_SERVICE_VERSION || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        otlpEndpoint:
            process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
            "http://localhost:4318/v1/traces",
        logLevel:
            process.env.OTEL_LOG_LEVEL === "debug"
                ? DiagLogLevel.DEBUG
                : DiagLogLevel.INFO,
    };
}

/**
 * Initialize OpenTelemetry SDK
 */
export function initTelemetry(): NodeSDK | null {
    const config = getTelemetryConfig();

    // Skip initialization if telemetry is disabled
    if (!config.enabled) {
        logger.info(
            "OpenTelemetry is disabled (set OTEL_ENABLED=true to enable)",
        );
        return null;
    }

    logger.info("Initializing OpenTelemetry");
    logger.info(`Service: ${config.serviceName}`);
    logger.info(`Version: ${config.serviceVersion}`);
    logger.info(`Environment: ${config.environment}`);
    logger.info(`Endpoint: ${config.otlpEndpoint}`);

    // Enable diagnostic logging for debugging
    if (config.logLevel === DiagLogLevel.DEBUG) {
        diag.setLogger(new DiagConsoleLogger(), config.logLevel);
    }

    // Define service resource
    const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: config.serviceVersion,
        "deployment.environment": config.environment,
    });

    // Configure OTLP exporter
    const traceExporter = new OTLPTraceExporter({
        url: config.otlpEndpoint,
        headers: {
            // Add custom headers if needed (e.g., API keys)
            ...(process.env.OTEL_EXPORTER_OTLP_HEADERS
                ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
                : {}),
        },
    });

    // Initialize SDK with auto-instrumentations
    const sdk = new NodeSDK({
        resource,
        traceExporter,
        instrumentations: [
            // Auto-instrumentation for common libraries
            getNodeAutoInstrumentations({
                // Disable default HTTP instrumentation (we'll use custom one)
                "@opentelemetry/instrumentation-http": {
                    enabled: false,
                },
                "@opentelemetry/instrumentation-fs": {
                    enabled: false, // Disable filesystem instrumentation (too noisy)
                },
            }),

            // Custom HTTP instrumentation with better configuration
            new HttpInstrumentation({
                ignoreIncomingRequestHook: (req) => {
                    // Ignore health check endpoints
                    const url = req.url || "";
                    return url.includes("/health") || url.includes("/metrics");
                },
                requestHook: (span, request) => {
                    // Add custom attributes to HTTP spans
                    span.setAttribute(
                        "http.client_ip",
                        request.socket?.remoteAddress || "unknown",
                    );
                },
            }),

            // PostgreSQL instrumentation
            new PgInstrumentation({
                enhancedDatabaseReporting: true,
                requestHook: (span, queryConfig) => {
                    // Add database name and query info
                    if (queryConfig && typeof queryConfig === "object") {
                        span.setAttribute(
                            "db.statement",
                            queryConfig.query.text || "",
                        );
                    }
                },
            }),

            // Redis instrumentation
            new IORedisInstrumentation({
                dbStatementSerializer: (cmdName, cmdArgs) => {
                    // Serialize Redis commands for tracing
                    return `${cmdName} ${cmdArgs.slice(0, 2).join(" ")}`;
                },
            }),
        ],
    });

    // Start the SDK
    sdk.start();
    logger.success("OpenTelemetry initialized successfully");

    // Graceful shutdown
    process.on("SIGTERM", () => {
        sdk.shutdown()
            .then(() => logger.info("OpenTelemetry shut down successfully"))
            .catch((error) =>
                logger.error("Error shutting down OpenTelemetry", error),
            )
            .finally(() => process.exit(0));
    });

    return sdk;
}

/**
 * Export singleton instance
 */
let sdkInstance: NodeSDK | null = null;

export function getOrInitTelemetry(): NodeSDK | null {
    if (!sdkInstance) {
        sdkInstance = initTelemetry();
    }
    return sdkInstance;
}
