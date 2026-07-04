import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET, POST } = await import("@/app/api/boundaries/route");

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

const validPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [28.0, -25.0],
      [28.1, -25.0],
      [28.1, -25.1],
      [28.0, -25.1],
      [28.0, -25.0],
    ],
  ],
};

describe("GET /api/boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      createRequest("GET", `http://localhost/api/boundaries?org_id=${VALID_UUID}`)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await GET(
      createRequest("GET", "http://localhost/api/boundaries")
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-members", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const res = await GET(
      createRequest("GET", `http://localhost/api/boundaries?org_id=${VALID_UUID}`)
    );
    expect(res.status).toBe(403);
  });

  it("returns boundaries for members", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_member" } }),
    };
    const boundaryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ id: "b1", name: "Area 1" }],
        count: 1,
        error: null,
      }),
    };
    mockSupabase.from
      .mockReturnValueOnce(memberChain) // user_org_roles
      .mockReturnValueOnce(boundaryChain); // geo_boundaries

    const res = await GET(
      createRequest("GET", `http://localhost/api/boundaries?org_id=${VALID_UUID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.boundaries).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});

describe("POST /api/boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      createRequest("POST", "http://localhost/api/boundaries", {
        org_id: VALID_UUID,
        name: "Test",
        boundary_geojson: validPolygon,
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing name", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await POST(
      createRequest("POST", "http://localhost/api/boundaries", {
        org_id: VALID_UUID,
        boundary_geojson: validPolygon,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid GeoJSON", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await POST(
      createRequest("POST", "http://localhost/api/boundaries", {
        org_id: VALID_UUID,
        name: "Test",
        boundary_geojson: { type: "Point", coordinates: [0, 0] },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin/manager", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_member" } }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const res = await POST(
      createRequest("POST", "http://localhost/api/boundaries", {
        org_id: VALID_UUID,
        name: "Test",
        boundary_geojson: validPolygon,
      })
    );
    expect(res.status).toBe(403);
  });

  it("creates boundary for admin", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }),
    };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "b1", name: "Test", org_id: VALID_UUID },
        error: null,
      }),
    };
    mockSupabase.from
      .mockReturnValueOnce(memberChain) // user_org_roles
      .mockReturnValueOnce(insertChain); // geo_boundaries insert

    const res = await POST(
      createRequest("POST", "http://localhost/api/boundaries", {
        org_id: VALID_UUID,
        name: "Test",
        boundary_geojson: validPolygon,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Test");
  });
});
