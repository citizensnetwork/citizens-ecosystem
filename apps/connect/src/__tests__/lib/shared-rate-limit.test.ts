import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RATE_LIMITS,
  checkRateLimit,
  resetRateLimitStore,
  upstashConfigured,
} from "@/lib/rate-limit";

/**
 * Locks the presets and the Redis key shape that every Connect route
 * already relies on. Imports go through `@/lib/rate-limit` so the assertions
 * follow the path the routes use, including after that file re-exports
 * `@citizens/utils`.
 */

const PRESETS = {
  mutation: { limit: 30, windowMs: 60_000 },
  message: { limit: 20, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 60_000 },
  heavy: { limit: 5, windowMs: 60_000 },
  read: { limit: 120, windowMs: 60_000 },
} as const;

describe("Connect rate-limit presets", () => {
  afterEach(() => {
    resetRateLimitStore();
  });

  it("keeps every preset value and key", () => {
    expect(upstashConfigured).toBe(false);
    expect(Object.keys(RATE_LIMITS)).toEqual([
      "mutation",
      "message",
      "auth",
      "heavy",
      "read",
    ]);
    expect(RATE_LIMITS).toEqual(PRESETS);
  });

  it("enforces each preset at its own limit", async () => {
    for (const [name, config] of Object.entries(PRESETS)) {
      resetRateLimitStore();
      for (let i = 0; i < config.limit; i++) {
        const allowed = await checkRateLimit(`preset:${name}`, config);
        expect(allowed.success).toBe(true);
      }
      const blocked = await checkRateLimit(`preset:${name}`, config);
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);
    }
  });
});

describe("Connect Upstash key", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("still stores counts at rl:<identifier>:<bucket> for 60 seconds", async () => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "unit-test-token");
    const fetchMock = vi.fn<(url: string) => Promise<{ ok: true; json: () => Promise<{ result: number }> }>>(
      async () => ({
        ok: true,
        json: async () => ({ result: 1 }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { checkRateLimit: check } = await import("@/lib/rate-limit");
    const before = Math.floor(Date.now() / 1000 / 60);
    await check("probe:id", { limit: 5, windowMs: 60_000 });
    const after = Math.floor(Date.now() / 1000 / 60);

    const urls = fetchMock.mock.calls.map((call) => decodeURIComponent(String(call[0])));
    expect(urls).toHaveLength(2);
    const incr = urls[0]?.match(/\/INCR\/rl:probe:id:(\d+)$/);
    const expire = urls[1]?.match(/\/EXPIRE\/rl:probe:id:(\d+)\/60$/);
    expect(incr).not.toBeNull();
    expect(expire).not.toBeNull();
    const bucket = Number(incr?.[1]);
    expect(bucket === before || bucket === after).toBe(true);
    expect(expire?.[1]).toBe(incr?.[1]);
  });
});
