import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlaceEmbedding,
  cosineSimilarity,
  normalizeEmbedding,
  topEmbeddingEntry,
} from "../src/utils/embedding.js";

describe("buildPlaceEmbedding", () => {
  it("sets primary type to 1.0", () => {
    const emb = buildPlaceEmbedding({ type: "gym", tags: [] });
    assert.equal(emb.gym, 1.0);
  });

  it("maps tags to dimensions and clamps at 1.0", () => {
    const emb = buildPlaceEmbedding({
      type: "gym",
      tags: ["weights", "cardio"],
    });
    assert.equal(emb.gym, 1.0);
    assert.ok((emb.gym ?? 0) <= 1.0);
  });

  it("adds indoor and outdoor signals", () => {
    assert.equal(buildPlaceEmbedding({ type: "park", isIndoor: true }).indoor, 0.7);
    assert.ok(buildPlaceEmbedding({ type: "park", isIndoor: false }).outdoor >= 0.5);
  });
});

describe("cosineSimilarity", () => {
  it("returns 0 for missing vectors", () => {
    assert.equal(cosineSimilarity(null, { gym: 1 }), 0);
    assert.equal(cosineSimilarity({ gym: 1 }, null), 0);
  });

  it("returns 1 for identical non-zero vectors", () => {
    const v = { gym: 0.8, coffee: 0.2 };
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-6);
  });

  it("returns 0 for orthogonal vectors", () => {
    assert.equal(cosineSimilarity({ gym: 1 }, { coffee: 1 }), 0);
  });
});

describe("normalizeEmbedding", () => {
  it("scales max dimension to 1", () => {
    const out = normalizeEmbedding({ gym: 2, coffee: 1 });
    assert.equal(out.gym, 1);
    assert.equal(out.coffee, 0.5);
  });

  it("returns empty object for zero vector", () => {
    assert.deepEqual(normalizeEmbedding({ gym: 0 }), {});
  });
});

describe("topEmbeddingEntry", () => {
  it("picks highest dimension", () => {
    const { topEmbeddingType, embeddingStrength } = topEmbeddingEntry({
      gym: 0.3,
      coffee: 0.9,
    });
    assert.equal(topEmbeddingType, "coffee");
    assert.equal(embeddingStrength, 0.9);
  });
});
