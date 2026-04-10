import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET, POST } = await import("@/app/api/conversations/route");

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const RECIPIENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CONV_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/conversations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- GET ---
describe("GET /api/conversations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 200 with empty array when user has no conversations", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: [], error: null, count: 0 };

    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.conversations).toEqual([]);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });

  it("returns 500 on participant query error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: null, error: { message: "DB error" }, count: 0 };

    const response = await GET();
    expect(response.status).toBe(500);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });
});

// --- POST ---
describe("POST /api/conversations", () => {
  beforeEach(() => { vi.clearAllMocks(); resetRateLimitStore(); });

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/conversations", {
      method: "POST",
      body: "invalid json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid recipient_id", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makePostRequest({ recipient_id: "not-uuid" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid recipient ID" });
  });

  it("returns 400 when messaging yourself", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makePostRequest({ recipient_id: USER_ID }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Cannot message yourself" });
  });

  it("returns 404 when recipient not found", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.single.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Recipient not found" });
  });

  it("returns 500 on RPC error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: RECIPIENT_ID },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "RPC failed" },
    });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));
    expect(response.status).toBe(500);
  });

  it("returns 201 on successful conversation creation", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: RECIPIENT_ID },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: CONV_ID,
      error: null,
    });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.conversation_id).toBe(CONV_ID);
  });
});
