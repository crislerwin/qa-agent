import { Elysia, t } from "elysia";
import { createConversationalAgent, createWebAgent } from "../../factory/agents.ts";
import { getDefaultModel, ModelPresets } from "../../config/models.ts";

/**
 * Chat routes for conversational agents
 */
export const chatRoutes = new Elysia({ prefix: "/api/chat" })
    /**
     * Simple chat endpoint
     */
    .post(
        "/",
        async ({ body }) => {
            const { message, model } = body;

            // Create agent with specified or default model
            const agentModel = model === "free"
                ? ModelPresets.free()
                : model === "balanced"
                ? ModelPresets.balanced()
                : model === "powerful"
                ? ModelPresets.powerful()
                : getDefaultModel();

            const agent = createConversationalAgent({ model: agentModel });

            // Invoke agent
            const response = await agent.invoke({
                messages: [{ role: "user", content: message }],
            });

            return {
                response: JSON.stringify(response),
                model: model || "default",
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                message: t.String({ minLength: 1 }),
                model: t.Optional(t.Union([
                    t.Literal("free"),
                    t.Literal("balanced"),
                    t.Literal("powerful"),
                ])),
            }),
        }
    )
    /**
     * Web-enabled chat endpoint
     */
    .post(
        "/web",
        async ({ body }) => {
            const { message, model } = body;

            const agentModel = model === "free"
                ? ModelPresets.free()
                : model === "balanced"
                ? ModelPresets.balanced()
                : getDefaultModel();

            const agent = createWebAgent({ model: agentModel });

            const response = await agent.invoke({
                messages: [{ role: "user", content: message }],
            });

            return {
                response: JSON.stringify(response),
                model: model || "default",
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                message: t.String({ minLength: 1 }),
                model: t.Optional(t.Union([
                    t.Literal("free"),
                    t.Literal("balanced"),
                ])),
            }),
        }
    )
    /**
     * Multi-turn conversation endpoint
     */
    .post(
        "/conversation",
        async ({ body }) => {
            const { messages, model } = body;

            const agentModel = model === "free"
                ? ModelPresets.free()
                : model === "balanced"
                ? ModelPresets.balanced()
                : getDefaultModel();

            const agent = createConversationalAgent({ model: agentModel });

            const response = await agent.invoke({
                messages: messages.map((msg) => ({
                    role: msg.role,
                    content: msg.content,
                })),
            });

            return {
                response: JSON.stringify(response),
                messageCount: messages.length,
                timestamp: new Date().toISOString(),
            };
        },
        {
            body: t.Object({
                messages: t.Array(
                    t.Object({
                        role: t.Union([
                            t.Literal("user"),
                            t.Literal("assistant"),
                            t.Literal("system"),
                        ]),
                        content: t.String(),
                    })
                ),
                model: t.Optional(t.Union([
                    t.Literal("free"),
                    t.Literal("balanced"),
                ])),
            }),
        }
    );
