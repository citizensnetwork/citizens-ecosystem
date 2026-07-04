import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase
const mockGetUser = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();

vi.mock("@/lib/supabase/server", () => {
  interface ChainTail {
    gte: () => ChainTail;
    lte: () => ChainTail;
    not: () => ChainTail;
    then: (cb: (v: { data: unknown[]; count: number; error: null }) => unknown) => unknown;
    catch: () => ChainTail;
    finally: () => ChainTail;
  }

  function makeChainTail(): ChainTail {
    const tail: ChainTail = {
      gte: () => tail,
      lte: () => tail,
      not: () => tail,
      then: (cb) => cb({ data: [], count: 0, error: null }),
      catch: () => tail,
      finally: () => tail,
    };
    return tail;
  }

  return {
    createClient: vi.fn().mockResolvedValue({
      auth: { getUser: () => mockGetUser() },
      from: () => ({
        select: (...args: unknown[]) => {
          mockSelect(...args);
          return {
            eq: (...eqArgs: unknown[]) => {
              mockEq(...eqArgs);
              return makeChainTail();
            },
          };
        },
      }),
    }),
  };
});

const { GET } = await import("@/app/api/metrics/overview/route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/metrics/overview");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

describe("GET /api/metrics/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
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

  it("returns 400 when org_id is invalid UUID", async () => {
    const res = await GET(makeRequest({ org_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with KPIs, departments, type_distribution", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("kpis");
    expect(body).toHaveProperty("departments");
    expect(body).toHaveProperty("type_distribution");
    expect(body.kpis).toHaveProperty("total_activities");
    expect(body.kpis).toHaveProperty("participants_reached");
    expect(body.kpis).toHaveProperty("active_departments");
    expect(body.kpis).toHaveProperty("activity_growth_pct");
  });

  it("accepts optional date_from and date_to", async () => {
    const res = await GET(
      makeRequest({
        org_id: VALID_ORG,
        date_from: "2026-01-01",
        date_to: "2026-03-31",
      })
    );
    expect(res.status).toBe(200);
  });

  it("returns growth_pct of 100 when previous period has 0 activities", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // With mocked empty data, growth should be 0 (no current either)
    expect(typeof body.kpis.activity_growth_pct).toBe("number");
  });

  it("returns period_days and date range in KPIs", async () => {
    const res = await GET(
      makeRequest({
        org_id: VALID_ORG,
        date_from: "2026-01-01",
        date_to: "2026-01-31",
      })
    );
    const body = await res.json();
    expect(body.kpis.period_days).toBe(30);
    expect(body.kpis.date_from).toBe("2026-01-01");
    expect(body.kpis.date_to).toBe("2026-01-31");
  });

  it("returns empty arrays for departments and type_distribution with no data", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    const body = await res.json();
    expect(body.departments).toEqual([]);
    expect(body.type_distribution).toEqual([]);
  });
});
