import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST, DELETE } = await import("@/app/api/place-follow/route");

const VALID_PLACE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

function makeRequest(method: string, body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/place-follow", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/place-follow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await POST(makeRequest("POST", { place_id: VALID_PLACE_ID }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid place_id", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest("POST", { place_id: "not-a-uuid" }));
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid ID format");
  });

  it("returns 400 for missing body", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/place-follow", {
      method: "POST",
      body: "invalid json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 409 for duplicate follow", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.insert.mockReturnValueOnce({
      error: { code: "23505", message: "duplicate" },
    });

    const response = await POST(makeRequest("POST", { place_id: VALID_PLACE_ID }));
    expect(response.status).toBe(409);
  });

  it("returns 500 with generic message on DB error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.insert.mockReturnValueOnce({
      error: { code: "42P01", message: "relation does not exist" },
    });

    const response = await POST(makeRequest("POST", { place_id: VALID_PLACE_ID }));
    const json = await response.json();
    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to follow place");
    expect(json.error).not.toContain("relation");
  });
});

describe("DELETE /api/place-follow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await DELETE(makeRequest("DELETE", { place_id: VALID_PLACE_ID }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid place_id", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await DELETE(makeRequest("DELETE", { place_id: "bad" }));
    expect(response.status).toBe(400);
  });

  it("returns 500 with generic message on DB error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // DELETE chains .delete().eq().eq() — override the final eq to return error
    const errorResult = { error: { code: "42P01", message: "internal DB error detail" } };
    const innerChain = { eq: vi.fn().mockReturnValue(errorResult) };
    mockClient._chain.eq.mockReturnValueOnce(innerChain);

    const response = await DELETE(makeRequest("DELETE", { place_id: VALID_PLACE_ID }));
    const json = await response.json();
    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to unfollow place");
    expect(json.error).not.toContain("internal");
  });
});
