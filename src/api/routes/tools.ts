import { Elysia, t } from "elysia";
import { createTaskAgent } from "../../factory/agents.ts";
import { ModelPresets } from "../../config/models.ts";

/**
 * Tools routes for task automation
 */
export const toolsRoutes = new Elysia({ prefix: "/api/tools" })
    /**
     * Schedule a meeting
     */
    .post(
        "/meeting",
        async ({ body }) => {
            const { title, dateTime, duration, attendees, model } = body;

            const agentModel = model === "free"
                ? ModelPresets.free()
                : ModelPresets.free();

            const agent = createTaskAgent({ model: agentModel });

            const message = `Schedule a meeting:
Title: ${title}
Date/Time: ${dateTime}
Duration: ${duration} minutes
Attendees: ${attendees.join(", ")}`;

            const response = await agent.invoke({
                messages: [{ role: "user", content: message }],
            });

            return {
                response: JSON.stringify(response),
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                title: t.String({ minLength: 1 }),
                dateTime: t.String(),
                duration: t.Number({ minimum: 15, maximum: 480 }),
                attendees: t.Array(t.String()),
                model: t.Optional(t.Literal("free")),
            }),
        }
    )
    /**
     * Check calendar availability
     */
    .post(
        "/availability",
        async ({ body }) => {
            const { startDate, endDate, model } = body;

            const agentModel = model === "free"
                ? ModelPresets.free()
                : ModelPresets.free();

            const agent = createTaskAgent({ model: agentModel });

            const message = `Check my calendar availability from ${startDate} to ${endDate}`;

            const response = await agent.invoke({
                messages: [{ role: "user", content: message }],
            });

            return {
                response: JSON.stringify(response),
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                startDate: t.String(),
                endDate: t.String(),
                model: t.Optional(t.Literal("free")),
            }),
        }
    )
    /**
     * Web search
     */
    .post(
        "/search",
        async ({ body }) => {
            const { query, model } = body;

            // Import at runtime to avoid circular dependencies
            const { createWebAgent } = await import("../../factory/agents.ts");

            const agentModel = model === "free"
                ? ModelPresets.free()
                : ModelPresets.free();

            const agent = createWebAgent({ model: agentModel });

            const response = await agent.invoke({
                messages: [{ role: "user", content: `Search the web for: ${query}` }],
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
        }
    );
