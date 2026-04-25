import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  type TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOL_DEFINITIONS } from "./tools/definitions.ts";
import { handleRunExploratoryTest } from "./tools/exploratory.ts";
import { handleGetTestStatus, handleStopTest } from "./tools/status.ts";
import { handleListSessions } from "./tools/sessions.ts";
import { handleTestReportResource } from "./resources/reports.ts";
import { createLogger } from "../utils/logger.ts";
import type { TestExecution } from "./types.ts";

const logger = createLogger("mcp-server");

/**
 * Map of active/running test executions keyed by sessionId.
 */
export const activeTests = new Map<string, TestExecution>();

export class TestingAgentMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "qa-agent-testing",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // ── Tools ──────────────────────────────────────────
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      logger.info(`Tool called: ${toolName} with args ${JSON.stringify(args)}`);

      try {
        switch (toolName) {
          case "run_exploratory_test":
            return await handleRunExploratoryTest(
              args as {
                baseUrl: string;
                maxSteps?: number;
                mode?: string;
                sessionId?: string;
              },
            );

          case "run_single_page_test": {
            const sessionId =
              (args.sessionId as string) || `sp-${Date.now()}`;
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      sessionId,
                      status: "not_implemented",
                      message:
                        "Single-page test tool is not yet implemented. Use run_exploratory_test instead.",
                    },
                    null,
                    2,
                  ),
                } as TextContent,
              ],
            };
          }

          case "get_test_status":
            return await handleGetTestStatus(args as { sessionId: string });

          case "stop_test":
            return await handleStopTest(args as { sessionId: string });

          case "list_sessions":
            return await handleListSessions(
              args as { status?: string; limit?: number },
            );

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${toolName}`,
            );
        }
      } catch (error: any) {
        logger.error(`Tool ${toolName} failed: ${error.message}`);
        throw new McpError(
          ErrorCode.InternalError,
          error.message || String(error),
        );
      }
    });

    // ── Resources ──────────────────────────────────────
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "test-report://latest",
          name: "Latest Test Report",
          mimeType: "text/markdown",
          description: "The most recent test report generated",
        },
        {
          uri: "test-report://{sessionId}",
          name: "Test Report by Session",
          mimeType: "text/markdown",
          description: "Markdown test report for a given sessionId",
        },
      ],
    }));

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const uri = request.params.uri;
        if (uri.startsWith("test-report://")) {
          return await handleTestReportResource(uri);
        }
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Unknown resource URI: ${uri}`,
        );
      },
    );
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.log("MCP Server connected via stdio transport");
  }

  async stop() {
    await this.server.close();
    logger.log("MCP Server stopped");
  }
}
