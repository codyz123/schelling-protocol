/**
 * Statistical utilities for analytics and A/B testing.
 */

/**
 * Two-proportion z-test.
 * Tests whether two proportions (x1/n1 vs x2/n2) are significantly different.
 */
export function twoProportionZTest(
  x1: number, n1: number,
  x2: number, n2: number
): { z: number; p_value: number; significant: boolean } {
  if (n1 === 0 || n2 === 0) return { z: 0, p_value: 1, significant: false };
  
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pPooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));
  
  if (se === 0) return { z: 0, p_value: 1, significant: false };
  
  const z = (p1 - p2) / se;
  // Approximate p-value using normal CDF approximation
  const p_value = 2 * (1 - normalCDF(Math.abs(z)));
  
  return { z, p_value, significant: p_value < 0.05 && Math.min(n1, n2) >= 100 };
}

/**
 * Wilson confidence interval for a proportion.
 */
export function wilsonConfidenceInterval(
  successes: number,
  total: number,
  confidence: number = 0.95
): { lower: number; upper: number } {
  if (total === 0) return { lower: 0, upper: 0 };
  
  const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.96;
  const p = successes / total;
  const denom = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denom;
  const margin = (z / denom) * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));
  
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

/**
 * Pearson correlation coefficient.
 */
export function pearsonCorrelation(
  xs: number[],
  ys: number[]
): { r: number | null; p_value: number } {
  const n = xs.length;
  if (n < 2) return { r: null, p_value: 1 };
  
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  
  if (denomX === 0 || denomY === 0) return { r: 0, p_value: 1 };
  
  const r = num / Math.sqrt(denomX * denomY);
  // Approximate t-test for significance
  const t = r * Math.sqrt((n - 2) / (1 - r * r + 1e-10));
  const p_value = 2 * (1 - normalCDF(Math.abs(t)));
  
  return { r, p_value };
}

/**
 * Normal CDF approximation (Abramowitz and Stegun).
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return 0.5 * (1.0 + sign * y);
}
