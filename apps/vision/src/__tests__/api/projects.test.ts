import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET, POST } = await import("@/app/api/projects/route");

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

describe("GET /api/projects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      createRequest("GET", `http://localhost/api/projects?org_id=${VALID_UUID}`)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await GET(
      createRequest("GET", "http://localhost/api/projects")
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await GET(
      createRequest("GET", "http://localhost/api/projects?org_id=bad-uuid")
    );
    expect(res.status).toBe(400);
  });

  it("returns projects with pagination", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ id: "p1", name: "Project 1" }],
        count: 1,
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(mockQuery);

    const res = await GET(
      createRequest(
        "GET",
        `http://localhost/api/projects?org_id=${VALID_UUID}`
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(1);
  });

  it("applies status filter", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(mockQuery);

    const res = await GET(
      createRequest(
        "GET",
        `http://localhost/api/projects?org_id=${VALID_UUID}&status=active`
      )
    );
    expect(res.status).toBe(200);
    // eq should be called for org_id and status
    expect(mockQuery.eq).toHaveBeenCalledWith("status", "active");
  });

  it("applies search filter", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(mockQuery);

    const res = await GET(
      createRequest(
        "GET",
        `http://localhost/api/projects?org_id=${VALID_UUID}&search=wellness`
      )
    );
    expect(res.status).toBe(200);
    expect(mockQuery.ilike).toHaveBeenCalledWith("name", "%wellness%");
  });

  it("returns 500 on database error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: null,
        count: null,
        error: { message: "DB error" },
      }),
    };
    mockSupabase.from.mockReturnValue(mockQuery);

    const res = await GET(
      createRequest(
        "GET",
        `http://localhost/api/projects?org_id=${VALID_UUID}`
      )
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /api/projects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      createRequest(
        "POST",
        `http://localhost/api/projects?org_id=${VALID_UUID}`,
        { name: "Test" }
      )
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await POST(
      createRequest("POST", "http://localhost/api/projects", {
        name: "Test Project",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await POST(
      createRequest(
        "POST",
        `http://localhost/api/projects?org_id=${VALID_UUID}`,
        { name: "A" } // too short
      )
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when end_date precedes start_date", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await POST(
      createRequest(
        "POST",
        `http://localhost/api/projects?org_id=${VALID_UUID}`,
        {
          name: "Test Project",
          start_date: "2026-12-01",
          end_date: "2026-01-01",
        }
      )
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("End date");
  });

  it("creates project successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const mockInsert = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "p1",
          name: "Test Project",
          org_id: VALID_UUID,
          status: "planning",
        },
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(mockInsert);

    const res = await POST(
      createRequest(
        "POST",
        `http://localhost/api/projects?org_id=${VALID_UUID}`,
        { name: "Test Project" }
      )
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("Test Project");
  });

  it("returns 500 on database error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const mockInsert = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      }),
    };
    mockSupabase.from.mockReturnValue(mockInsert);

    const res = await POST(
      createRequest(
        "POST",
        `http://localhost/api/projects?org_id=${VALID_UUID}`,
        { name: "Test Project" }
      )
    );
    expect(res.status).toBe(500);
  });
});
