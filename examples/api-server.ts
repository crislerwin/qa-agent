/**
 * API Server Example
 * Starts the Elysia API server with all endpoints
 */

import { startAPIServer } from "../src/api/server.ts";

// Start server on port 3000
startAPIServer({
    port: 3000,
    hostname: "0.0.0.0",
    enableCors: true,
});

console.log("\nAvailable endpoints:");
console.log("  GET  /           - API info");
console.log("  GET  /health     - Health check");
console.log("  POST /api/chat   - Simple chat");
console.log("  POST /api/chat/web - Web-enabled chat");
console.log("  POST /api/chat/conversation - Multi-turn conversation");
console.log("  POST /api/rag/documents - Add documents to knowledge base");
console.log("  POST /api/rag/search - Search knowledge base");
console.log("  POST /api/rag/chat - Chat with RAG agent");
console.log("  DELETE /api/rag/documents - Clear knowledge base");
console.log("  POST /api/tools/meeting - Schedule a meeting");
console.log("  POST /api/tools/availability - Check availability");
console.log("  POST /api/tools/search - Web search");
