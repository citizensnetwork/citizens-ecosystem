import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            lte: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { date: "2026-01-05", participant_count: 10, type: "event" },
                    { date: "2026-01-05", participant_count: 5, type: "meeting" },
                    { date: "2026-01-12", participant_count: 20, type: "event" },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

const { GET } = await import("@/app/api/metrics/trends/route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/metrics/trends");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

describe("GET /api/metrics/trends", () => {
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
    const res = await GET(makeRequest({ org_id: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid granularity", async () => {
    const res = await GET(
      makeRequest({ org_id: VALID_ORG, granularity: "hour" })
    );
    expect(res.status).toBe(400);
  });

  it("returns trend data with default day granularity", async () => {
    const res = await GET(
      makeRequest({
        org_id: VALID_ORG,
        date_from: "2026-01-01",
        date_to: "2026-01-31",
      })
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("trend");
    expect(body).toHaveProperty("type_breakdown");
    expect(body).toHaveProperty("granularity", "day");
    expect(Array.isArray(body.trend)).toBe(true);
  });

  it("aggregates by week when specified", async () => {
    const res = await GET(
      makeRequest({
        org_id: VALID_ORG,
        date_from: "2026-01-01",
        date_to: "2026-01-31",
        granularity: "week",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.granularity).toBe("week");
  });

  it("aggregates by month when specified", async () => {
    const res = await GET(
      makeRequest({
        org_id: VALID_ORG,
        date_from: "2026-01-01",
        date_to: "2026-06-30",
        granularity: "month",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.granularity).toBe("month");
  });

  it("returns date_from and date_to in response", async () => {
    const res = await GET(
      makeRequest({
        org_id: VALID_ORG,
        date_from: "2026-01-01",
        date_to: "2026-01-31",
      })
    );
    const body = await res.json();
    expect(body.date_from).toBe("2026-01-01");
    expect(body.date_to).toBe("2026-01-31");
  });
});
