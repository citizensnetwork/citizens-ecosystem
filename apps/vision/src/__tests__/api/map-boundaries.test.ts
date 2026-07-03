import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET } = await import("@/app/api/map/boundaries/route");

function createRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("GET /api/map/boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      createRequest(`http://localhost/api/map/boundaries?org_id=${VALID_UUID}`)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await GET(
      createRequest("http://localhost/api/map/boundaries")
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
      createRequest(`http://localhost/api/map/boundaries?org_id=${VALID_UUID}`)
    );
    expect(res.status).toBe(403);
  });

  it("returns GeoJSON FeatureCollection for members", async () => {
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
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "b1",
            org_id: VALID_UUID,
            name: "Area 1",
            description: null,
            boundary_geojson: {
              type: "Polygon",
              coordinates: [[[28, -25], [28.1, -25], [28.1, -25.1], [28, -25.1], [28, -25]]],
            },
            area_km2: 100,
            colour: "#4a90d9",
            active: true,
            created_by: "u1",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        ],
        error: null,
      }),
    };
    const coverageChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { boundary_id: "b1", coverage_level: "moderate" },
        ],
      }),
    };
    mockSupabase.from
      .mockReturnValueOnce(memberChain)   // user_org_roles
      .mockReturnValueOnce(boundaryChain) // geo_boundaries
      .mockReturnValueOnce(coverageChain); // mv_boundary_activity_coverage

    const res = await GET(
      createRequest(`http://localhost/api/map/boundaries?org_id=${VALID_UUID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toHaveLength(1);
    expect(body.features[0].properties.coverage_level).toBe("moderate");
  });
});
