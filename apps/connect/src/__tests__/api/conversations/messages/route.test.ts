import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET, POST } = await import("@/app/api/conversations/[id]/messages/route");

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const CONV_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function makeGetRequest(convId: string, queryParams?: string) {
  const url = queryParams
    ? `http://localhost:3000/api/conversations/${convId}/messages?${queryParams}`
    : `http://localhost:3000/api/conversations/${convId}/messages`;
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(convId: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000/api/conversations/${convId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// --- GET ---
describe("GET /api/conversations/[id]/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await GET(makeGetRequest(CONV_ID), makeParams(CONV_ID));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid conversation ID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await GET(makeGetRequest("bad-id"), makeParams("bad-id"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid conversation ID" });
  });

  it("returns 403 when user is not a participant", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // participant query returns null
    mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await GET(makeGetRequest(CONV_ID), makeParams(CONV_ID));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Not a participant" });
  });

  it("returns 200 with messages array", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // participant check passes
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { conversation_id: CONV_ID },
      error: null,
    });
    // messages query — the chain resolves via then
    mockClient._chain._result = {
      data: [
        { id: "msg-1", conversation_id: CONV_ID, sender_id: USER_ID, body: "Hello", created_at: "2026-04-01T00:00:00Z" },
      ],
      error: null,
      count: 1,
    };
    // other_user query
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: {
        user_id: "other-user",
        profiles: { id: "other-user", full_name: "Other User", avatar_url: null },
      },
      error: null,
    });

    const response = await GET(makeGetRequest(CONV_ID), makeParams(CONV_ID));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.messages).toBeDefined();
    expect(json).toHaveProperty("has_more");

    // Reset
    mockClient._chain._result = { data: null, error: null, count: 0 };
  });

  it("returns 500 on database error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // participant check passes
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { conversation_id: CONV_ID },
      error: null,
    });
    // messages query errors
    mockClient._chain._result = { data: null, error: { message: "DB error" }, count: 0 };

    const response = await GET(makeGetRequest(CONV_ID), makeParams(CONV_ID));
    expect(response.status).toBe(500);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });
});

// --- POST ---
describe("POST /api/conversations/[id]/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await POST(makePostRequest(CONV_ID, { body: "Hi" }), makeParams(CONV_ID));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid conversation ID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makePostRequest("bad-id", { body: "Hi" }), makeParams("bad-id"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const req = new NextRequest(`http://localhost:3000/api/conversations/${CONV_ID}/messages`, {
      method: "POST",
      body: "invalid",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(req, makeParams(CONV_ID));
    expect(response.status).toBe(400);
  });

  it("returns 400 for empty message body", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await POST(makePostRequest(CONV_ID, { body: "" }), makeParams(CONV_ID));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Message must be 1-2000 characters" });
  });

  it("returns 400 for message body > 2000 characters", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const longBody = "x".repeat(2001);
    const response = await POST(makePostRequest(CONV_ID, { body: longBody }), makeParams(CONV_ID));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Message must be 1-2000 characters" });
  });

  it("returns 403 when user is not a participant", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // participant check fails
    mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(makePostRequest(CONV_ID, { body: "Hello" }), makeParams(CONV_ID));
    expect(response.status).toBe(403);
  });

  it("returns 201 on successful message send", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // participant check passes
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { conversation_id: CONV_ID },
      error: null,
    });
    // insert().select().single() resolves with the message
    mockClient._chain.single.mockResolvedValueOnce({
      data: {
        id: "msg-new",
        conversation_id: CONV_ID,
        sender_id: USER_ID,
        body: "Hello",
        created_at: "2026-04-01T00:00:00Z",
      },
      error: null,
    });

    const response = await POST(makePostRequest(CONV_ID, { body: "Hello" }), makeParams(CONV_ID));
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.message).toBeDefined();
    expect(json.message.body).toBe("Hello");
  });

  it("returns 500 on insert error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // participant check passes
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { conversation_id: CONV_ID },
      error: null,
    });
    // insert fails
    mockClient._chain.single.mockResolvedValueOnce({
      data: null,
      error: { message: "DB error" },
    });

    const response = await POST(makePostRequest(CONV_ID, { body: "Hello" }), makeParams(CONV_ID));
    expect(response.status).toBe(500);
  });
});
