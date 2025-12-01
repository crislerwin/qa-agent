import { encode } from "gpt-tokenizer";
import type { Embeddings } from "@langchain/core/embeddings";

/**
 * Helper: Calculate Dot Product (Cosine Similarity for normalized vectors)
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  return vecA.reduce((sum, val, i) => sum + val * (vecB[i] ?? 0), 0);
}

/**
 * Cluster Semantic Chunking
 * Globally optimizes chunk boundaries using Dynamic Programming to maximize
 * the semantic density of each chunk.
 */
export async function clusterSemanticChunking(
  text: string,
  embeddings: Embeddings,
  maxChunkSize: number = 400,
  atomSize: number = 50
): Promise<string[]> {
  if (!text || !text.trim()) return [];

  // Step 1: Pre-split text into small "atomic" pieces
  const rawSentences = text.match(/[^.!?]+[.!?]+[\])'"]?/g) || [text];
  let atoms: string[] = [];
  let currentAtom = "";

  for (const sentence of rawSentences) {
    if (encode(currentAtom + sentence).length > atomSize && currentAtom) {
      atoms.push(currentAtom.trim());
      currentAtom = sentence;
    } else {
      currentAtom += " " + sentence;
    }
  }
  if (currentAtom) atoms.push(currentAtom.trim());

  if (atoms.length === 0) return [];

  // Step 2: Embed all atoms
  const atomEmbeddings = await embeddings.embedDocuments(atoms);

  // Step 3: Compute Similarity Matrix
  const n = atoms.length;
  const simMatrix: number[][] = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const vecA = atomEmbeddings[i];
      const vecB = atomEmbeddings[j];

      if (vecA && vecB) {
        const sim = cosineSimilarity(vecA, vecB);
        const rowI = simMatrix[i];
        if (rowI) rowI[j] = sim;

        const rowJ = simMatrix[j];
        if (rowJ) rowJ[i] = sim;
      }
    }
  }

  // Step 4: Dynamic Programming for Optimal Splitting
  const dp: number[] = Array(n + 1).fill(-Infinity);
  const splitIndex: number[] = Array(n + 1).fill(0);

  dp[0] = 0;

  for (let i = 1; i <= n; i++) {
    let currentChunkTokenCount = 0;

    for (let j = i - 1; j >= 0; j--) {
      const atomText = atoms[j];
      if (!atomText) continue;

      const atomTokens = encode(atomText).length;

      currentChunkTokenCount += atomTokens;

      if (currentChunkTokenCount > maxChunkSize) {
        break;
      }

      let sumSimilarity = 0;
      let pairCount = 0;
      for (let x = j; x < i; x++) {
        for (let y = x; y < i; y++) {
          sumSimilarity += simMatrix[x]?.[y] ?? 0;
          pairCount++;
        }
      }

      const chunkScore = pairCount > 0 ? sumSimilarity / pairCount : 0;
      const totalScore = (dp[j] ?? -Infinity) + chunkScore;

      if (totalScore > (dp[i] ?? -Infinity)) {
        dp[i] = totalScore;
        splitIndex[i] = j;
      }
    }
  }

  // Step 5: Reconstruct Chunks
  const chunks: string[] = [];
  let curr = n;
  while (curr > 0) {
    const start = splitIndex[curr];
    if (start === undefined) break;

    const chunkText = atoms.slice(start, curr).join(" ");
    chunks.unshift(chunkText);
    curr = start;
  }

  return chunks;
}

/**
 * Simple text splitter for chunking documents
 * Kept for backward compatibility or fallback
 */
export function splitText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;

    if (start >= text.length - overlap) break;
  }

  return chunks;
}
