import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/onboarding/route");

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const VALID_INTEREST_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/onboarding", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/onboarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await POST(makeRequest({ interest_ids: [] }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for malformed JSON body", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/onboarding", {
      method: "POST",
      body: "invalid json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
  });

  it("returns 400 when interest_ids is not an array", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ interest_ids: "not-array" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "interest_ids must be an array" });
  });

  it("returns 400 when interest_ids contains invalid UUID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(
      makeRequest({ interest_ids: [VALID_INTEREST_ID, "bad-id"] })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid interest ID" });
  });

  it("returns 400 for latitude out of range (> 90)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ home_latitude: 91 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid latitude" });
  });

  it("returns 400 for latitude out of range (< -90)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ home_latitude: -91 }));
    expect(response.status).toBe(400);
  });

  it("returns 400 for non-number latitude", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ home_latitude: "abc" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid latitude" });
  });

  it("returns 400 for longitude out of range (> 180)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ home_longitude: 181 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid longitude" });
  });

  it("returns 400 for longitude out of range (< -180)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ home_longitude: -181 }));
    expect(response.status).toBe(400);
  });

  it("returns 400 for radius below minimum (< 10)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ notification_radius_km: 5 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Radius must be between 10 and 200 km" });
  });

  it("returns 400 for radius above maximum (> 200)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ notification_radius_km: 201 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Radius must be between 10 and 200 km" });
  });

  it("returns 400 for invalid email format", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ notification_email: "not-an-email" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid email address" });
  });

  it("returns 500 when profile update fails", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // Override the chain to return an error from update().eq()
    mockClient._chain._result = { data: null, error: { message: "Profile update failed" }, count: 0 };

    const response = await POST(makeRequest({ interest_ids: [] }));
    expect(response.status).toBe(500);

    // Reset
    mockClient._chain._result = { data: null, error: null, count: 0 };
  });

  it("returns 200 on successful save with all fields", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(
      makeRequest({
        interest_ids: [VALID_INTEREST_ID],
        home_latitude: -25.7479,
        home_longitude: 28.2293,
        notification_radius_km: 50,
        notification_email: "test@example.com",
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 200 on successful save with only interests", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ interest_ids: [VALID_INTEREST_ID] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 200 on successful save with empty interest_ids", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ interest_ids: [] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("accepts null notification_email", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ notification_email: null }));
    expect(response.status).toBe(200);
  });

  it("accepts empty-string notification_email", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest({ notification_email: "" }));
    expect(response.status).toBe(200);
  });
});
