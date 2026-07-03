import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock supabase
const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET } = await import("@/app/api/map/activities/route");

function createRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

const VALID_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_DEPT_ID = "660e8400-e29b-41d4-a716-446655440001";

describe("GET /api/map/activities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = createRequest(
      `http://localhost/api/map/activities?org_id=${VALID_ORG_ID}`
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createRequest("http://localhost/api/map/activities");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("org_id");
  });

  it("returns 400 for invalid org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createRequest(
      "http://localhost/api/map/activities?org_id=not-a-uuid"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns geolocated activities successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: "act-1",
            title: "Community Meeting",
            type: "meeting",
            date: "2026-04-01",
            latitude: -25.75,
            longitude: 28.23,
            location_name: "City Hall",
            participant_count: 50,
            department_id: "dept-1",
            departments: { name: "Operations" },
            activity_tags: [{ tag: "community" }, { tag: "planning" }],
          },
          {
            id: "act-2",
            title: "Workshop",
            type: "workshop",
            date: "2026-04-02",
            latitude: -25.80,
            longitude: 28.30,
            location_name: null,
            participant_count: 20,
            department_id: null,
            departments: null,
            activity_tags: [],
          },
        ],
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = createRequest(
      `http://localhost/api/map/activities?org_id=${VALID_ORG_ID}`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(2);

    // Verify first activity transformation
    expect(body.data[0]).toEqual({
      id: "act-1",
      title: "Community Meeting",
      type: "meeting",
      date: "2026-04-01",
      latitude: -25.75,
      longitude: 28.23,
      location_name: "City Hall",
      participant_count: 50,
      department_id: "dept-1",
      department_name: "Operations",
      tags: ["community", "planning"],
    });

    // Verify second activity (nulls handled)
    expect(body.data[1].department_name).toBeNull();
    expect(body.data[1].tags).toEqual([]);
  });

  it("applies filters correctly", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const url = [
      `http://localhost/api/map/activities?org_id=${VALID_ORG_ID}`,
      `department_id=${VALID_DEPT_ID}`,
      "type=meeting",
      "date_from=2026-04-01",
      "date_to=2026-04-30",
      "search=test",
    ].join("&");

    const req = createRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Verify filter chain was called
    expect(chain.eq).toHaveBeenCalledWith("org_id", VALID_ORG_ID);
    expect(chain.eq).toHaveBeenCalledWith("department_id", VALID_DEPT_ID);
    expect(chain.eq).toHaveBeenCalledWith("type", "meeting");
    expect(chain.gte).toHaveBeenCalledWith("date", "2026-04-01");
    expect(chain.lte).toHaveBeenCalledWith("date", "2026-04-30");
    expect(chain.ilike).toHaveBeenCalledWith("title", "%test%");
  });

  it("ignores invalid department_id filter", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = createRequest(
      `http://localhost/api/map/activities?org_id=${VALID_ORG_ID}&department_id=invalid`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Should have been called with org_id only (not the invalid department_id)
    const eqCalls = chain.eq.mock.calls.map((call: unknown[]) => call[0]);
    expect(eqCalls).not.toContain("department_id");
  });

  it("returns 500 on database error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "DB connection failed" },
      }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = createRequest(
      `http://localhost/api/map/activities?org_id=${VALID_ORG_ID}`
    );
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("DB connection failed");
  });

  it("limits results to 5000", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = createRequest(
      `http://localhost/api/map/activities?org_id=${VALID_ORG_ID}`
    );
    await GET(req);

    expect(chain.limit).toHaveBeenCalledWith(5000);
  });
});
