import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockSpacesList = vi.fn();
const mockOrgRow = vi.fn();
const mockSnaps = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    rpc: (fn: string, args: unknown) => mockRpc(fn, args),
    from: (table: string) => {
      if (table === "spaces") {
        return {
          select: () => ({ eq: () => ({ order: () => ({ order: () => mockSpacesList() }) }) }),
          insert: () => ({ select: () => ({ single: () => mockInsert() }) }),
        };
      }
      if (table === "organisations") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => mockOrgRow() }) }) };
      }
      // vision_period_snapshots: select().eq().eq().not().gte().order()
      const tail = {
        eq: () => tail,
        not: () => tail,
        gte: () => tail,
        order: () => mockSnaps(),
      };
      return { select: () => tail };
    },
  }),
}));

const { GET, POST } = await import("@/app/api/spaces/route");

const ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CC = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };
const SP1 = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const SP2 = "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function req(method: string, params: Record<string, string>, body?: unknown) {
  const url = new URL("http://localhost/api/spaces");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /api/spaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockSpacesList.mockResolvedValue({
      data: [
        { id: SP1, name: "Outreach", description: null, colour: "#4a90d9", icon: "map", sort_order: 0 },
        { id: SP2, name: "Volunteers", description: null, colour: "#2ecc71", icon: "users", sort_order: 1 },
      ],
      error: null,
    });
    mockOrgRow.mockResolvedValue({ data: { connect_contributor_id: CC }, error: null });
    mockSnaps.mockResolvedValue({
      data: [
        { space_id: SP1, period_start: "2026-07-01", reach_total: 10 },
        { space_id: SP1, period_start: "2026-07-02", reach_total: 14 },
      ],
      error: null,
    });
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "reach_per_space") {
        return Promise.resolve({
          data: [
            { space_id: SP1, space_name: "Outreach", total_reach: 476, distinct_persons: 41, event_count: 6, avg_reach: 79 },
          ],
          error: null,
        });
      }
      if (fn === "engagement_per_space") {
        return Promise.resolve({
          data: [{ space_id: SP1, space_name: "Outreach", engagement_score: 62, top_component: "attending", event_count: 6 }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
  });

  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(req("GET", { org_id: ORG }))).status).toBe(401);
  });

  it("400 on missing/invalid org_id", async () => {
    expect((await GET(req("GET", {}))).status).toBe(400);
    expect((await GET(req("GET", { org_id: "nope" }))).status).toBe(400);
  });

  it("merges per-space metrics + trend onto the base list", async () => {
    const res = await GET(req("GET", { org_id: ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    const outreach = body.data.find((s: { id: string }) => s.id === SP1);
    expect(outreach.reach).toBe(476);
    expect(outreach.people).toBe(41);
    expect(outreach.activities).toBe(6);
    expect(outreach.engagement).toBe(62);
    expect(outreach.top_component).toBe("attending");
    expect(outreach.trend).toEqual([10, 14]);
    // A space with no reader row still lists with honest zeros (never < demo).
    const vols = body.data.find((s: { id: string }) => s.id === SP2);
    expect(vols.reach).toBe(0);
    expect(vols.activities).toBe(0);
    expect(vols.trend).toEqual([]);
  });

  it("403 when the space readers raise the 42501 membership gate", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await GET(req("GET", { org_id: ORG }))).status).toBe(403);
  });

  it("still lists spaces with zero metrics when a reader errors (best-effort)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await GET(req("GET", { org_id: ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].reach).toBe(0);
  });
});

describe("POST /api/spaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockInsert.mockResolvedValue({
      data: { id: SP1, name: "New Space", description: null, colour: "#4a90d9", icon: null, sort_order: 0 },
      error: null,
    });
  });

  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req("POST", { org_id: ORG }, { name: "X" }))).status).toBe(401);
  });

  it("400 on validation failure (empty name)", async () => {
    expect((await POST(req("POST", { org_id: ORG }, { name: "" }))).status).toBe(400);
  });

  it("201 creates a space", async () => {
    const res = await POST(req("POST", { org_id: ORG }, { name: "New Space" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(SP1);
  });

  it("403 when RLS denies the insert (not an admin)", async () => {
    mockInsert.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    expect((await POST(req("POST", { org_id: ORG }, { name: "New Space" }))).status).toBe(403);
  });
});
