import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST, DELETE } = await import("@/app/api/push-token/route");

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/push-token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/push-token", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- POST ---
describe("POST /api/push-token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await POST(makePostRequest({ token: "abc", platform: "web" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/push-token", {
      method: "POST",
      body: "invalid",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 when token is missing", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makePostRequest({ platform: "web" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Token is required" });
  });

  it("returns 400 when token is not a string", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makePostRequest({ token: 12345, platform: "web" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Token is required" });
  });

  it("returns 400 when token is too long (> 500 chars)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const longToken = "x".repeat(501);
    const response = await POST(makePostRequest({ token: longToken, platform: "web" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Token too long" });
  });

  it("returns 400 for invalid platform", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makePostRequest({ token: "abc123", platform: "windows" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Platform must be ios, android, or web" });
  });

  it("returns 200 on successful registration (ios)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    // Mock upsert — the chain's method needs to resolve
    const upsertMock = vi.fn().mockReturnValue({ error: null });
    mockClient.from.mockReturnValueOnce({ upsert: upsertMock });

    const response = await POST(makePostRequest({ token: "apns-token", platform: "ios" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 200 on successful registration (android)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const upsertMock = vi.fn().mockReturnValue({ error: null });
    mockClient.from.mockReturnValueOnce({ upsert: upsertMock });

    const response = await POST(makePostRequest({ token: "fcm-token", platform: "android" }));
    expect(response.status).toBe(200);
  });

  it("returns 200 on successful registration (web)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const upsertMock = vi.fn().mockReturnValue({ error: null });
    mockClient.from.mockReturnValueOnce({ upsert: upsertMock });

    const response = await POST(makePostRequest({ token: "web-token", platform: "web" }));
    expect(response.status).toBe(200);
  });

  it("returns 500 on upsert error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const upsertMock = vi.fn().mockReturnValue({ error: { message: "DB error" } });
    mockClient.from.mockReturnValueOnce({ upsert: upsertMock });

    const response = await POST(makePostRequest({ token: "abc", platform: "web" }));
    expect(response.status).toBe(500);
  });
});

// --- DELETE ---
describe("DELETE /api/push-token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await DELETE(makeDeleteRequest({ token: "abc" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/push-token", {
      method: "DELETE",
      body: "broken",
      headers: { "Content-Type": "application/json" },
    });
    const response = await DELETE(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 when token is missing", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await DELETE(makeDeleteRequest({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Token is required" });
  });

  it("returns 200 on successful removal", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await DELETE(makeDeleteRequest({ token: "abc" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 500 on database error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const errorResult = { error: { message: "DB error" } };
    const innerChain = { eq: vi.fn().mockReturnValue(errorResult) };
    mockClient._chain.eq.mockReturnValueOnce(innerChain);

    const response = await DELETE(makeDeleteRequest({ token: "abc" }));
    expect(response.status).toBe(500);
  });
});
