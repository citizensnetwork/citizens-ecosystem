import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  resetRateLimitStore,
  RATE_LIMITS,
  upstashConfigured,
} from "@/lib/rate-limit";

// No UPSTASH_* env in tests → the limiter runs its in-memory sliding window.
// The Upstash branch is exercised in Connect's suite (this file is a verbatim
// port kept byte-compatible for the planned @citizens/utils extraction).

describe("checkRateLimit (in-memory)", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("runs without Upstash in the test environment", () => {
    expect(upstashConfigured).toBe(false);
  });

  it("allows requests under the limit", async () => {
    const config = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit("user-1", config);
      expect(result.success).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", async () => {
    const config = { limit: 2, windowMs: 60_000 };
    await checkRateLimit("user-2", config);
    await checkRateLimit("user-2", config);
    const third = await checkRateLimit("user-2", config);
    expect(third.success).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.resetMs).toBeGreaterThan(0);
  });

  it("tracks identifiers independently", async () => {
    const config = { limit: 1, windowMs: 60_000 };
    await checkRateLimit("user-a", config);
    const otherUser = await checkRateLimit("user-b", config);
    expect(otherUser.success).toBe(true);
  });

  it("reports remaining capacity", async () => {
    const config = { limit: 5, windowMs: 60_000 };
    const first = await checkRateLimit("user-3", config);
    expect(first.remaining).toBe(4);
  });

  it("frees capacity once the window has passed", async () => {
    const config = { limit: 1, windowMs: 1 };
    await checkRateLimit("user-4", config);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const again = await checkRateLimit("user-4", config);
    expect(again.success).toBe(true);
  });

  it("ships the expected preset tiers", () => {
    expect(RATE_LIMITS.mutation.limit).toBeLessThan(RATE_LIMITS.read.limit);
    expect(RATE_LIMITS.heavy.limit).toBeLessThan(RATE_LIMITS.auth.limit);
    for (const preset of Object.values(RATE_LIMITS)) {
      expect(preset.windowMs).toBe(60_000);
    }
  });
});
