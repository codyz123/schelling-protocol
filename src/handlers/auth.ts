import type { DatabaseConnection } from "../db/interface.js";

// Dummy hash for constant-time comparison (prevents timing-based slug enumeration)
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=2,p=1$0000000000000000$0000000000000000000000000000000000000000000";

/**
 * Authenticate a request by card slug + Bearer token.
 * Returns the card record if valid, null otherwise.
 */
export async function authenticateBySlug(
  db: DatabaseConnection,
  slug: string,
  authHeader: string | null,
): Promise<Record<string, any> | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const card = db.prepare(
    "SELECT * FROM agent_cards WHERE slug = ? AND deleted_at IS NULL",
  ).get(slug) as Record<string, any> | undefined;
  const hashToCheck = card?.api_key_hash ?? DUMMY_HASH;
  const valid = await Bun.password.verify(token, hashToCheck).catch(() => false);
  return valid && card ? card : null;
}
