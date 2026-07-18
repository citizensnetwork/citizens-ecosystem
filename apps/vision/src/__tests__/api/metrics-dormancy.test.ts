import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase — the route wraps the vision.dormancy_watch(org,threshold,lookback) RPC (mig 156).
const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

// Mock the Connect client — the route resolves dormant contributor IDs → public names.
const mockGetProfile = vi.fn();
vi.mock("@/lib/connect/api", () => ({
  connectApi: { getProfile: (id: string) => mockGetProfile(id) },
}));

const { GET } = await import("@/app/api/metrics/dormancy/route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/metrics/dormancy");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };
const ID_A = "11111111-1111-4111-8111-000000000003";
const ID_B = "11111111-1111-4111-8111-000000000004";

const ROW = {
  threshold_days: 60,
  orbit_size: 2,
  dormant_count: 2,
  dormant_pct: "100.0",
  max_days_quiet: 72,
  dormant_ids: [ID_A, ID_B],
  period_start: "2026-01-06",
  period_end: "2026-07-04",
};

describe("GET /api/metrics/dormancy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockRpc.mockResolvedValue({ data: [ROW], error: null });
    mockGetProfile.mockImplementation((id: string) =>
      Promise.resolve({
        data: {
          id,
          full_name: id === ID_A ? "Grace Foundation" : "Hope Outreach",
          avatar_url: null,
        },
        meta: {},
      })
    );
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

  it("calls dormancy_watch and returns the row with resolved names", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "dormancy_watch",
      expect.objectContaining({ p_org_id: VALID_ORG, p_threshold_days: 60 })
    );
    const body = await res.json();
    expect(body.data.orbit_size).toBe(2);
    expect(body.data.dormant_count).toBe(2);
    expect(body.data.dormant_pct).toBe("100.0");
    expect(body.data.names).toEqual(["Grace Foundation", "Hope Outreach"]);
    // Names come from the app layer, never from the (PII-free) reader.
    expect(body.data).not.toHaveProperty("dormant_ids");
  });

  it("passes a valid days param as the dormancy threshold", async () => {
    await GET(makeRequest({ org_id: VALID_ORG, days: "90" }));
    expect(mockRpc).toHaveBeenCalledWith(
      "dormancy_watch",
      expect.objectContaining({ p_threshold_days: 90 })
    );
  });

  it("ignores an out-of-range days param (falls back to the 60d default)", async () => {
    await GET(makeRequest({ org_id: VALID_ORG, days: "9999" }));
    expect(mockRpc).toHaveBeenCalledWith(
      "dormancy_watch",
      expect.objectContaining({ p_threshold_days: 60 })
    );
  });

  it("degrades to no names when Connect profile resolution fails (best-effort)", async () => {
    mockGetProfile.mockRejectedValue(new Error("Connect API 500"));
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dormant_count).toBe(2);
    expect(body.data.names).toEqual([]);
  });

  it("keeps the names that resolve when only some lookups fail", async () => {
    mockGetProfile.mockImplementation((id: string) =>
      id === ID_A
        ? Promise.resolve({ data: { id, full_name: "Grace Foundation", avatar_url: null }, meta: {} })
        : Promise.reject(new Error("not found"))
    );
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    const body = await res.json();
    expect(body.data.names).toEqual(["Grace Foundation"]);
  });

  it("returns a neutral row (orbit but no dormant) without calling Connect", async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ROW, dormant_count: 0, dormant_pct: "0.0", max_days_quiet: null, dormant_ids: [] }],
      error: null,
    });
    const res = await GET(makeRequest({ org_id: VALID_ORG, days: "90" }));
    const body = await res.json();
    expect(body.data.orbit_size).toBe(2);
    expect(body.data.dormant_count).toBe(0);
    expect(body.data.names).toEqual([]);
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it("returns data:null when the org is unlinked (empty reader set)", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
    expect(mockGetProfile).not.toHaveBeenCalled();
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
