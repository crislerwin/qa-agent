import { describe, it, expect, mock, beforeAll, afterAll } from "bun:test";

// Mock the shared instances before importing routes
// This is tricky with Bun's module caching and how Elysia works
// So we'll try to mock the dependencies that the route uses

const mockSearch = mock(() =>
  Promise.resolve([{ pageContent: "Test content", metadata: { score: 0.9 } }])
);

const mockAddDocuments = mock(() => Promise.resolve());
const mockClear = mock(() => Promise.resolve());

// Mock the PGVectorRAG class
mock.module("../src/tools/rag-pgvector.ts", () => {
  return {
    PGVectorRAG: class {
      search = mockSearch;
      addDocuments = mockAddDocuments;
      clear = mockClear;
      createSearchTool = () => ({
        name: "search_knowledge_base",
        description: "Mock search tool",
        schema: {},
        func: async () => "Mock result",
      });
      createAddDocumentTool = () => ({
        name: "add_to_knowledge_base",
        description: "Mock add tool",
        schema: {},
        func: async () => "Mock result",
      });
    },
    createDocuments: (texts: string[], metadata: any[]) => [],
  };
});

// Mock the shared instances
mock.module("../src/api/shared-instances.ts", () => {
  return {
    getRAGInstance: () =>
      new (require("../src/tools/rag-pgvector.ts").PGVectorRAG)(),
  };
});

// Mock the agents factory
mock.module("../src/factory/agents.ts", () => {
  return {
    createRAGAgent: () => ({
      invoke: async () => ({
        output: "Hello! I am a mocked agent.",
        // LangChain agents usually return { output: ... } or just the string depending on configuration
        // But the route expects `response` from `agent.invoke`.
        // In `rag.ts`: `const response = await agent.invoke(...)`
        // And it returns `response`.
        // If the agent returns a string, `response` is a string.
        // If it returns an object, `response` is an object.
        // Let's return a simple object.
        messages: [{ content: "Hello!" }],
      }),
    }),
    ModelPresets: {
      free: () => ({}),
      balanced: () => ({}),
    },
  };
});

// Now import the app
import { ragRoutes } from "../src/api/routes/rag.ts";

describe("RAG API Tests", () => {
  it("POST /api/rag/chat should return proper JSON", async () => {
    const response = await ragRoutes.handle(
      new Request("http://localhost/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello", model: "free" }),
      })
    );

    if (response.status !== 200) {
      console.log("Response status:", response.status);
      console.log("Response body:", await response.text());
    }
    expect(response.status).toBe(200);
    const data = (await response.json()) as any;

    // Verify response structure
    expect(data).toBeObject();
    expect(data.response).toBeObject();
    expect(data.response.output).toBe("Hello! I am a mocked agent.");
    expect(data.response.messages).toBeArray();
    expect(data.response.messages[0].content).toBe("Hello!");
    expect(data.timestamp).toBeString();

    // Explicitly check that it is NOT a stringified JSON
    expect(typeof data.response).not.toBe("string");
  });
});
