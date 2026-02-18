import {
  DIMENSION_NAMES,
  DIMENSION_GROUPS,
  POLE_LABELS,
} from "../types.js";

export interface SharedCategory {
  dimension: string;
  direction: "high" | "low";
  strength: number;
}

export interface ComplementaryTrait {
  dimension: string;
  you: number;
  them: number;
  label: string;
}

export interface CompatibilityResult {
  overall_score: number;
  group_scores: Record<string, number>;
  shared_categories: SharedCategory[];
  complementary_traits: ComplementaryTrait[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return (dot / denom + 1) / 2;
}

function deriveSharedCategories(
  a: number[],
  b: number[]
): SharedCategory[] {
  const results: SharedCategory[] = [];
  const MAGNITUDE_THRESHOLD = 0.3;
  const AGREEMENT_THRESHOLD = 0.4;

  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]) < MAGNITUDE_THRESHOLD) continue;
    if (Math.abs(b[i]) < MAGNITUDE_THRESHOLD) continue;
    if (Math.sign(a[i]) !== Math.sign(b[i])) continue;
    if (Math.abs(a[i] - b[i]) > AGREEMENT_THRESHOLD) continue;

    results.push({
      dimension: DIMENSION_NAMES[i],
      direction: a[i] > 0 ? "high" : "low",
      strength: (Math.abs(a[i]) + Math.abs(b[i])) / 2,
    });
  }

  return results.sort((x, y) => y.strength - x.strength);
}

function formatComplementaryLabel(
  dim: string,
  you: number,
  them: number
): string {
  const [negLabel, posLabel] = POLE_LABELS[dim] ?? [
    `low ${dim}`,
    `high ${dim}`,
  ];
  const youLabel = you > 0 ? posLabel : negLabel;
  const themLabel = them > 0 ? posLabel : negLabel;
  return `You: ${youLabel} — They: ${themLabel}`;
}

function deriveComplementaryTraits(
  a: number[],
  b: number[],
  callerIsA: boolean
): ComplementaryTrait[] {
  const results: ComplementaryTrait[] = [];
  const MAGNITUDE_THRESHOLD = 0.3;

  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]) < MAGNITUDE_THRESHOLD) continue;
    if (Math.abs(b[i]) < MAGNITUDE_THRESHOLD) continue;
    if (Math.sign(a[i]) === Math.sign(b[i])) continue;

    const name = DIMENSION_NAMES[i];
    const [you, them] = callerIsA ? [a[i], b[i]] : [b[i], a[i]];
    results.push({
      dimension: name,
      you,
      them,
      label: formatComplementaryLabel(name, you, them),
    });
  }

  return results.sort(
    (x, y) =>
      Math.abs(y.you) + Math.abs(y.them) - (Math.abs(x.you) + Math.abs(x.them))
  );
}

export function findSharedInterests(
  a?: string[],
  b?: string[]
): string[] {
  if (!a || !b) return [];
  const setB = new Set(b.map((s) => s.toLowerCase().trim()));
  return a.filter((interest) => setB.has(interest.toLowerCase().trim()));
}

export function generateOpener(
  sharedInterests: string[],
  sharedCategories: SharedCategory[]
): string {
  if (sharedInterests.length === 0 && sharedCategories.length === 0) {
    return "Your compatibility scores suggest you'd have a lot to talk about — start wherever feels natural.";
  }

  const interest = sharedInterests[0] ?? null;
  const alignment = sharedCategories[0]?.dimension ?? null;

  if (interest && sharedInterests.length > 1) {
    return `You both love ${interest} and ${sharedInterests[1]}. That's a strong foundation — see where the conversation takes you.`;
  }
  if (interest && alignment) {
    const readableAlignment = alignment.replace(/_/g, " ");
    return `A shared interest in ${interest} and strong ${readableAlignment} alignment — plenty of common ground to explore.`;
  }
  if (interest) {
    return `You both enjoy ${interest} — start there and see what else you discover.`;
  }
  const top3 = sharedCategories
    .slice(0, 3)
    .map((c) => c.dimension.replace(/_/g, " "));
  return `Strong alignment on ${top3.join(", ")} — the kind of compatibility that leads to great conversations.`;
}

export function computeCompatibility(
  embeddingA: number[],
  embeddingB: number[],
  interestsA?: string[],
  interestsB?: string[],
  callerIsA: boolean = true
): CompatibilityResult {
  const overall_score = cosineSimilarity(embeddingA, embeddingB);

  const group_scores: Record<string, number> = {};
  for (const [group, { start, end }] of Object.entries(DIMENSION_GROUPS)) {
    group_scores[group] = cosineSimilarity(
      embeddingA.slice(start, end),
      embeddingB.slice(start, end)
    );
  }

  const shared_categories = deriveSharedCategories(embeddingA, embeddingB);
  const complementary_traits = deriveComplementaryTraits(
    embeddingA,
    embeddingB,
    callerIsA
  );

  return {
    overall_score,
    group_scores,
    shared_categories,
    complementary_traits,
  };
}
