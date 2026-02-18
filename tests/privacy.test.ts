import { describe, expect, test } from "bun:test";
import { addLaplaceNoise, validateEmbedding } from "../src/matching/privacy.js";
import { DIMENSION_COUNT } from "../src/types.js";

function makeEmbedding(fill: number): number[] {
  return new Array(DIMENSION_COUNT).fill(fill);
}

describe("addLaplaceNoise", () => {
  test("output length equals input length", () => {
    const input = makeEmbedding(0.5);
    const output = addLaplaceNoise(input, 1.0);
    expect(output.length).toBe(DIMENSION_COUNT);
  });

  test("all output values in [-1, 1] after clamping", () => {
    const input = makeEmbedding(0.9);
    // Use low epsilon for heavy noise
    const output = addLaplaceNoise(input, 0.1);
    for (const v of output) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("mean of noise samples ≈ 0 (within tolerance)", () => {
    const N = 10000;
    const input = [0.0]; // centered to avoid clamping bias
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const noisy = addLaplaceNoise(input, 1.0)[0];
      sum += noisy; // noise component (input is 0)
    }
    const mean = sum / N;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });

  test("higher epsilon → lower variance", () => {
    const N = 5000;
    const input = [0.5];

    function measureVariance(epsilon: number): number {
      let sumSq = 0;
      for (let i = 0; i < N; i++) {
        const noise = addLaplaceNoise(input, epsilon)[0] - 0.5;
        sumSq += noise * noise;
      }
      return sumSq / N;
    }

    const varianceLow = measureVariance(0.5);
    const varianceHigh = measureVariance(2.0);
    expect(varianceHigh).toBeLessThan(varianceLow);
  });
});

describe("validateEmbedding", () => {
  test("rejects wrong length", () => {
    expect(validateEmbedding([0.1, 0.2])).toContain("Expected 50 dimensions");
  });

  test("rejects NaN", () => {
    const arr = makeEmbedding(0.5);
    arr[3] = NaN;
    expect(validateEmbedding(arr)).toContain("not finite");
  });

  test("rejects Infinity", () => {
    const arr = makeEmbedding(0.5);
    arr[3] = Infinity;
    expect(validateEmbedding(arr)).toContain("not finite");
  });

  test("rejects out of range", () => {
    const arr = makeEmbedding(0.5);
    arr[3] = 1.5;
    expect(validateEmbedding(arr)).toContain("out of range");
  });

  test("rejects all-zero", () => {
    const arr = makeEmbedding(0);
    expect(validateEmbedding(arr)).toContain("All-zero");
  });

  test("accepts valid 50-dim vector", () => {
    const arr = makeEmbedding(0.3);
    expect(validateEmbedding(arr)).toBeNull();
  });

  test("accepts values at exactly -1 and +1", () => {
    const arr = makeEmbedding(0);
    arr[0] = -1;
    arr[1] = 1;
    expect(validateEmbedding(arr)).toBeNull();
  });
});
