import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET, PATCH, DELETE } = await import("@/app/api/notifications/route");

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const VALID_NOTIF_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function makePatchRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/notifications", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/notifications", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- GET ---
describe("GET /api/notifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await GET(new NextRequest("http://localhost:3000/api/notifications"));
    expect(response.status).toBe(401);
  });

  it("returns 200 with notifications array", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = {
      data: [{ id: VALID_NOTIF_ID, title: "Test", read: false }],
      error: null,
      count: 1,
    };

    const response = await GET(new NextRequest("http://localhost:3000/api/notifications"));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.notifications).toHaveLength(1);
    expect(json.notifications[0].id).toBe(VALID_NOTIF_ID);

    // Reset
    mockClient._chain._result = { data: null, error: null, count: 0 };
  });

  it("returns 200 with empty array when no notifications", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: [], error: null, count: 0 };

    const response = await GET(new NextRequest("http://localhost:3000/api/notifications"));
    expect(response.status).toBe(200);
    expect((await response.json()).notifications).toEqual([]);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });

  it("returns 500 on database error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: null, error: { message: "DB error" }, count: 0 };

    const response = await GET(new NextRequest("http://localhost:3000/api/notifications"));
    expect(response.status).toBe(500);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });
});

// --- PATCH ---
describe("PATCH /api/notifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await PATCH(makePatchRequest({ id: VALID_NOTIF_ID }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/notifications", {
      method: "PATCH",
      body: "broken json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await PATCH(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid notification ID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makePatchRequest({ id: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid notification ID" });
  });

  it("returns 200 when marking single notification read", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makePatchRequest({ id: VALID_NOTIF_ID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 200 when marking all as read", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makePatchRequest({ all: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 500 on database error for mark-all", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: null, error: { message: "DB error" }, count: 0 };

    const response = await PATCH(makePatchRequest({ all: true }));
    expect(response.status).toBe(500);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });

  it("returns 500 on database error for single mark-read", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: null, error: { message: "DB error" }, count: 0 };

    const response = await PATCH(makePatchRequest({ id: VALID_NOTIF_ID }));
    expect(response.status).toBe(500);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });
});

// --- DELETE ---
describe("DELETE /api/notifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await DELETE(makeDeleteRequest({ id: VALID_NOTIF_ID }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/notifications", {
      method: "DELETE",
      body: "broken",
      headers: { "Content-Type": "application/json" },
    });
    const response = await DELETE(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid notification ID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await DELETE(makeDeleteRequest({ id: "bad" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid notification ID" });
  });

  it("returns 200 on successful delete", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await DELETE(makeDeleteRequest({ id: VALID_NOTIF_ID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 500 on database error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: null, error: { message: "DB error" }, count: 0 };

    const response = await DELETE(makeDeleteRequest({ id: VALID_NOTIF_ID }));
    expect(response.status).toBe(500);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });
});
