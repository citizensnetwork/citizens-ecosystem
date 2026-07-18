import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase — the route wraps the vision.cross_pollination(org,from,to) RPC (mig 155).
const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const { GET } = await import("@/app/api/metrics/cross-pollination/route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/metrics/cross-pollination");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

const ROW = {
  audience_size: 4,
  citizens_discovering: 2,
  new_connections: 3,
  distinct_new_orgs: 2,
  discovery_rate_pct: "50.0",
  avg_new_orgs_per_citizen: "0.75",
  period_start: "2026-04-05",
  period_end: "2026-07-03",
};

describe("GET /api/metrics/cross-pollination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockRpc.mockResolvedValue({ data: [ROW], error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org_id is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when org_id is not a valid UUID", async () => {
    const res = await GET(makeRequest({ org_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("calls cross_pollination and returns the single row under data", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "cross_pollination",
      expect.objectContaining({ p_org_id: VALID_ORG })
    );
    const body = await res.json();
    expect(body.data.audience_size).toBe(4);
    expect(body.data.citizens_discovering).toBe(2);
    expect(body.data.discovery_rate_pct).toBe("50.0");
  });

  it("passes a valid days param as a trailing p_from window", async () => {
    await GET(makeRequest({ org_id: VALID_ORG, days: "30" }));
    const call = mockRpc.mock.calls[0][1] as { p_from: string };
    expect(typeof call.p_from).toBe("string");
    // 30-day window → p_from is ~29 days before today (ISO date string).
    const from = new Date(call.p_from + "T00:00:00Z").getTime();
    const now = Date.now();
    const days = (now - from) / 86400000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
  });

  it("ignores an out-of-range days param (falls back to the default window)", async () => {
    await GET(makeRequest({ org_id: VALID_ORG, days: "9999" }));
    const call = mockRpc.mock.calls[0][1] as { p_from: string };
    const from = new Date(call.p_from + "T00:00:00Z").getTime();
    const days = (Date.now() - from) / 86400000;
    // Clamped back to the 90-day default rather than 9999.
    expect(days).toBeGreaterThan(85);
    expect(days).toBeLessThan(95);
  });

  it("returns data:null when the org is unlinked (empty reader set)", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it("maps the reader's 42501 membership gate to 403", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "unauthorized" } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(403);
  });

  it("returns 500 on an unexpected reader error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(500);
  });
});
