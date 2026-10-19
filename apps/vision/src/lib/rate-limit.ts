/**
 * Sliding-window rate limiter. The implementation lives in `@citizens/utils`
 * so Connect, Vision and Wear share one copy. This file keeps the
 * `@/lib/rate-limit` path. Preset values that Vision already shipped
 * (mutation 30, auth 10, heavy 5, read 120, each per 60 seconds) are
 * unchanged. The shared module also exports `message` (20 per 60 seconds);
 * no Vision route reads that preset.
 */
export {
  checkRateLimit,
  resetRateLimitStore,
  upstashConfigured,
  RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitResult,
} from "@citizens/utils";
