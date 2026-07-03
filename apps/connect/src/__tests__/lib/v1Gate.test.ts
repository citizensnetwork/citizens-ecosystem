/**
 * Unit tests for the v1 rate-limit + API-key gate.
 *
 * We don't boot the whole Next.js runtime — just test the logic of
 * `gateV1` with a mocked Supabase client and the in-memory fallback
 * rate limiter.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitStore } from "@/lib/rate-limit";

// Mock the server Supabase client. `resolveApiKey` only calls `.rpc`.
const rpcMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: rpcMock }),
}));

// Force in-memory path (no Upstash env).
vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

// Import AFTER mocks so the module reads the right env.
import { gateV1 } from "@/lib/v1Gate";

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/v1/contributors", { headers });
}

describe("gateV1", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    resetRateLimitStore();
  });

  it("allows anonymous requests within the anon limit", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const result = await gateV1(makeReq({ "x-forwarded-for": "1.2.3.4" }), {
      bucket: "test",
    });
    expect(result.deny).toBeUndefined();
    expect(result.key).toBeNull();
  });

  it("denies anonymous requests past the 60/min cap", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const headers = { "x-forwarded-for": "9.9.9.9" };
    // Burn 60 successful calls, then expect the 61st to deny.
    for (let i = 0; i < 60; i++) {
      const r = await gateV1(makeReq(headers), { bucket: "cap" });
      expect(r.deny).toBeUndefined();
    }
    const denied = await gateV1(makeReq(headers), { bucket: "cap" });
    expect(denied.deny).toBeDefined();
    expect(denied.deny?.status).toBe(429);
  });

  it("grants the higher key tier when a valid cck_ key resolves", async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: "k1",
        owner_id: "u1",
        scopes: ["read:public"],
        rate_limit_per_minute: null,
      },
      error: null,
    });
    const req = makeReq({ authorization: "Bearer cck_live_abcdef12345678901234" });
    const result = await gateV1(req, { bucket: "keyed" });
    expect(result.key?.id).toBe("k1");
    expect(result.deny).toBeUndefined();
  });

  it("ignores non-cck tokens and falls back to anonymous", async () => {
    const req = makeReq({ authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.random" });
    const result = await gateV1(req, { bucket: "noncck" });
    // resolve_api_key should never have been called because the token
    // doesn't start with cck_.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.key).toBeNull();
  });

  it("enforces the per-resource secondary cap for anonymous callers", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    // Different IPs each call — so primary IP cap never kicks in.
    for (let i = 0; i < 120; i++) {
      const r = await gateV1(
        makeReq({ "x-forwarded-for": `10.0.0.${i}` }),
        { bucket: "res", resourceId: "slug-x" },
      );
      expect(r.deny).toBeUndefined();
    }
    const blocked = await gateV1(
      makeReq({ "x-forwarded-for": "10.99.99.99" }),
      { bucket: "res", resourceId: "slug-x" },
    );
    expect(blocked.deny).toBeDefined();
  });

  it("still allows anonymous traffic to a different resource when one is throttled", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    for (let i = 0; i < 120; i++) {
      await gateV1(makeReq({ "x-forwarded-for": `11.0.0.${i}` }), {
        bucket: "res2",
        resourceId: "slug-a",
      });
    }
    // slug-a is now capped, but slug-b has its own bucket.
    const ok = await gateV1(makeReq({ "x-forwarded-for": "11.88.88.88" }), {
      bucket: "res2",
      resourceId: "slug-b",
    });
    expect(ok.deny).toBeUndefined();
  });
});
