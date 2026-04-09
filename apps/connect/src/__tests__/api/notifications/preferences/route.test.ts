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

describe("PATCH /api/notifications/preferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await PATCH(makeRequest({ notification_digest: "instant" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/notifications/preferences", {
      method: "PATCH",
      body: "bad json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await PATCH(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid digest value", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makeRequest({ notification_digest: "weekly" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid digest preference" });
  });

  it("returns 400 when notification_digest is missing", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 200 with 'instant' digest", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makeRequest({ notification_digest: "instant" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 200 with 'daily' digest", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makeRequest({ notification_digest: "daily" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 200 with 'off' digest", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makeRequest({ notification_digest: "off" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 500 on database error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: null, error: { message: "DB error" }, count: 0 };

    const response = await PATCH(makeRequest({ notification_digest: "instant" }));
    expect(response.status).toBe(500);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });
});
