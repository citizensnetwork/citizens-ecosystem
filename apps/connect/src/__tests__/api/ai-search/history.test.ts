import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET } = await import("@/app/api/ai-search/history/route");

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("GET /api/ai-search/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result.data = [];
    mockClient._chain._result.error = null;
  });

  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the history list scoped to the user", async () => {
    mockClient._chain._result.data = [
      {
        id: "row-1",
        query: "homecells",
        intent: { needs: ["community"] },
        result_ids: [],
        preferences_snapshot: { percentages: null, tags: null },
        created_at: "2026-04-19T00:00:00Z",
      },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history).toHaveLength(1);
    expect(body.history[0].query).toBe("homecells");
    // Verify the route eq-filtered by user_id (defence in depth alongside RLS).
    expect(mockClient._chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns 500 when the DB read fails", async () => {
    mockClient._chain._result.data = null;
    mockClient._chain._result.error = { message: "boom" };
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
