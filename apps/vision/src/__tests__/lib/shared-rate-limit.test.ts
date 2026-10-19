import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GATE_READ, GATE_WRITE, gateApiRequest } from "@/lib/api-gate";
import {
  RATE_LIMITS,
  checkRateLimit,
  resetRateLimitStore,
  upstashConfigured,
} from "@/lib/rate-limit";

/**
 * Locks Vision's presets and the blanket gate. Imports go through the app
 * paths (`@/lib/rate-limit`, `@/lib/api-gate`) so the numbers stay attached
 * to the modules the proxy and the routes use.
 *
 * Vision's private copy had no `message` preset. The shared module adds it
 * (20 per 60 seconds). No Vision route reads it. The other four presets,
 * the gate ceilings and the gate keys are unchanged.
 */

function makeRequest(method: string, ip: string) {
  return {
    method,
    headers: {
      get: (name: string) => (name.toLowerCase() === "x-forwarded-for" ? ip : null),
    },
  };
}

describe("Vision rate-limit presets", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("keeps every existing preset value and key", () => {
    expect(upstashConfigured).toBe(false);
    expect(Object.keys(RATE_LIMITS)).toEqual([
      "mutation",
      "message",
      "auth",
      "heavy",
      "read",
    ]);
    expect(RATE_LIMITS).toEqual({
      mutation: { limit: 30, windowMs: 60_000 },
      message: { limit: 20, windowMs: 60_000 },
      auth: { limit: 10, windowMs: 60_000 },
      heavy: { limit: 5, windowMs: 60_000 },
      read: { limit: 120, windowMs: 60_000 },
    });
  });

  it("enforces each preset at its own limit", async () => {
    for (const [name, config] of Object.entries(RATE_LIMITS)) {
      resetRateLimitStore();
      for (let i = 0; i < config.limit; i++) {
        expect((await checkRateLimit(`preset:${name}`, config)).success).toBe(true);
      }
      expect((await checkRateLimit(`preset:${name}`, config)).success).toBe(false);
    }
  });
});

describe("Vision blanket gate", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("keeps 240 reads and 60 writes per minute", () => {
    expect(GATE_READ).toEqual({ limit: 240, windowMs: 60_000 });
    expect(GATE_WRITE).toEqual({ limit: 60, windowMs: 60_000 });
  });

  it("blocks the 241st read and the 61st write for one address", async () => {
    const readIp = "203.0.113.20";
    for (let i = 0; i < 240; i++) {
      expect((await gateApiRequest(makeRequest("GET", readIp))).limited).toBe(false);
    }
    expect((await gateApiRequest(makeRequest("GET", readIp))).limited).toBe(true);

    const writeIp = "203.0.113.21";
    for (let i = 0; i < 60; i++) {
      expect((await gateApiRequest(makeRequest("POST", writeIp))).limited).toBe(false);
    }
    const blocked = await gateApiRequest(makeRequest("POST", writeIp));
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    // A read for the address that just exhausted writes still has its own bucket.
    expect((await gateApiRequest(makeRequest("GET", writeIp))).limited).toBe(false);
  });

  it("counts HEAD with reads and DELETE with writes", async () => {
    const ip = "203.0.113.22";
    for (let i = 0; i < 60; i++) {
      expect((await gateApiRequest(makeRequest("DELETE", ip))).limited).toBe(false);
    }
    expect((await gateApiRequest(makeRequest("DELETE", ip))).limited).toBe(true);
    expect((await gateApiRequest(makeRequest("HEAD", ip))).limited).toBe(false);
  });
});

describe("Vision Upstash keys", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("still keys the gate as rl:gate:<ip>:r and rl:gate:<ip>:w", async () => {
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

    const { gateApiRequest: gate } = await import("@/lib/api-gate");
    await gate(makeRequest("GET", "203.0.113.30"));
    await gate(makeRequest("POST", "203.0.113.30"));

    const urls = fetchMock.mock.calls.map((call) => decodeURIComponent(String(call[0])));
    expect(urls.some((url) => /\/INCR\/rl:gate:203\.0\.113\.30:r:\d+$/.test(url))).toBe(true);
    expect(urls.some((url) => /\/EXPIRE\/rl:gate:203\.0\.113\.30:r:\d+\/60$/.test(url))).toBe(
      true,
    );
    expect(urls.some((url) => /\/INCR\/rl:gate:203\.0\.113\.30:w:\d+$/.test(url))).toBe(true);
    expect(urls.some((url) => /\/EXPIRE\/rl:gate:203\.0\.113\.30:w:\d+\/60$/.test(url))).toBe(
      true,
    );
  });
});
