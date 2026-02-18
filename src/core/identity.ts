import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";

export interface IdentityResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface Identity {
  id: string;
  token: string;
  verification_level: "anonymous" | "verified" | "attested";
  phone_hash?: string;
  created_at: string;
  last_active_at: string;
}

export function createIdentity(db: Database, verification_level: "anonymous" | "verified" | "attested" = "anonymous", phone_hash?: string): IdentityResult<Identity> {
  const id = randomUUID();
  const token = randomUUID();
  const now = new Date().toISOString();
  
  try {
    // For v2, we'll create identities in a separate table
    // For now, we'll use the existing user token system for backward compatibility
    const identity: Identity = {
      id,
      token,
      verification_level,
      phone_hash,
      created_at: now,
      last_active_at: now
    };
    
    return { ok: true, data: identity };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "IDENTITY_CREATION_FAILED",
        message: error instanceof Error ? error.message : "Failed to create identity"
      }
    };
  }
}

export function findIdentityByToken(db: Database, token: string): Identity | null {
  // For backward compatibility, map user tokens to identities
  const user = db.prepare("SELECT user_token, created_at FROM users WHERE user_token = ?").get(token);
  if (!user) return null;
  
  return {
    id: token, // Use token as ID for backward compatibility
    token: token,
    verification_level: "anonymous",
    created_at: (user as any).created_at,
    last_active_at: (user as any).created_at
  };
}

export function updateLastActive(db: Database, token: string): void {
  // For now, this is a no-op since we don't track last_active in the legacy schema
  // In the full v2 implementation, this would update the identities table
}

export function validateToken(token: string): boolean {
  // Basic UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(token);
}