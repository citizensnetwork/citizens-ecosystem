/**
 * Upstash-backed sliding-window rate limiter with in-memory fallback.
 *
 * Activates Upstash Redis if BOTH `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are present in the environment. Otherwise
 * falls back to the in-memory `checkRateLimit` from ./rate-limit for
 * single-instance or development setups.
 *
 * Why a separate entry point:
 *   - Existing `checkRateLimit` is synchronous and used everywhere; we
 *     don't want to force every caller onto async.
 *   - Only public API surface (/api/v1/*) needs multi-instance-correct
 *     limiting right now; everything else is behind auth and sufficient
 *     on the in-memory limiter.
 *
 * Algorithm: we use a simple fixed-window counter on Upstash (INCR +
 * EXPIRE on a key like `rl:<id>:<windowStart>`). It's not a true
 * sliding window, but it's good enough for DoS protection and avoids
 * round-tripping timestamps. Trade-off: at the window boundary a client
 * could theoretically burst up to 2×limit. For our public-data API
 * that's acceptable.
 */

import { checkRateLimit, type RateLimitConfig } from "./rate-limit";

// Re-export shape so callers can import both from one place.
export type { RateLimitConfig } from "./rate-limit";
export type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetMs: number;
};

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH_ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function upstash<T = unknown>(
  command: (string | number)[],
): Promise<T | null> {
  if (!UPSTASH_ENABLED) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/${command.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      // Aggressive timeout so a Redis blip can't hang a public request.
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: T };
    return body.result ?? null;
  } catch {
    // Network/timeout → deny-less fallback is handled by the caller.
    return null;
  }
}

/**
 * Check rate limit using Upstash if configured, else in-memory.
 * Always returns a decision — if Upstash is unreachable we fall through
 * to the in-memory limiter rather than opening the gates.
 */
export async function checkRateLimitAsync(
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  if (!UPSTASH_ENABLED) {
    return checkRateLimit(identifier, config);
  }

  const windowSec = Math.max(1, Math.round(config.windowMs / 1000));
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${identifier}:${bucket}`;

  // INCR the counter. On Upstash outage we fall back to the in-memory
  // limiter so traffic still gets gated.
  const count = await upstash<number>(["INCR", key]);
  if (count === null) {
    return checkRateLimit(identifier, config);
  }
  // Set/refresh TTL unconditionally. EXPIRE is idempotent and cheap,
  // and doing it every call self-heals the "INCR OK but EXPIRE failed
  // on the first hit" case — otherwise the key could leak forever in
  // Redis. (Architect audit H2.)
  await upstash(["EXPIRE", key, windowSec]);

  const remaining = Math.max(0, config.limit - count);
  const resetMs = (bucket + 1) * windowSec * 1000 - Date.now();

  return {
    success: count <= config.limit,
    remaining,
    resetMs,
  };
}

export const upstashConfigured = UPSTASH_ENABLED;
