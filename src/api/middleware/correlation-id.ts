import type { Elysia } from "elysia";
import { getCurrentSpan, setAttributes } from "@elysiajs/opentelemetry";
import { randomUUID } from "crypto";
import type { RequestStore } from "../types/store";

/**
 * Correlation ID middleware
 *
 * Features:
 * - Extracts or generates correlation IDs for request tracking
 * - Integrates with OpenTelemetry to get trace ID and span ID
 * - Adds trace information to response headers
 * - Makes trace context available throughout the request lifecycle
 */
export const correlationId = (app: Elysia) => {
    return app
        .onRequest(({ request, store }) => {
            const typedStore = store as RequestStore;

            // Extract correlation ID from headers or generate a new one
            const correlationId =
                request.headers.get("x-correlation-id") ||
                request.headers.get("x-request-id") ||
                randomUUID();

            // Store correlation ID
            typedStore.correlationId = correlationId;
        })
        .onAfterHandle(({ set, store }) => {
            const typedStore: RequestStore = store;

            // Get OpenTelemetry trace context from the active span
            // (created automatically by @elysiajs/opentelemetry plugin)
            const span = getCurrentSpan();

            const spanContext = span?.spanContext();

            // Store trace IDs
            typedStore.traceId = spanContext?.traceId || null;
            typedStore.spanId = spanContext?.spanId || null;

            // Add correlation ID to the active span attributes
            if (span) {
                setAttributes({
                    "correlation.id": typedStore.correlationId || "",
                    "http.request_id": typedStore.correlationId || "",
                });
            }

            // Add trace information to response headers
            const { correlationId, traceId, spanId } = typedStore;

            if (!set.headers) {
                set.headers = {};
            }

            // Add correlation/request ID
            if (correlationId) {
                set.headers["X-Correlation-ID"] = correlationId;
                set.headers["X-Request-ID"] = correlationId;
            }

            // Add OpenTelemetry trace ID and span ID
            if (traceId) {
                set.headers["X-Trace-ID"] = traceId;
            }

            if (spanId) {
                set.headers["X-Span-ID"] = spanId;
            }

            // Add traceparent header for W3C Trace Context propagation
            if (traceId && spanId) {
                set.headers["traceparent"] = `00-${traceId}-${spanId}-01`;
            }
        });
};

/**
 * Helper function to get correlation ID from request store
 */
export function getCorrelationId(store: RequestStore): string | null {
    return store.correlationId || null;
}

/**
 * Helper function to get trace ID from request store
 */
export function getTraceId(store: RequestStore): string | null {
    return store.traceId || null;
}

/**
 * Helper function to get all trace context
 */
export function getTraceContext(store: RequestStore): {
    correlationId: string | null;
    traceId: string | null;
    spanId: string | null;
} {
    return {
        correlationId: store.correlationId || null,
        traceId: store.traceId || null,
        spanId: store.spanId || null,
    };
}
