import { Elysia, t } from "elysia";
import { ModelPresets } from "../../config/models.ts";

/**
 * Tools routes for task automation
 */
export const toolsRoutes = new Elysia({ prefix: "/api/tools" })
    /**
     * Web search
     */
    .post(
        "/search",
        async ({ body }) => {
            const { query, model } = body;

            // Import at runtime to avoid circular dependencies
            const { createWebAgent } = await import("../../factory/agents.ts");

            const agentModel =
                model === "free" ? ModelPresets.free() : ModelPresets.free();

            const agent = createWebAgent({ model: agentModel });

            const response = await agent.invoke({
                messages: [
                    { role: "user", content: `Search the web for: ${query}` },
                ],
            });

            return {
                response: JSON.stringify(response),
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                query: t.String({ minLength: 1 }),
                model: t.Optional(t.Literal("free")),
            }),
        },
    );
