import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase — the route wraps the vision.shared_audience(org,from,to,limit) RPC (mig 182).
const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const { GET } = await import("@/app/api/metrics/shared-audience/route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/metrics/shared-audience");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

const ROW = {
  other_id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  other_name: "Grace Fellowship",
  other_logo_url: null,
  shared_count: 23,
  my_audience: 120,
  other_audience: 90,
  shared_pct_of_mine: "19.2",
  shared_pct_of_other: "25.6",
  period_start: "2026-07-17",
  period_end: "2026-10-14",
};

describe("GET /api/metrics/shared-audience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockRpc.mockResolvedValue({ data: [ROW], error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when org_id is missing or not a UUID", async () => {
    expect((await GET(makeRequest({}))).status).toBe(400);
    expect((await GET(makeRequest({ org_id: "not-a-uuid" }))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls shared_audience and returns the rows under data", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "shared_audience",
      expect.objectContaining({ p_org_id: VALID_ORG, p_limit: 12 })
    );
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].other_name).toBe("Grace Fellowship");
    expect(body.data[0].shared_count).toBe(23);
  });

  it("returns only organisation-level fields: no citizen identity is ever passed through", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    const body = await res.json();
    expect(Object.keys(body.data[0]).sort()).toEqual(Object.keys(ROW).sort());
  });

  it("passes a valid days param as a trailing p_from window", async () => {
    await GET(makeRequest({ org_id: VALID_ORG, days: "30" }));
    const call = mockRpc.mock.calls[0][1] as { p_from: string };
    const from = new Date(call.p_from + "T00:00:00Z").getTime();
    const days = (Date.now() - from) / 86400000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
  });

  it("ignores an out-of-range days param (falls back to the 90-day default)", async () => {
    await GET(makeRequest({ org_id: VALID_ORG, days: "9999" }));
    const call = mockRpc.mock.calls[0][1] as { p_from: string };
    const days = (Date.now() - new Date(call.p_from + "T00:00:00Z").getTime()) / 86400000;
    expect(days).toBeGreaterThan(85);
    expect(days).toBeLessThan(95);
  });

  it("passes a valid limit and ignores an invalid one", async () => {
    await GET(makeRequest({ org_id: VALID_ORG, limit: "5" }));
    expect((mockRpc.mock.calls[0][1] as { p_limit: number }).p_limit).toBe(5);
    await GET(makeRequest({ org_id: VALID_ORG, limit: "500" }));
    expect((mockRpc.mock.calls[1][1] as { p_limit: number }).p_limit).toBe(12);
    await GET(makeRequest({ org_id: VALID_ORG, limit: "0" }));
    expect((mockRpc.mock.calls[2][1] as { p_limit: number }).p_limit).toBe(12);
    await GET(makeRequest({ org_id: VALID_ORG, limit: "abc" }));
    expect((mockRpc.mock.calls[3][1] as { p_limit: number }).p_limit).toBe(12);
  });

  it("returns an empty list when the org is unlinked or nothing clears the privacy floor", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it("treats a null result as an empty list", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect((await res.json()).data).toEqual([]);
  });

  it("maps the reader's 42501 membership gate to 403", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "unauthorized" } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(403);
  });

  it("returns 500 on an unexpected reader error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
