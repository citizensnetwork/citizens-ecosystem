import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET, POST, PATCH, DELETE } = await import(
  "@/app/api/goals/[id]/alignment/route"
);

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

/** Creates a mock Supabase query builder that resolves to `value` when awaited */
function chainMock(value: unknown) {
  const m: Record<string, ReturnType<typeof vi.fn>> = {};
  m.select = vi.fn(() => m);
  m.eq = vi.fn(() => m);
  m.order = vi.fn(() => m);
  m.single = vi.fn(() => m);
  m.insert = vi.fn(() => m);
  m.update = vi.fn(() => m);
  m.delete = vi.fn(() => m);
  m.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(value).then(resolve)
  );
  return m;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const GOAL_ID = "660e8400-e29b-41d4-a716-446655440001";
const ACTIVITY_ID = "770e8400-e29b-41d4-a716-446655440002";

const routeParams = { params: Promise.resolve({ id: GOAL_ID }) };

describe("GET /api/goals/[id]/alignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      createRequest("GET", `http://localhost/api/goals/${GOAL_ID}/alignment`),
      routeParams
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid goal id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await GET(
      createRequest("GET", `http://localhost/api/goals/not-a-uuid/alignment`),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns alignment data for valid goal", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    mockSupabase.rpc.mockResolvedValue({
      data: { score: 75.5, linked_activities: 1, weighted_sum: 75.5 },
      error: null,
    });

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // goals table — .select().eq().single()
        return chainMock({
          data: {
            id: GOAL_ID,
            org_id: VALID_UUID,
            title: "Goal 1",
            priority_weight: 1.0,
            status: "active",
          },
          error: null,
        });
      }
      if (callCount === 2) {
        // goal_activity_links — .select().eq().order()
        return chainMock({
          data: [
            {
              id: "l1",
              activity_id: ACTIVITY_ID,
              link_type: "explicit",
              confidence: 1.0,
              approved: true,
              activities: {
                id: ACTIVITY_ID,
                title: "Workshop",
                type: "workshop",
                date: "2026-01-15",
                department_id: "d1",
                participant_count: 20,
              },
            },
          ],
          error: null,
        });
      }
      // 3rd call: dept breakdown
      return chainMock({ data: [], error: null });
    });

    const res = await GET(
      createRequest("GET", `http://localhost/api/goals/${GOAL_ID}/alignment`),
      routeParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.links).toHaveLength(1);
    expect(body.alignment).toBeDefined();
    expect(body.department_breakdown).toBeDefined();
  });
});

describe("POST /api/goals/[id]/alignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      createRequest("POST", `http://localhost/api/goals/${GOAL_ID}/alignment`, {
        activity_id: ACTIVITY_ID,
        link_type: "explicit",
      }),
      routeParams
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await POST(
      createRequest("POST", `http://localhost/api/goals/${GOAL_ID}/alignment`, {
        activity_id: "bad-uuid",
      }),
      routeParams
    );
    expect(res.status).toBe(400);
  });

  it("creates link successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    mockSupabase.from.mockReturnValue(
      chainMock({
        data: {
          id: "l1",
          goal_id: GOAL_ID,
          activity_id: ACTIVITY_ID,
          link_type: "explicit",
          confidence: 1.0,
        },
        error: null,
      })
    );

    const res = await POST(
      createRequest("POST", `http://localhost/api/goals/${GOAL_ID}/alignment`, {
        activity_id: ACTIVITY_ID,
        link_type: "explicit",
        confidence: 1.0,
      }),
      routeParams
    );
    expect(res.status).toBe(201);
  });

  it("handles duplicate link (23505)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    mockSupabase.from.mockReturnValue(
      chainMock({
        data: null,
        error: { code: "23505", message: "duplicate" },
      })
    );

    const res = await POST(
      createRequest("POST", `http://localhost/api/goals/${GOAL_ID}/alignment`, {
        activity_id: ACTIVITY_ID,
        link_type: "explicit",
        confidence: 1.0,
      }),
      routeParams
    );
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/goals/[id]/alignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("approves a link", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    mockSupabase.from.mockReturnValue(
      chainMock({
        data: { id: VALID_UUID, approved: true },
        error: null,
      })
    );

    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/goals/${GOAL_ID}/alignment`, {
        link_id: VALID_UUID,
        approved: true,
      }),
      routeParams
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/goals/[id]/alignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a link", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    mockSupabase.from.mockReturnValue(chainMock({ error: null }));

    const res = await DELETE(
      createRequest(
        "DELETE",
        `http://localhost/api/goals/${GOAL_ID}/alignment?link_id=${VALID_UUID}`
      ),
      routeParams
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for missing link_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await DELETE(
      createRequest(
        "DELETE",
        `http://localhost/api/goals/${GOAL_ID}/alignment`
      ),
      routeParams
    );
    expect(res.status).toBe(400);
  });
});
