import type { SharedCategory, ComplementaryTrait } from "./compatibility.js";
import { DIMENSION_GROUPS, INTENT_DIMENSION_NAMES } from "../types.js";

/**
 * Template-based match explainability (no LLM required).
 */

export function generateNarrativeSummary(
  groupScores: Record<string, number>,
  sharedInterests: string[],
  complementaryTraits: ComplementaryTrait[],
  intentSimilarity: number
): string {
  const parts: string[] = [];

  // Find strongest group alignment
  const sortedGroups = Object.entries(groupScores)
    .sort(([, a], [, b]) => b - a);
  
  if (sortedGroups.length > 0) {
    const [topGroup, topScore] = sortedGroups[0];
    if (topScore > 0.7) {
      parts.push(`Strong ${topGroup} alignment (${Math.round(topScore * 100)}%)`);
    } else if (topScore > 0.5) {
      parts.push(`Moderate ${topGroup} compatibility`);
    }
  }

  if (sharedInterests.length > 2) {
    parts.push(`${sharedInterests.length} shared interests including ${sharedInterests.slice(0, 2).join(" and ")}`);
  } else if (sharedInterests.length > 0) {
    parts.push(`Shared interest in ${sharedInterests.join(" and ")}`);
  }

  if (complementaryTraits.length > 0) {
    parts.push(`${complementaryTraits.length} complementary trait${complementaryTraits.length > 1 ? "s" : ""} that could create balance`);
  }

  if (intentSimilarity > 0.8) {
    parts.push("closely aligned on what you're both looking for");
  } else if (intentSimilarity > 0.5) {
    parts.push("similar intentions for connecting");
  }

  if (parts.length === 0) {
    return "Your profiles suggest potential for discovery — sometimes the best connections come from unexpected places.";
  }

  return parts.join(". ") + ".";
}

export function generatePredictedFriction(
  complementaryTraits: ComplementaryTrait[],
  groupScores: Record<string, number>
): string[] {
  const frictions: string[] = [];

  // Large divergences in complementary traits
  for (const trait of complementaryTraits.slice(0, 3)) {
    const diff = Math.abs(trait.you - trait.them);
    if (diff > 1.0) {
      frictions.push(`Significant difference on ${trait.dimension.replace(/_/g, " ")} — ${trait.label}`);
    }
  }

  // Low-scoring groups
  for (const [group, score] of Object.entries(groupScores)) {
    if (score < 0.4) {
      frictions.push(`Low ${group} alignment may require extra understanding`);
    }
  }

  if (frictions.length === 0) {
    frictions.push("No major friction points identified — a promising foundation");
  }

  return frictions.slice(0, 5);
}

export function generateConversationStarters(
  sharedInterests: string[],
  strongestAlignments: string[],
  complementaryTraits: ComplementaryTrait[]
): string[] {
  const starters: string[] = [];

  for (const interest of sharedInterests.slice(0, 2)) {
    starters.push(`Ask about their experience with ${interest}`);
  }

  for (const dim of strongestAlignments.slice(0, 2)) {
    const readable = dim.replace(/_/g, " ");
    starters.push(`You both score high on ${readable} — explore what that means to each of you`);
  }

  if (complementaryTraits.length > 0) {
    const trait = complementaryTraits[0];
    starters.push(`Your different perspectives on ${trait.dimension.replace(/_/g, " ")} could make for an interesting conversation`);
  }

  if (starters.length === 0) {
    starters.push("Start with what brought you to the platform and what you're hoping to find");
    starters.push("Share something you're passionate about that most people don't know");
  }

  return starters.slice(0, 5);
}

export function generateIntentExplanation(
  callerIntentEmbedding: number[],
  otherIntentEmbedding: number[]
): { aligned: string[]; misaligned: string[] } {
  const aligned: string[] = [];
  const misaligned: string[] = [];

  if (callerIntentEmbedding.length !== 16 || otherIntentEmbedding.length !== 16) {
    return { aligned, misaligned };
  }

  for (let i = 0; i < 16; i++) {
    const diff = Math.abs(callerIntentEmbedding[i] - otherIntentEmbedding[i]);
    const dimName = INTENT_DIMENSION_NAMES[i].replace(/_/g, " ");
    if (diff < 0.3) {
      aligned.push(dimName);
    } else if (diff > 0.7) {
      misaligned.push(dimName);
    }
  }

  return { aligned: aligned.slice(0, 5), misaligned: misaligned.slice(0, 3) };
}
