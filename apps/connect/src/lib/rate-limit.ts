/**
 * In-memory sliding-window rate limiter.
 * Suitable for single-instance deployments (Vercel serverless).
 * Swap with Upstash Redis adapter for multi-instance scaling.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

/** Reset the rate limit store (for testing) */
export function resetRateLimitStore() {
  store.clear();
}

// Clean stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

export interface RateLimitConfig {
  /** Maximum requests allowed in the time window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Check rate limit for a given identifier (e.g. user ID or IP).
 * Returns { success, remaining, resetMs }.
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - config.windowMs;

  cleanup(config.windowMs);

  let entry = store.get(identifier);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(identifier, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= config.limit) {
    const oldestInWindow = entry.timestamps[0];
    return {
      success: false,
      remaining: 0,
      resetMs: oldestInWindow + config.windowMs - now,
    };
  }

  entry.timestamps.push(now);
  return {
    success: true,
    remaining: config.limit - entry.timestamps.length,
    resetMs: config.windowMs,
  };
}

/** Pre-configured rate limiters for common use cases */
export const RATE_LIMITS = {
  /** Standard mutations: 30 requests per minute */
  mutation: { limit: 30, windowMs: 60_000 },
  /** Message sending: 20 messages per minute */
  message: { limit: 20, windowMs: 60_000 },
  /** Auth-related: 10 attempts per minute */
  auth: { limit: 10, windowMs: 60_000 },
  /** Heavy operations: 5 per minute */
  heavy: { limit: 5, windowMs: 60_000 },
  /** Read endpoints (admin lists, preference reads): 120/min */
  read: { limit: 120, windowMs: 60_000 },
} as const;
