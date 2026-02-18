import { createHash } from "crypto";

export interface LogEntry {
  timestamp: string;
  operation: string;
  identity_hash?: string; // SHA256 of token, never the raw token
  vertical?: string;
  latency_ms: number;
  result: "ok" | string; // "ok" for success, error code for failure
  metadata?: Record<string, any>; // Additional context, NO PII
}

export interface Logger {
  logOperation(
    operation: string,
    latencyMs: number,
    result: "ok" | string,
    identityToken?: string,
    vertical?: string,
    metadata?: Record<string, any>
  ): void;
}

class JSONLogger implements Logger {
  logOperation(
    operation: string,
    latencyMs: number,
    result: "ok" | string,
    identityToken?: string,
    vertical?: string,
    metadata?: Record<string, any>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      operation,
      latency_ms: Math.round(latencyMs * 100) / 100, // Round to 2 decimal places
      result,
    };

    // Hash the identity token if provided - NEVER log the raw token
    if (identityToken) {
      entry.identity_hash = createHash('sha256')
        .update(identityToken)
        .digest('hex')
        .substring(0, 16); // First 16 chars for brevity
    }

    if (vertical) {
      entry.vertical = vertical;
    }

    // Include metadata but scrub any potential PII
    if (metadata) {
      entry.metadata = this.scrubPII(metadata);
    }

    // Output to stdout as JSON (structured logging)
    console.log(JSON.stringify(entry));
  }

  private scrubPII(metadata: Record<string, any>): Record<string, any> {
    const scrubbed: Record<string, any> = {};
    
    const piiFields = new Set([
      'name', 'email', 'phone', 'address', 'contact', 'token',
      'embedding', 'description', 'seeking', 'values_text',
      'identity', 'photos', 'notes'
    ]);

    for (const [key, value] of Object.entries(metadata)) {
      const lowerKey = key.toLowerCase();
      
      // Skip known PII fields
      if (piiFields.has(lowerKey) || lowerKey.includes('password')) {
        continue;
      }

      // Keep safe metadata like counts, IDs, booleans, stage numbers
      if (typeof value === 'number' || 
          typeof value === 'boolean' ||
          key.endsWith('_id') ||
          key.endsWith('_count') ||
          key.includes('stage') ||
          key === 'vertical_id' ||
          key === 'operation' ||
          key === 'compatibility_score') {
        scrubbed[key] = value;
      } else if (typeof value === 'string' && value.length < 50 && !this.looksLikePII(value)) {
        // Include short strings that don't look like PII
        scrubbed[key] = value;
      }
    }

    return scrubbed;
  }

  private looksLikePII(value: string): boolean {
    // Simple heuristics to detect potential PII in strings
    const piiPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{10,}\b/, // Phone-like numbers
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/, // Name-like patterns
    ];

    return piiPatterns.some(pattern => pattern.test(value));
  }
}

// Singleton logger instance
export const logger: Logger = new JSONLogger();

// Helper function to time and log operations
export async function loggedOperation<T>(
  operation: string,
  fn: () => Promise<T> | T,
  identityToken?: string,
  vertical?: string,
  metadata?: Record<string, any>
): Promise<T> {
  const startTime = performance.now();
  let result: "ok" | string = "ok";
  
  try {
    const output = await fn();
    return output;
  } catch (error) {
    result = error instanceof Error ? error.message.split(' ')[0] : 'error';
    throw error;
  } finally {
    const endTime = performance.now();
    const latencyMs = endTime - startTime;
    logger.logOperation(operation, latencyMs, result, identityToken, vertical, metadata);
  }
}

// Wrapper for handler functions to automatically log them
export function withLogging<P, R>(
  operation: string,
  handler: (params: P, ctx: any) => R,
  extractIdentity?: (params: P) => string,
  extractVertical?: (params: P) => string,
  extractMetadata?: (params: P) => Record<string, any>
) {
  return async (params: P, ctx: any): Promise<R> => {
    const identityToken = extractIdentity?.(params);
    const vertical = extractVertical?.(params);
    const metadata = extractMetadata?.(params);

    return loggedOperation(
      operation,
      () => handler(params, ctx),
      identityToken,
      vertical,
      metadata
    );
  };
}