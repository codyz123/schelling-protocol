import { DIMENSION_COUNT } from "../types.js";

function sampleLaplace(scale: number): number {
  let u: number;
  do {
    u = Math.random() - 0.5;
  } while (u === 0);
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

export function addLaplaceNoise(
  embedding: number[],
  epsilon: number = 1.0
): number[] {
  const sensitivity = 2.0;
  const scale = sensitivity / epsilon;
  return embedding.map((value) => {
    const noisy = value + sampleLaplace(scale);
    return Math.max(-1, Math.min(1, noisy));
  });
}

/**
 * Validate a 50-dimension trait embedding.
 * Returns null on success or a string error message.
 */
export function validateEmbedding(embedding: number[]): string | null {
  if (embedding.length !== DIMENSION_COUNT) {
    return `Expected ${DIMENSION_COUNT} dimensions, got ${embedding.length}`;
  }
  for (let i = 0; i < embedding.length; i++) {
    if (!Number.isFinite(embedding[i])) {
      return `Dimension ${i} is not finite`;
    }
    if (embedding[i] < -1 || embedding[i] > 1) {
      return `Dimension ${i} out of range: ${embedding[i]}`;
    }
  }
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) {
    return "All-zero embedding (no signal)";
  }
  return null;
}
