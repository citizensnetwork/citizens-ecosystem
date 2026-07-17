import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase: rpc per function name, from() per table.
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockOrgRow = vi.fn();
const mockSnapshotRows = vi.fn();

vi.mock("@/lib/supabase/server", () => {
  return {
    createClient: vi.fn().mockResolvedValue({
      auth: { getUser: () => mockGetUser() },
      rpc: (fn: string, args: unknown) => mockRpc(fn, args),
      from: (table: string) => {
        if (table === "organisations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => mockOrgRow(),
              }),
            }),
          };
        }
        // vision_period_snapshots chain: select().eq().eq().is().gte().order()
        const tail = {
          eq: () => tail,
          is: () => tail,
          gte: () => tail,
          order: () => mockSnapshotRows(),
        };
        return { select: () => tail };
      },
    }),
  };
});

const { GET } = await import("@/app/api/metrics/connect/route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/metrics/connect");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CONTRIBUTOR = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

const REACH_ROW = {
  total_reach: 34,
  impression_total: 20,
  attending_total: 10,
  considering_total: 3,
  cancellation_total: 1,
  event_count: 153,
  avg_reach: 0.22,
};
const ENGAGEMENT_ROW = {
  attending_total: 10,
  considering_total: 3,
  followers_total: 1,
  reviews_total: 2,
  broadcasts_total: 0,
  updates_total: 0,
  engagement_score: 0.22,
  event_count: 153,
  top_component: "followers",
};
const GROWTH_ROWS = [
  {
    metric_name: "reach",
    current_value: 12,
    previous_value: 10,
    growth_pct: 20.0,
    current_period_start: "2026-06-03",
    previous_period_start: "2026-05-04",
  },
];
const RETENTION_ROW = {
  current_distinct: 1,
  previous_distinct: 2,
  returning_count: 0,
  new_count: 1,
  churned_count: 2,
  retention_pct: 0.0,
  acquisition_pct: 100.0,
  churn_pct: 100.0,
  current_period_start: "2026-06-03",
  previous_period_start: "2026-05-04",
};
const FUNNEL_ROW = {
  impressions: 100,
  considering: 40,
  attending: 20,
  reviews: 5,
  follows: 3,
  impression_to_attend_pct: 20.0,
  attend_to_review_pct: 25.0,
  review_to_follow_pct: 60.0,
  event_count: 12,
};
const BROADCAST_ROW = {
  broadcasts_sent: 4,
  audience_total: 320,
  rsvps_within_48h: 21,
  follows_within_48h: 8,
  reactions_total: 12,
  conversion_pct: 9.1,
};

function mockHappyRpcs() {
  mockRpc.mockImplementation((fn: string) => {
    const data =
      fn === "reach_per_org" ? [REACH_ROW]
      : fn === "engagement_per_org" ? [ENGAGEMENT_ROW]
      : fn === "calendar_growth" ? GROWTH_ROWS
      : fn === "retention_rate" ? [RETENTION_ROW]
      : fn === "activity_funnel" ? [FUNNEL_ROW]
      : fn === "broadcast_effectiveness" ? [BROADCAST_ROW]
      : [];
    return Promise.resolve({ data, error: null });
  });
}

describe("GET /api/metrics/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockOrgRow.mockResolvedValue({
      data: { id: VALID_ORG, name: "Hope Collective", connect_contributor_id: CONTRIBUTOR },
      error: null,
    });
    mockSnapshotRows.mockResolvedValue({
      data: [{ period_start: "2026-07-02", reach_total: 5, attending_count: 2, engagement_score: 1.5, distinct_persons: 3, active_events: 1 }],
      error: null,
    });
    mockHappyRpcs();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org_id is missing or invalid", async () => {
    expect((await GET(makeRequest({}))).status).toBe(400);
    expect((await GET(makeRequest({ org_id: "nope" }))).status).toBe(400);
  });

  it("returns 400 on an invalid period kind", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG, period: "year" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the org is not visible to the caller", async () => {
    mockOrgRow.mockResolvedValue({ data: null, error: null });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(404);
  });

  it("returns linked:false without calling the RPCs when the org has no Connect link", async () => {
    mockOrgRow.mockResolvedValue({
      data: { id: VALID_ORG, name: "Hope Collective", connect_contributor_id: null },
      error: null,
    });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linked).toBe(false);
    expect(body.reach).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("maps the readers' 42501 membership gate to 403", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "unauthorized" } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(403);
  });

  it("returns the four metric blocks + snapshot series on the happy path", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG, period: "month" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linked).toBe(true);
    expect(body.period).toBe("month");
    expect(body.reach.total_reach).toBe(34);
    expect(body.engagement.top_component).toBe("followers");
    expect(body.growth).toHaveLength(1);
    expect(body.retention.previous_distinct).toBe(2);
    expect(body.series).toHaveLength(1);
    // Display Convention #8: counts ride beside every percentage.
    expect(body.retention.returning_count).toBe(0);
    expect(body.growth[0].previous_value).toBe(10);
    // period kind is forwarded to the period-scoped readers
    expect(mockRpc).toHaveBeenCalledWith("calendar_growth", {
      p_org_id: VALID_ORG,
      p_period_kind: "month",
    });
    expect(mockRpc).toHaveBeenCalledWith("retention_rate", {
      p_org_id: VALID_ORG,
      p_period_kind: "month",
    });
  });

  it("returns the funnel + broadcast blocks (mig 150) with counts beside every pct", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG, period: "month" }));
    const body = await res.json();
    expect(body.funnel.impression_to_attend_pct).toBe(20.0);
    expect(body.funnel.impressions).toBe(100);
    expect(body.funnel.attending).toBe(20);
    expect(body.broadcast.broadcasts_sent).toBe(4);
    expect(body.broadcast.conversion_pct).toBe(9.1);
    // funnel is windowed to a trailing range; broadcast uses its default lookback
    expect(mockRpc).toHaveBeenCalledWith(
      "activity_funnel",
      expect.objectContaining({ p_org_id: VALID_ORG, p_from: expect.any(String) })
    );
    expect(mockRpc).toHaveBeenCalledWith("broadcast_effectiveness", { p_org_id: VALID_ORG });
  });

  it("leaves funnel/broadcast null (best-effort) when their reader errors, without failing the call", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "activity_funnel" || fn === "broadcast_effectiveness") {
        return Promise.resolve({ data: null, error: { message: "boom" } });
      }
      const data =
        fn === "reach_per_org" ? [REACH_ROW]
        : fn === "engagement_per_org" ? [ENGAGEMENT_ROW]
        : fn === "calendar_growth" ? GROWTH_ROWS
        : fn === "retention_rate" ? [RETENTION_ROW]
        : [];
      return Promise.resolve({ data, error: null });
    });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linked).toBe(true);
    expect(body.reach.total_reach).toBe(34); // core RGRE unaffected
    expect(body.funnel).toBeNull();
    expect(body.broadcast).toBeNull();
  });

  it("degrades to an empty series when the snapshot read errors (RLS-scoped)", async () => {
    mockSnapshotRows.mockResolvedValue({ data: null, error: { message: "denied" } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linked).toBe(true);
    expect(body.series).toEqual([]);
  });
});
