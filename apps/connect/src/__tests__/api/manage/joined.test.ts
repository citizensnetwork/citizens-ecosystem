import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET } = await import("@/app/api/manage/joined/route");

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/manage/joined", () => {
  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("flattens rsvp rows into joined events and drops null events", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result.data = [
      {
        status: "attending",
        created_at: "2026-01-01T00:00:00Z",
        event: {
          id: "e1",
          title: "Prayer Breakfast",
          date: "2026-03-01T08:00:00Z",
          end_time: null,
          status: "published",
          visibility: "public",
          category: "prayer",
          location: null,
          image_url: null,
          created_by: "host-1",
          max_attendees: null,
        },
      },
      {
        status: "considering",
        created_at: "2026-01-02T00:00:00Z",
        // Null event (deleted since RSVP) — must be filtered out, not crash
        event: null,
      },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toHaveLength(1);
    expect(json.events[0].id).toBe("e1");
    expect(json.events[0].rsvp_status).toBe("attending");
    expect(json.events[0].rsvped_at).toBe("2026-01-01T00:00:00Z");
  });

  it("returns 500 on query error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result.data = null;
    mockClient._chain._result.error = { message: "boom" };
    const res = await GET();
    expect(res.status).toBe(500);
    // reset to avoid leaking between tests
    mockClient._chain._result.error = null;
  });
});
