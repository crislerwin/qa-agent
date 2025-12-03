import type { Elysia } from "elysia";
import { createLogger } from "../../utils/logger.ts";

const logger = createLogger("request");

/**
 * Request logging middleware
 * Logs incoming requests with origin, IP, method, path, and response time
 */
export const requestLogger = (app: Elysia) => {
  return app
    .onRequest(({ request, store }) => {
      // Store request start time
      (store as any).startTime = Date.now();
    })
    .onAfterHandle(({ request, set, store }) => {
      const startTime = (store as any).startTime || Date.now();
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

      // Log the request
      logger.info({
        type: "request",
        method,
        path,
        origin,
        ip,
        userAgent,
        status: set.status || 200,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
    });
};
