import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase — the route wraps the vision.activity_metrics(org) RPC (mig 153).
const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const { GET } = await import("@/app/api/metrics/activities/route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/metrics/activities");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

describe("GET /api/metrics/activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockRpc.mockResolvedValue({ data: [], error: null });
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

  it("calls activity_metrics with the org id and returns its rows", async () => {
    const row = {
      activity_id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      cc_event_id: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      reach: 218,
      impression_count: 900,
      attending_count: 218,
      engagement_score: "72.00",
      review_count: 12,
      avg_rating: "4.70",
    };
    mockRpc.mockResolvedValue({ data: [row], error: null });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("activity_metrics", { p_org_id: VALID_ORG });
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].activity_id).toBe(row.activity_id);
    expect(body.data[0].reach).toBe(218);
    expect(body.data[0].avg_rating).toBe("4.70");
  });

  it("returns 200 with an empty array when no activities are claimed", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
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
