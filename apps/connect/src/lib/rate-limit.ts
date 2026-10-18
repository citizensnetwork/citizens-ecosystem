/**
 * Sliding-window rate limiter. The implementation lives in `@citizens/utils`
 * so Connect, Vision and Wear share one copy. This file keeps the
 * `@/lib/rate-limit` path: every route and every `vi.mock("@/lib/rate-limit")`
 * still resolves here. Preset values and the Redis key
 * (`rl:<identifier>:<bucket>`) are the shared module's, unchanged from
 * Connect's previous copy.
 */
export {
  checkRateLimit,
  resetRateLimitStore,
  upstashConfigured,
  RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitResult,
} from "@citizens/utils";
