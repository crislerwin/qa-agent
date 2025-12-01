import { describe, expect, it, mock } from "bun:test";
import { clusterSemanticChunking } from "../src/utils/chunking.ts";
import type { Embeddings } from "@langchain/core/embeddings";

describe("Cluster Semantic Chunking", () => {
  // Mock embeddings that returns random vectors
  const mockEmbeddings = {
    embedDocuments: async (texts: string[]) => {
      return texts.map(() => Array(1536).fill(0).map(Math.random));
    },
    embedQuery: async (text: string) => {
      return Array(1536).fill(0).map(Math.random);
    },
  } as unknown as Embeddings;

  // Mock embeddings with predictable similarity
  // We'll use 2D vectors for simplicity in testing logic
  const predictableEmbeddings = {
    embedDocuments: async (texts: string[]) => {
      return texts.map((text) => {
        if (text.includes("apple")) return [1, 0]; // Topic A
        if (text.includes("banana")) return [0.9, 0.1]; // Topic A (close)
        if (text.includes("car")) return [0, 1]; // Topic B
        if (text.includes("truck")) return [0.1, 0.9]; // Topic B (close)
        return [0.5, 0.5]; // Neutral
      });
    },
    embedQuery: async () => [0, 0],
  } as unknown as Embeddings;

  it("should return empty array for empty text", async () => {
    const chunks = await clusterSemanticChunking("", mockEmbeddings);
    expect(chunks).toEqual([]);
  });

  it("should chunk simple text", async () => {
    const text = "This is a simple sentence.";
    const chunks = await clusterSemanticChunking(text, mockEmbeddings);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toBe(text);
  });

  it("should group semantically similar sentences", async () => {
    const text = "I like apple. I like banana. I drive a car. I drive a truck.";
    // Expected: [ "I like apple. I like banana.", "I drive a car. I drive a truck." ]
    // Note: The algorithm might group differently based on exact params, but we expect some grouping.

    const chunks = await clusterSemanticChunking(
      text,
      predictableEmbeddings,
      100, // maxChunkSize
      10 // atomSize
    );

    console.log("Chunks:", chunks);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toContain("apple");
    expect(chunks[0]).toContain("banana");
    expect(chunks[1]).toContain("car");
    expect(chunks[1]).toContain("truck");
  });

  it("should respect maxChunkSize", async () => {
    const text = "Sentence one. Sentence two. Sentence three. Sentence four.";
    // Force small chunks
    const chunks = await clusterSemanticChunking(
      text,
      mockEmbeddings,
      10, // maxChunkSize (very small)
      5 // atomSize
    );

    expect(chunks.length).toBe(4); // Should split every sentence
  });
});
