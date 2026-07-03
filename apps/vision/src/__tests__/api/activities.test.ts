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

const { GET, POST } = await import("@/app/api/activities/route");

function createRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost"));
}

describe("GET /api/activities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = createRequest(
      "GET",
      "http://localhost/api/activities?org_id=550e8400-e29b-41d4-a716-446655440000"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createRequest("GET", "http://localhost/api/activities");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createRequest(
      "GET",
      "http://localhost/api/activities?org_id=not-a-uuid"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns activities with pagination metadata", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [
          { id: "act-1", title: "Workshop", type: "workshop" },
          { id: "act-2", title: "Meeting", type: "meeting" },
        ],
        error: null,
        count: 2,
      }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = createRequest(
      "GET",
      "http://localhost/api/activities?org_id=550e8400-e29b-41d4-a716-446655440000"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.total).toBe(2);
  });

  it("applies type filter", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = createRequest(
      "GET",
      "http://localhost/api/activities?org_id=550e8400-e29b-41d4-a716-446655440000&type=event"
    );
    await GET(req);

    // eq should be called with "type", "event" at some point
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls.some((c: string[]) => c[0] === "type" && c[1] === "event")).toBe(
      true
    );
  });
});

describe("POST /api/activities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = new NextRequest(
      new URL(
        "http://localhost/api/activities?org_id=550e8400-e29b-41d4-a716-446655440000"
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test", type: "event", date: "2025-01-01" }),
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL("http://localhost/api/activities"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test", type: "event", date: "2025-01-01" }),
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body (missing required fields)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL(
        "http://localhost/api/activities?org_id=550e8400-e29b-41d4-a716-446655440000"
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test" }), // missing type and date
      }
    );
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("creates activity on valid input", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const actData = {
      id: "act-1",
      title: "Workshop",
      type: "workshop",
      date: "2025-01-15",
      org_id: "550e8400-e29b-41d4-a716-446655440000",
      created_by: "user-1",
    };

    // Insert chain
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: actData, error: null }),
    };

    // Re-fetch chain
    const refetchChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { ...actData, activity_tags: [] },
        error: null,
      }),
    };

    mockSupabase.from
      .mockReturnValueOnce(insertChain) // activities insert
      .mockReturnValueOnce(refetchChain); // activities re-fetch

    const req = new NextRequest(
      new URL(
        "http://localhost/api/activities?org_id=550e8400-e29b-41d4-a716-446655440000"
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Workshop",
          type: "workshop",
          date: "2025-01-15",
        }),
      }
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.title).toBe("Workshop");
  });
});
