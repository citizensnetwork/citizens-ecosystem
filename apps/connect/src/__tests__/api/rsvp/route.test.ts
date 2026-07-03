import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/rsvp/route");

const VALID_EVENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/rsvp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/rsvp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await POST(makeRequest({ event_id: VALID_EVENT_ID }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when event_id is missing", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await POST(makeRequest({}));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid ID format");
  });

  it("returns 400 when event_id is not a valid UUID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await POST(makeRequest({ event_id: "not-a-uuid" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid ID format");
  });

  it("returns 201 on successful RSVP via safe_rsvp RPC", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, remaining: null, status: 201 },
      error: null,
    });

    const response = await POST(makeRequest({ event_id: VALID_EVENT_ID }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(mockClient.rpc).toHaveBeenCalledWith("safe_rsvp", {
      p_user_id: "user-1",
      p_event_id: VALID_EVENT_ID,
    });
  });

  it("returns 409 on duplicate RSVP via RPC", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    mockClient.rpc.mockResolvedValueOnce({
      data: { success: false, error: "Already RSVPed to this event", status: 409 },
      error: null,
    });

    const response = await POST(makeRequest({ event_id: VALID_EVENT_ID }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe("Already RSVPed to this event");
  });

  it("returns 500 on RPC error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42000", message: "Something broke" },
    });

    const response = await POST(makeRequest({ event_id: VALID_EVENT_ID }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to RSVP");
  });

  it("returns 404 when event does not exist via RPC", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    mockClient.rpc.mockResolvedValueOnce({
      data: { success: false, error: "Event not found", status: 404 },
      error: null,
    });

    const response = await POST(makeRequest({ event_id: VALID_EVENT_ID }));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("Event not found");
  });
});
