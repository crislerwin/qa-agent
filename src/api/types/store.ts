import type { Span } from "@opentelemetry/api";

/**
 * Extended store type for Elysia request context
 * Contains request metadata and trace information
 */
export interface RequestStore {
    startTime?: number;
    correlationId?: string;
    traceId?: string | null;
    spanId?: string | null;
    span?: Span;
}
