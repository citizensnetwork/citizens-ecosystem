import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { PATCH } = await import("@/app/api/notifications/preferences/route");

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/notifications/preferences", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function authed() {
  mockClient.auth.getUser.mockResolvedValueOnce({
    data: { user: { id: USER_ID } },
    error: null,
  });
}

// Reset any row returned by maybeSingle() between tests so prefs-merge tests
// don't inherit state.
function resetChain() {
  mockClient._chain._result.data = null;
  mockClient._chain._result.error = null;
  mockClient._chain._result.count = 0;
}

describe("PATCH /api/notifications/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await PATCH(makeRequest({ notification_digest: "instant" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    authed();
    const req = new NextRequest("http://localhost:3000/api/notifications/preferences", {
      method: "PATCH",
      body: "bad json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await PATCH(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid digest value", async () => {
    authed();
    const response = await PATCH(makeRequest({ notification_digest: "weekly" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid digest preference" });
  });

  it("returns 400 when no preference fields are provided", async () => {
    authed();
    const response = await PATCH(makeRequest({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No preference fields provided" });
  });

  it("returns 200 with 'instant' digest", async () => {
    authed();
    const response = await PATCH(makeRequest({ notification_digest: "instant" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.updated).toEqual({ notification_digest: "instant" });
  });

  it("returns 200 with 'daily' digest", async () => {
    authed();
    const response = await PATCH(makeRequest({ notification_digest: "daily" }));
    expect(response.status).toBe(200);
  });

  it("returns 200 with 'off' digest", async () => {
    authed();
    const response = await PATCH(makeRequest({ notification_digest: "off" }));
    expect(response.status).toBe(200);
  });

  it("returns 500 on database error", async () => {
    authed();
    mockClient._chain._result.error = { message: "DB error" };

    const response = await PATCH(makeRequest({ notification_digest: "instant" }));
    expect(response.status).toBe(500);
  });

  // ---- notification_prefs ----

  it("returns 400 when notification_prefs is not an object", async () => {
    authed();
    const response = await PATCH(makeRequest({ notification_prefs: "nope" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/object/i);
  });

  it("returns 400 when notification_prefs has an unknown key", async () => {
    authed();
    const response = await PATCH(
      makeRequest({ notification_prefs: { bogus_key: true } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/bogus_key/);
  });

  it("returns 400 when notification_prefs value is not a boolean", async () => {
    authed();
    const response = await PATCH(
      makeRequest({ notification_prefs: { announcements: "yes" } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/boolean/);
  });

  it("merges a single pref toggle with existing prefs", async () => {
    authed();
    // RPC returns the merged jsonb from the DB.
    mockClient.rpc.mockResolvedValueOnce({
      data: {
        friends_activity: false,
        event_reminders: true,
        announcements: false,
      },
      error: null,
    });

    const response = await PATCH(
      makeRequest({ notification_prefs: { announcements: false } }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mockClient.rpc).toHaveBeenCalledWith("update_notification_prefs", {
      delta: { announcements: false },
    });
    expect(body.updated.notification_prefs).toEqual({
      friends_activity: false,
      event_reminders: true,
      announcements: false,
    });
  });

  it("accepts digest and prefs simultaneously", async () => {
    authed();
    mockClient.rpc.mockResolvedValueOnce({
      data: { weekly_digest: false },
      error: null,
    });

    const response = await PATCH(
      makeRequest({
        notification_digest: "daily",
        notification_prefs: { weekly_digest: false },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.updated.notification_digest).toBe("daily");
    expect(body.updated.notification_prefs).toEqual({ weekly_digest: false });
  });

  it("returns 500 when the RPC fails", async () => {
    authed();
    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "rpc failed" },
    });

    const response = await PATCH(
      makeRequest({ notification_prefs: { announcements: false } }),
    );
    expect(response.status).toBe(500);
  });
});
