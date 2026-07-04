import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET, POST } = await import("@/app/api/goals/route");

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
  return new NextRequest(new URL(url, "http://localhost"), init as never);
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("GET /api/goals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(createRequest("GET", `http://localhost/api/goals?org_id=${VALID_UUID}`));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(createRequest("GET", "http://localhost/api/goals"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(createRequest("GET", "http://localhost/api/goals?org_id=bad-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns goals with pagination", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ id: "g1", title: "Goal 1" }],
        count: 1,
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(mockQuery);

    const res = await GET(createRequest("GET", `http://localhost/api/goals?org_id=${VALID_UUID}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(1);
  });
});

describe("POST /api/goals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      createRequest("POST", `http://localhost/api/goals?org_id=${VALID_UUID}`, {
        title: "Test Goal",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(
      createRequest("POST", "http://localhost/api/goals", { title: "Test" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(
      createRequest("POST", `http://localhost/api/goals?org_id=${VALID_UUID}`, {
        title: "A", // too short
      })
    );
    expect(res.status).toBe(400);
  });

  it("creates goal successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const mockInsert = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "g1", title: "Test Goal", org_id: VALID_UUID },
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(mockInsert);

    const res = await POST(
      createRequest("POST", `http://localhost/api/goals?org_id=${VALID_UUID}`, {
        title: "Test Goal",
        priority_weight: 2.0,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.title).toBe("Test Goal");
  });
});
