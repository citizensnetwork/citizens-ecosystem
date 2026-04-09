import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST, DELETE } = await import("@/app/api/follow/route");

const VALID_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

function makeRequest(method: string, body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/follow", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/follow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await POST(makeRequest("POST", { followee_id: VALID_UUID }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for missing followee_id", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest("POST", {}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid ID format" });
  });

  it("returns 400 for invalid UUID followee_id", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest("POST", { followee_id: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid ID format" });
  });

  it("returns 400 when following yourself", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makeRequest("POST", { followee_id: USER_ID }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Cannot follow yourself" });
  });

  it("returns 400 for malformed JSON body", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/follow", {
      method: "POST",
      body: "invalid json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
  });

  it("returns 409 for duplicate follow", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.insert.mockReturnValueOnce({
      error: { code: "23505", message: "duplicate key" },
    });

    const response = await POST(makeRequest("POST", { followee_id: VALID_UUID }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Already following" });
  });

  it("returns 500 on database error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.insert.mockReturnValueOnce({
      error: { code: "42P01", message: "relation error" },
    });

    const response = await POST(makeRequest("POST", { followee_id: VALID_UUID }));
    expect(response.status).toBe(500);
  });

  it("returns 200 on successful follow", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // Default chain resolves with no error
    const response = await POST(makeRequest("POST", { followee_id: VALID_UUID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockClient.from).toHaveBeenCalledWith("follows");
  });
});

describe("DELETE /api/follow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await DELETE(makeRequest("DELETE", { followee_id: VALID_UUID }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for missing followee_id", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await DELETE(makeRequest("DELETE", {}));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid UUID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await DELETE(makeRequest("DELETE", { followee_id: "bad" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/follow", {
      method: "DELETE",
      body: "invalid json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await DELETE(req);
    expect(response.status).toBe(400);
  });

  it("returns 500 on database error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const errorResult = { error: { code: "42P01", message: "DB error" } };
    const innerChain = { eq: vi.fn().mockReturnValue(errorResult) };
    mockClient._chain.eq.mockReturnValueOnce(innerChain);

    const response = await DELETE(makeRequest("DELETE", { followee_id: VALID_UUID }));
    expect(response.status).toBe(500);
  });

  it("returns 200 on successful unfollow", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await DELETE(makeRequest("DELETE", { followee_id: VALID_UUID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});
