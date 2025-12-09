import type { Elysia } from "elysia";
import { createLogger } from "../../utils/logger.ts";
import type { RequestStore } from "../types/store";

const logger = createLogger("request");

/**
 * Request logging middleware
 * Logs incoming requests with origin, IP, method, path, response time, and trace information
 */
export const requestLogger = (app: Elysia) => {
  return app
    .onRequest(({ store }) => {
      const typedStore = store as RequestStore;
      // Store request start time
      typedStore.startTime = Date.now();
    })
    .onAfterHandle(({ request, set, store }) => {
      const typedStore = store as RequestStore;
      const startTime = typedStore.startTime || Date.now();
      const duration = Date.now() - startTime;

      // Extract request metadata
      const method = request.method;
      const url = new URL(request.url);
      const path = url.pathname;
      const origin =
        request.headers.get("origin") ||
        request.headers.get("referer") ||
        "unknown";
      const userAgent = request.headers.get("user-agent") || "unknown";
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown";

      // Extract trace information
      const { correlationId, traceId, spanId } = typedStore;

      // Log the request with trace information
      logger.info({
        type: "request",
        method,
        path,
        origin,
        ip,
        userAgent,
        status: set.status || 200,
        duration: `${duration}ms`,
        correlationId,
        traceId,
        spanId,
        timestamp: new Date().toISOString(),
      });
    });
};
