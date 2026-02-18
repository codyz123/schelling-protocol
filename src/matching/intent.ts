/**
 * Intent space math utilities for the Schelling Protocol v2.
 *
 * Provides cosine similarity, cluster affinity computation, and
 * embedding validation for 16-dimensional intent embeddings.
 */

export const INTENT_DIMENSIONS = 16;
export const TRAIT_DIMENSIONS = 50;

/** Minimum L2 norm for a valid intent embedding. */
const MIN_L2_NORM = 0.5;
/** Minimum number of dimensions with |value| > 0.1. */
const MIN_SIGNIFICANT_DIMS = 3;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Cosine similarity for arbitrary-length vectors.
 * Returns 0 when either vector has zero norm (avoids NaN).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Cosine similarity optimised for 16-dimensional intent embeddings.
 */
export function cosineSimilarity16(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < 16; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Validate an intent embedding (16-dim, values in [-1,1], finite,
 * L2 norm ≥ 0.5, ≥ 3 significant dimensions).
 */
export function validateIntentEmbedding(embedding: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(embedding) || embedding.length !== INTENT_DIMENSIONS) {
    errors.push(
      `Intent embedding must have exactly ${INTENT_DIMENSIONS} dimensions, got ${Array.isArray(embedding) ? embedding.length : "null"}`
    );
    return { valid: false, errors };
  }

  for (let i = 0; i < INTENT_DIMENSIONS; i++) {
    const v = embedding[i];
    if (!Number.isFinite(v)) {
      errors.push(`Dimension ${i} is not finite: ${v}`);
    } else if (v < -1 || v > 1) {
      errors.push(`Dimension ${i} out of range [-1,1]: ${v}`);
    }
  }
  if (errors.length > 0) return { valid: false, errors };

  const l2 = Math.sqrt(embedding.reduce((s: number, x: number) => s + x * x, 0));
  if (l2 < MIN_L2_NORM) {
    errors.push(`Intent embedding L2 norm too low: ${l2.toFixed(3)} (minimum ${MIN_L2_NORM})`);
  }

  const sig = embedding.filter((x: number) => Math.abs(x) > 0.1).length;
  if (sig < MIN_SIGNIFICANT_DIMS) {
    errors.push(
      `Intent embedding needs ≥${MIN_SIGNIFICANT_DIMS} significant dimensions (|value| > 0.1), found ${sig}`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a trait embedding (50-dim, values in [-1,1], finite, non-zero norm).
 */
export function validateTraitEmbedding(embedding: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(embedding) || embedding.length !== TRAIT_DIMENSIONS) {
    errors.push(
      `Trait embedding must have exactly ${TRAIT_DIMENSIONS} dimensions, got ${Array.isArray(embedding) ? embedding.length : "null"}`
    );
    return { valid: false, errors };
  }

  for (let i = 0; i < TRAIT_DIMENSIONS; i++) {
    const v = embedding[i];
    if (!Number.isFinite(v)) {
      errors.push(`Dimension ${i} is not finite: ${v}`);
    } else if (v < -1 || v > 1) {
      errors.push(`Dimension ${i} out of range [-1,1]: ${v}`);
    }
  }
  if (errors.length > 0) return { valid: false, errors };

  const norm = Math.sqrt(embedding.reduce((s: number, x: number) => s + x * x, 0));
  if (norm === 0) {
    errors.push("All-zero embedding (no signal)");
  }

  return { valid: errors.length === 0, errors };
}
