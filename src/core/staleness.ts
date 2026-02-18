/**
 * Profile staleness detection.
 * - < 90 days: factor 1.0, not stale
 * - 90-390 days: decaying factor, min 0.7
 * - > 180 days: stale flag
 */
export function computeStalenessPenalty(lastRegisteredAt: string | Date): {
  factor: number;
  stale: boolean;
  penalized: boolean;
} {
  const lastReg = lastRegisteredAt instanceof Date
    ? lastRegisteredAt.getTime()
    : new Date(lastRegisteredAt).getTime();
  const ageDays = (Date.now() - lastReg) / (1000 * 60 * 60 * 24);

  const stale = ageDays >= 180;
  
  if (ageDays <= 90) {
    return { factor: 1.0, stale, penalized: false };
  }

  const factor = Math.max(0.7, 1.0 - (ageDays - 90) / 300);
  return { factor, stale, penalized: true };
}
