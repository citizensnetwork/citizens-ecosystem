/**
 * Sliding-window rate limiter — Upstash Redis-backed when configured,
 * in-memory fallback otherwise (dev / test / Upstash outage).
 *
 * Activates Upstash Redis if BOTH `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are present in the environment (free tier —
 * REST API over `fetch`, no SDK dependency). Every route already calls
 * `checkRateLimit()`, so this is the one place multi-instance correctness
 * (addendum §A2) had to land — no call sites needed their own Upstash logic.
 *
 * Algorithm on Upstash: fixed-window counter (INCR + EXPIRE on
 * `rl:<id>:<windowStart>`). Not a true sliding window — a client could
 * theoretically burst up to 2×limit at a window boundary — but it's a
 * single round trip and good enough for abuse/DoS protection. In-memory
 * fallback keeps the original true sliding-window (per-timestamp) behaviour.
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

function cleanupInMemory(windowMs: number) {
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

/** True sliding-window check against the in-memory Map (single instance only). */
function checkRateLimitInMemory(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - config.windowMs;

  cleanupInMemory(config.windowMs);

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

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH_ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN);

/** Whether Upstash is configured (for logs/diagnostics; not required by callers). */
export const upstashConfigured = UPSTASH_ENABLED;

async function upstash<T = unknown>(
  command: (string | number)[],
): Promise<T | null> {
  if (!UPSTASH_ENABLED) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/${command.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      // Aggressive timeout so a Redis blip can't hang a request.
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: T };
    return body.result ?? null;
  } catch {
    // Network/timeout → caller falls back to the in-memory limiter.
    return null;
  }
}

/**
 * Check rate limit for a given identifier (e.g. user ID or IP).
 * Uses Upstash Redis when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
 * are set (correct across Vercel's multiple serverless instances); otherwise
 * — or if Upstash is unreachable — falls back to the in-memory limiter so
 * traffic is always gated, never opened.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (!UPSTASH_ENABLED) {
    return checkRateLimitInMemory(identifier, config);
  }

  const windowSec = Math.max(1, Math.round(config.windowMs / 1000));
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${identifier}:${bucket}`;

  const count = await upstash<number>(["INCR", key]);
  if (count === null) {
    return checkRateLimitInMemory(identifier, config);
  }
  // Set/refresh TTL unconditionally. EXPIRE is idempotent and cheap, and
  // doing it every call self-heals the "INCR OK but EXPIRE failed on the
  // first hit" case — otherwise the key could leak forever in Redis.
  await upstash(["EXPIRE", key, windowSec]);

  const remaining = Math.max(0, config.limit - count);
  const resetMs = (bucket + 1) * windowSec * 1000 - Date.now();

  return {
    success: count <= config.limit,
    remaining,
    resetMs,
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
