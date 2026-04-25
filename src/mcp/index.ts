import { TestingAgentMCPServer } from "./server.ts";

async function main() {
  const mcpServer = new TestingAgentMCPServer();

  // Graceful shutdown handlers (before start so SIGINT can interrupt)
  process.on("SIGINT", async () => {
    await mcpServer.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await mcpServer.stop();
    process.exit(0);
  });

  await mcpServer.start();
}

main().catch((err) => {
  console.error("MCP server fatal error:", err);
  process.exit(1);
});

