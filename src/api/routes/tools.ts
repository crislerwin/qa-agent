import { Elysia, t } from "elysia";
import { getDefaultModel } from "../../config/models.ts";

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
      const { query } = body;

      // Import at runtime to avoid circular dependencies
      const { createWebAgent } = await import("../../factory/agents.ts");

      // Use default model from environment to prevent users from selecting expensive models
      const agent = createWebAgent({ model: getDefaultModel() });

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
      }),
    }
  );
