/**
 * OpenTelemetry Configuration for Bun/Elysia
 *
 * Sets up distributed tracing for:
 * - HTTP requests (Elysia server)
 * - Custom application spans
 */

import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
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
}

/**
 * Get telemetry configuration from environment
 */
export function getTelemetryConfig(): TelemetryConfig {
    return {
        enabled: process.env.OTEL_ENABLED === "true",
        serviceName: process.env.OTEL_SERVICE_NAME || "agentforge-api",
        serviceVersion: process.env.OTEL_SERVICE_VERSION || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        otlpEndpoint:
            process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
            "http://localhost:4318/v1/traces",
    };
}

/**
 * Create OpenTelemetry configuration for Elysia plugin
 */
export function createTelemetryConfig() {
    const config = getTelemetryConfig();

    // Skip if telemetry is disabled
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

    // Configure OTLP exporter
    const traceExporter = new OTLPTraceExporter({
        url: config.otlpEndpoint,
        headers: {
            "Content-Type": "application/json",
            // Add custom headers if needed (e.g., API keys)
            ...(process.env.OTEL_EXPORTER_OTLP_HEADERS
                ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
                : {}),
        },
    });

    // Span Processor using BatchSpanProcessor for better performance
    const spanProcessor = new BatchSpanProcessor(traceExporter, {
        // Export every 5 seconds or when 512 spans are queued
        scheduledDelayMillis: 5000,
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
    });

    // Define service resource
    const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: config.serviceVersion,
        "deployment.environment": config.environment,
    });

    logger.success("OpenTelemetry configured successfully");

    return {
        serviceName: config.serviceName,
        spanProcessors: [spanProcessor],
        resource,
    };
}
