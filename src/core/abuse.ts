import type { Database } from "bun:sqlite";

export interface AbuseFlags {
  scraping_detected: boolean;
  rapid_funnel_detected: boolean;
  warning_message?: string;
}

/**
 * Detect scraping behavior - >50 searches with 0 evaluations
 */
export function detectScraping(db: Database, user_token: string): AbuseFlags {
  // Count searches performed by user
  const searchCountQuery = db.query<{ count: number }>(`
    SELECT COUNT(*) as count 
    FROM candidates 
    WHERE user_a_token = ? OR user_b_token = ?
  `);

  const searchResult = searchCountQuery.get(user_token, user_token);
  const searchCount = searchResult?.count || 0;

  // Count evaluations (candidates advanced past stage 1)
  const evaluationCountQuery = db.query<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM candidates 
    WHERE (user_a_token = ? AND stage_a > 1) 
    OR (user_b_token = ? AND stage_b > 1)
  `);

  const evaluationResult = evaluationCountQuery.get(user_token, user_token);
  const evaluationCount = evaluationResult?.count || 0;

  const scrapingDetected = searchCount > 50 && evaluationCount === 0;

  return {
    scraping_detected: scrapingDetected,
    rapid_funnel_detected: false, // Only checking scraping here
    warning_message: scrapingDetected 
      ? `Potential scraping detected: ${searchCount} searches with ${evaluationCount} evaluations`
      : undefined
  };
}

/**
 * Detect rapid funnel completion - full funnel in <60 seconds
 */
export function detectRapidFunnel(db: Database, candidate_id: string): AbuseFlags {
  const getCandidateTimings = db.query<{
    created_at: string;
    updated_at: string;
    stage_a: number;
    stage_b: number;
  }>(`
    SELECT created_at, updated_at, stage_a, stage_b
    FROM candidates 
    WHERE id = ?
  `);

  const candidate = getCandidateTimings.get(candidate_id);
  
  if (!candidate) {
    return { scraping_detected: false, rapid_funnel_detected: false };
  }

  const createdAt = new Date(candidate.created_at).getTime();
  const updatedAt = new Date(candidate.updated_at).getTime();
  const timeElapsed = updatedAt - createdAt;
  const maxStage = Math.max(candidate.stage_a, candidate.stage_b);

  // If either party reached CONNECTED (stage 5) in under 60 seconds, flag it
  const rapidFunnelDetected = maxStage >= 5 && timeElapsed < 60000; // 60 seconds

  return {
    scraping_detected: false, // Only checking rapid funnel here
    rapid_funnel_detected: rapidFunnelDetected,
    warning_message: rapidFunnelDetected 
      ? `Rapid funnel completion detected: Stage ${maxStage} reached in ${timeElapsed}ms`
      : undefined
  };
}

/**
 * Comprehensive abuse detection for a user
 */
export function detectAbusePatterns(db: Database, user_token: string): AbuseFlags {
  const scrapingFlags = detectScraping(db, user_token);
  
  // Get all candidates for this user to check rapid funnel patterns
  const getCandidates = db.query<{ id: string }>(`
    SELECT id FROM candidates 
    WHERE user_a_token = ? OR user_b_token = ?
  `);

  const candidates = getCandidates.all(user_token, user_token);
  
  let rapidFunnelDetected = false;
  const warnings: string[] = [];

  if (scrapingFlags.scraping_detected && scrapingFlags.warning_message) {
    warnings.push(scrapingFlags.warning_message);
  }

  for (const candidate of candidates) {
    const funnelFlags = detectRapidFunnel(db, candidate.id);
    if (funnelFlags.rapid_funnel_detected) {
      rapidFunnelDetected = true;
      if (funnelFlags.warning_message) {
        warnings.push(funnelFlags.warning_message);
      }
      break; // Only report first instance
    }
  }

  return {
    scraping_detected: scrapingFlags.scraping_detected,
    rapid_funnel_detected: rapidFunnelDetected,
    warning_message: warnings.length > 0 ? warnings.join('; ') : undefined
  };
}

/**
 * Check for spam registration patterns (multiple registrations from same context)
 */
export function detectSpamRegistration(
  db: Database, 
  phone_hash?: string, 
  ip_address?: string
): { spam_detected: boolean; reason?: string } {
  if (!phone_hash && !ip_address) {
    return { spam_detected: false };
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  if (phone_hash) {
    const phoneCheckQuery = db.query<{ count: number }>(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE phone_hash = ? AND created_at > ?
    `);

    const phoneResult = phoneCheckQuery.get(phone_hash, oneDayAgo);
    if (phoneResult && phoneResult.count > 3) {
      return { 
        spam_detected: true, 
        reason: `Multiple registrations (${phoneResult.count}) from same phone number in 24h` 
      };
    }
  }

  // Note: IP address detection would require additional infrastructure
  // to track IP addresses, which isn't currently implemented in the schema
  
  return { spam_detected: false };
}

/**
 * Get abuse summary for a user (for admin/debugging purposes)
 */
export function getUserAbuseReport(db: Database, user_token: string): {
  user_token: string;
  search_count: number;
  evaluation_count: number;
  rapid_funnels: number;
  flags: AbuseFlags;
} {
  const searchCountQuery = db.query<{ count: number }>(`
    SELECT COUNT(*) as count 
    FROM candidates 
    WHERE user_a_token = ? OR user_b_token = ?
  `);

  const evaluationCountQuery = db.query<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM candidates 
    WHERE (user_a_token = ? AND stage_a > 1) 
    OR (user_b_token = ? AND stage_b > 1)
  `);

  const getCandidates = db.query<{ id: string }>(`
    SELECT id FROM candidates 
    WHERE user_a_token = ? OR user_b_token = ?
  `);

  const searchResult = searchCountQuery.get(user_token, user_token);
  const evaluationResult = evaluationCountQuery.get(user_token, user_token);
  const candidates = getCandidates.all(user_token, user_token);

  let rapidFunnelCount = 0;
  for (const candidate of candidates) {
    const flags = detectRapidFunnel(db, candidate.id);
    if (flags.rapid_funnel_detected) {
      rapidFunnelCount++;
    }
  }

  return {
    user_token,
    search_count: searchResult?.count || 0,
    evaluation_count: evaluationResult?.count || 0,
    rapid_funnels: rapidFunnelCount,
    flags: detectAbusePatterns(db, user_token)
  };
}