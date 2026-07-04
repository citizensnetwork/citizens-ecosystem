import { describe, it, expect, afterEach, vi } from "vitest";
import {
  cosineSimilarity,
  isEmbeddingEnabled,
  maybeEmbedDoc,
  maybeEmbedQuery,
} from "@/lib/aiSearchEmbeddings";

describe("aiSearchEmbeddings (Phase 2 stub)", () => {
  const envBackup = { ...process.env };
  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it("is disabled by default", () => {
    delete process.env.CC_ENABLE_EMBEDDINGS;
    delete process.env.OPENAI_API_KEY;
    expect(isEmbeddingEnabled()).toBe(false);
  });

  it("stays disabled with only one env var set", () => {
    process.env.CC_ENABLE_EMBEDDINGS = "1";
    delete process.env.OPENAI_API_KEY;
    expect(isEmbeddingEnabled()).toBe(false);

    delete process.env.CC_ENABLE_EMBEDDINGS;
    process.env.OPENAI_API_KEY = "sk-test";
    expect(isEmbeddingEnabled()).toBe(false);
  });

  it("maybeEmbedQuery + maybeEmbedDoc return null when disabled", async () => {
    expect(await maybeEmbedQuery("hello")).toBeNull();
    expect(await maybeEmbedDoc("world")).toBeNull();
  });

  it("cosineSimilarity returns 1 for identical unit vectors", () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("cosineSimilarity returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("cosineSimilarity returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity(new Float32Array([1]), new Float32Array([1, 0]))).toBe(0);
  });
});
