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

const { GET } = await import("@/app/api/timeline/route");

function createRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

describe("GET /api/timeline", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = createRequest(
      "http://localhost/api/timeline?org_id=550e8400-e29b-41d4-a716-446655440000"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createRequest("http://localhost/api/timeline");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createRequest(
      "http://localhost/api/timeline?org_id=not-a-uuid"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid department_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createRequest(
      "http://localhost/api/timeline?org_id=550e8400-e29b-41d4-a716-446655440000&department_id=bad"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid project_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createRequest(
      "http://localhost/api/timeline?org_id=550e8400-e29b-41d4-a716-446655440000&project_id=bad"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid goal_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = createRequest(
      "http://localhost/api/timeline?org_id=550e8400-e29b-41d4-a716-446655440000&goal_id=bad"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-member", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    };
    mockSupabase.from.mockReturnValue(memberChain);

    const req = createRequest(
      "http://localhost/api/timeline?org_id=550e8400-e29b-41d4-a716-446655440000"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns timeline data for authenticated member", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "user_org_roles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue({ data: { role: "org_member" } }),
        };
      }
      if (table === "activities") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                id: "act-1",
                title: "Community Meeting",
                type: "meeting",
                date: "2026-03-15",
                start_time: "10:00",
                end_time: "12:00",
                department_id: "dept-1",
                latitude: -25.75,
                longitude: 28.23,
                participant_count: 20,
                departments: { name: "Operations" },
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "project_activities") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [
              {
                activity_id: "act-1",
                project_id: "proj-1",
                projects: { name: "Main Project", department_id: "dept-1" },
              },
            ],
          }),
        };
      }
      if (table === "goal_activity_links") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [
              {
                activity_id: "act-1",
                goals: { title: "Growth Goal" },
              },
            ],
          }),
        };
      }
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ id: "proj-1" }] }),
        };
      }
      if (table === "milestones") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({
            data: [
              {
                id: "ms-1",
                project_id: "proj-1",
                title: "Phase 1 Complete",
                target_date: "2026-04-01",
                completed_at: null,
                projects: {
                  name: "Main Project",
                  department_id: "dept-1",
                  departments: { name: "Operations" },
                },
              },
            ],
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [] }),
      };
    });

    const req = createRequest(
      "http://localhost/api/timeline?org_id=550e8400-e29b-41d4-a716-446655440000&date_from=2026-01-01&date_to=2026-06-30"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe("Community Meeting");
    expect(body.items[0].aligned_goals).toEqual(["Growth Goal"]);
    expect(body.milestones).toHaveLength(1);
    expect(body.density).toHaveLength(1);
    expect(body.total_count).toBe(1);
    expect(body.truncated).toBe(false);
  });

  it("passes type filter to the activity query", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const eqCalls: [string, string][] = [];
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "user_org_roles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue({ data: { role: "org_member" } }),
        };
      }
      if (table === "activities") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((...args: [string, string]) => {
            eqCalls.push(args);
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn((...a2: [string, string]) => {
                eqCalls.push(a2);
                return {
                  order: vi.fn().mockReturnThis(),
                  gte: vi.fn().mockReturnThis(),
                  lte: vi.fn().mockReturnThis(),
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                };
              }),
              order: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }),
          order: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [] }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [] }),
      };
    });

    const req = createRequest(
      "http://localhost/api/timeline?org_id=550e8400-e29b-41d4-a716-446655440000&type=meeting"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(eqCalls.some(([col, val]) => col === "type" && val === "meeting")).toBe(true);
  });

  it("returns truncated true when limit is reached", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const manyActivities = Array.from({ length: 500 }, (_, i) => ({
      id: `act-${i}`,
      title: `Activity ${i}`,
      type: "meeting",
      date: "2026-03-15",
      start_time: null,
      end_time: null,
      department_id: null,
      latitude: null,
      longitude: null,
      participant_count: null,
      departments: null,
    }));

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "user_org_roles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue({ data: { role: "org_member" } }),
        };
      }
      if (table === "activities") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: manyActivities,
            error: null,
          }),
        };
      }
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [] }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [] }),
      };
    });

    const req = createRequest(
      "http://localhost/api/timeline?org_id=550e8400-e29b-41d4-a716-446655440000"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(body.total_count).toBe(500);
  });

  it("returns 500 on database error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "user_org_roles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue({ data: { role: "org_member" } }),
        };
      }
      if (table === "activities") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Database connection failed" },
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
    });

    const req = createRequest(
      "http://localhost/api/timeline?org_id=550e8400-e29b-41d4-a716-446655440000&date_from=2026-01-01&date_to=2026-06-30"
    );
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
