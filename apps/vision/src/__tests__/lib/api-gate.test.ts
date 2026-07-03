import { describe, it, expect, beforeEach } from "vitest";
import { clientIp, gateApiRequest, GATE_READ, GATE_WRITE } from "@/lib/api-gate";
import { resetRateLimitStore } from "@/lib/rate-limit";

function makeRequest(method: string, headers: Record<string, string> = {}) {
  const map = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    method,
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
  };
}

describe("clientIp", () => {
  it("takes the first x-forwarded-for hop", () => {
    const req = makeRequest("GET", {
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    const req = makeRequest("GET", { "x-real-ip": "198.51.100.2" });
    expect(clientIp(req)).toBe("198.51.100.2");
  });

  it("degrades to 'unknown' with no headers", () => {
    expect(clientIp(makeRequest("GET"))).toBe("unknown");
  });
});

describe("gateApiRequest", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("allows reads under the read limit", async () => {
    const req = makeRequest("GET", { "x-forwarded-for": "203.0.113.10" });
    const result = await gateApiRequest(req);
    expect(result.limited).toBe(false);
  });

  it("limits writes at the write threshold", async () => {
    const req = makeRequest("POST", { "x-forwarded-for": "203.0.113.11" });
    for (let i = 0; i < GATE_WRITE.limit; i++) {
      const ok = await gateApiRequest(req);
      expect(ok.limited).toBe(false);
    }
    const blocked = await gateApiRequest(req);
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("counts reads and writes in separate buckets", async () => {
    const ip = { "x-forwarded-for": "203.0.113.12" };
    for (let i = 0; i < GATE_WRITE.limit; i++) {
      await gateApiRequest(makeRequest("POST", ip));
    }
    const write = await gateApiRequest(makeRequest("POST", ip));
    expect(write.limited).toBe(true);
    // Read bucket for the same IP is untouched.
    const read = await gateApiRequest(makeRequest("GET", ip));
    expect(read.limited).toBe(false);
  });

  it("tracks IPs independently", async () => {
    for (let i = 0; i < GATE_WRITE.limit; i++) {
      await gateApiRequest(
        makeRequest("POST", { "x-forwarded-for": "203.0.113.13" })
      );
    }
    const other = await gateApiRequest(
      makeRequest("POST", { "x-forwarded-for": "203.0.113.14" })
    );
    expect(other.limited).toBe(false);
  });

  it("treats HEAD as a read", async () => {
    const req = makeRequest("HEAD", { "x-forwarded-for": "203.0.113.15" });
    const result = await gateApiRequest(req);
    expect(result.limited).toBe(false);
  });

  it("keeps the read ceiling above the write ceiling", () => {
    expect(GATE_READ.limit).toBeGreaterThan(GATE_WRITE.limit);
  });
});
