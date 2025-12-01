import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock dependencies
const mockQuery = mock(() => Promise.resolve({ rows: [] }));
const mockRelease = mock(() => Promise.resolve());
const mockConnect = mock(() =>
  Promise.resolve({
    query: mockQuery,
    release: mockRelease,
  })
);
const mockEnd = mock(() => Promise.resolve());

// Mock pg module BEFORE importing the class
mock.module("pg", () => {
  return {
    Pool: class {
      connect = mockConnect;
      end = mockEnd;
    },
  };
});

describe("PGVectorRAG", () => {
  let PGVectorRAG: any;

  beforeEach(async () => {
    mockQuery.mockClear();
    mockConnect.mockClear();
    // Dynamic import to ensure mocks are applied
    const module = await import("../src/tools/rag-pgvector.ts");
    PGVectorRAG = module.PGVectorRAG;
  });

  it("should handle missing table error in search", async () => {
    const mockEmbeddings = {
      embedQuery: mock(() => Promise.resolve([0.1, 0.2, 0.3])),
      embedDocuments: mock(() => Promise.resolve([[0.1, 0.2, 0.3]])),
    };

    const rag = new PGVectorRAG({
      embeddings: mockEmbeddings,
    });

    // Mock query to throw missing table error
    mockQuery.mockImplementationOnce(() => {
      const error: any = new Error("relation does not exist");
      error.code = "42P01";
      throw error;
    });

    const results = await rag.search("test query");
    expect(results).toEqual([]);
  });

  it("should throw other errors in search", async () => {
    const mockEmbeddings = {
      embedQuery: mock(() => Promise.resolve([0.1, 0.2, 0.3])),
      embedDocuments: mock(() => Promise.resolve([[0.1, 0.2, 0.3]])),
    };

    const rag = new PGVectorRAG({
      embeddings: mockEmbeddings,
    });

    // Mock query to throw generic error
    mockQuery.mockImplementationOnce(() => {
      throw new Error("Generic DB error");
    });

    expect(rag.search("test query")).rejects.toThrow("Generic DB error");
  });
});
