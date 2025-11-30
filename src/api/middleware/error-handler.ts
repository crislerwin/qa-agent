import { Elysia } from "elysia";

/**
 * Error handler middleware
 */
export const errorHandler = new Elysia()
    .onError(({ code, error, set }) => {
        console.error("API Error:", error);

        // Handle different error types
        if (code === "VALIDATION") {
            set.status = 400;
            return {
                error: "Validation Error",
                message: error.message,
            };
        }

        if (code === "NOT_FOUND") {
            set.status = 404;
            return {
                error: "Not Found",
                message: "The requested resource was not found",
            };
        }

        // Default error response
        set.status = 500;
        return {
            error: "Internal Server Error",
            message: error instanceof Error ? error.message : "An unexpected error occurred",
        };
    });
