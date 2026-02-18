import { describe, expect, test } from "bun:test";
import {
  computeCompatibility,
  findSharedInterests,
  generateOpener,
} from "../src/matching/compatibility.js";
import { DIMENSION_COUNT } from "../src/types.js";

function makeEmbedding(fill: number): number[] {
  return new Array(DIMENSION_COUNT).fill(fill);
}

function makeEmbeddingWith(overrides: Record<number, number>): number[] {
  const arr = new Array(DIMENSION_COUNT).fill(0);
  for (const [i, v] of Object.entries(overrides)) {
    arr[Number(i)] = v;
  }
  return arr;
}

describe("cosineSimilarity (via computeCompatibility)", () => {
  test("identical vectors → score 1.0", () => {
    const a = makeEmbedding(0.5);
    const result = computeCompatibility(a, a);
    expect(result.overall_score).toBeCloseTo(1.0, 5);
  });

  test("opposite vectors → score 0.0", () => {
    const a = makeEmbedding(0.5);
    const b = a.map((v) => -v);
    const result = computeCompatibility(a, b);
    expect(result.overall_score).toBeCloseTo(0.0, 5);
  });

  test("orthogonal vectors → score 0.5", () => {
    const a = new Array(DIMENSION_COUNT).fill(0);
    const b = new Array(DIMENSION_COUNT).fill(0);
    // First half non-zero for a, second half for b
    for (let i = 0; i < 25; i++) a[i] = 0.5;
    for (let i = 25; i < 50; i++) b[i] = 0.5;
    const result = computeCompatibility(a, b);
    expect(result.overall_score).toBeCloseTo(0.5, 5);
  });

  test("zero vector → score 0 (not NaN)", () => {
    const a = makeEmbedding(0);
    const b = makeEmbedding(0.5);
    const result = computeCompatibility(a, b);
    expect(result.overall_score).toBe(0);
    expect(Number.isNaN(result.overall_score)).toBe(false);
  });
});

describe("per-group scores", () => {
  test("personality sub-vector similarity computed correctly", () => {
    // Similar personality (indices 0-9), opposite values (10-19)
    const a = new Array(DIMENSION_COUNT).fill(0);
    const b = new Array(DIMENSION_COUNT).fill(0);
    for (let i = 0; i < 10; i++) {
      a[i] = 0.8;
      b[i] = 0.8;
    }
    for (let i = 10; i < 20; i++) {
      a[i] = 0.8;
      b[i] = -0.8;
    }

    const result = computeCompatibility(a, b);
    expect(result.group_scores.personality).toBeCloseTo(1.0, 5);
    expect(result.group_scores.values).toBeCloseTo(0.0, 5);
  });
});

describe("shared categories", () => {
  test("both high openness → shared", () => {
    const a = makeEmbeddingWith({ 0: 0.5 });
    const b = makeEmbeddingWith({ 0: 0.5 });
    const result = computeCompatibility(a, b);
    const openness = result.shared_categories.find(
      (sc) => sc.dimension === "openness"
    );
    expect(openness).toBeDefined();
    expect(openness!.direction).toBe("high");
    expect(openness!.strength).toBeCloseTo(0.5, 5);
  });

  test("one high, one low → not shared (different signs)", () => {
    const a = makeEmbeddingWith({ 0: 0.5 });
    const b = makeEmbeddingWith({ 0: -0.5 });
    const result = computeCompatibility(a, b);
    const openness = result.shared_categories.find(
      (sc) => sc.dimension === "openness"
    );
    expect(openness).toBeUndefined();
  });

  test("one high (0.8), one slightly high (0.2) → not shared (below magnitude threshold)", () => {
    const a = makeEmbeddingWith({ 0: 0.8 });
    const b = makeEmbeddingWith({ 0: 0.2 });
    const result = computeCompatibility(a, b);
    const openness = result.shared_categories.find(
      (sc) => sc.dimension === "openness"
    );
    expect(openness).toBeUndefined();
  });
});

describe("complementary traits", () => {
  test("strong opposite signals detected and labeled correctly", () => {
    const a = makeEmbeddingWith({ 0: 0.7 });
    const b = makeEmbeddingWith({ 0: -0.6 });
    const result = computeCompatibility(a, b, undefined, undefined, true);
    const trait = result.complementary_traits.find(
      (ct) => ct.dimension === "openness"
    );
    expect(trait).toBeDefined();
    expect(trait!.you).toBeCloseTo(0.7);
    expect(trait!.them).toBeCloseTo(-0.6);
    expect(trait!.label).toContain("novelty-seeking");
    expect(trait!.label).toContain("routine-oriented");
  });
});

describe("findSharedInterests", () => {
  test("case-insensitive intersection", () => {
    const result = findSharedInterests(
      ["Rock Climbing", "coding"],
      ["rock climbing", "music"]
    );
    expect(result).toEqual(["Rock Climbing"]);
  });

  test("no shared interests", () => {
    const result = findSharedInterests(["hiking"], ["cooking"]);
    expect(result).toEqual([]);
  });

  test("handles undefined", () => {
    expect(findSharedInterests(undefined, ["cooking"])).toEqual([]);
    expect(findSharedInterests(["hiking"], undefined)).toEqual([]);
  });
});

describe("generateOpener", () => {
  test("handles zero shared interests and categories", () => {
    const opener = generateOpener([], []);
    expect(opener).toContain("start wherever feels natural");
  });

  test("handles multiple shared interests", () => {
    const opener = generateOpener(["rock climbing", "coding"], []);
    expect(opener).toContain("rock climbing");
    expect(opener).toContain("coding");
  });

  test("handles single interest with alignment", () => {
    const opener = generateOpener(
      ["rock climbing"],
      [{ dimension: "intellectual_curiosity", direction: "high", strength: 0.7 }]
    );
    expect(opener).toContain("rock climbing");
    expect(opener).toContain("intellectual curiosity");
  });

  test("handles only alignment dimensions", () => {
    const opener = generateOpener(
      [],
      [
        { dimension: "openness", direction: "high", strength: 0.8 },
        { dimension: "empathy", direction: "high", strength: 0.6 },
      ]
    );
    expect(opener).toContain("openness");
    expect(opener).toContain("empathy");
  });
});
