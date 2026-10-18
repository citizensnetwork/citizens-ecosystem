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

    const response = await GET(new NextRequest("http://localhost:3000/api/conversations"));
    expect(response.status).toBe(401);
  });

  it("returns 200 with empty array when user has no conversations", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: [], error: null, count: 0 };

    const response = await GET(new NextRequest("http://localhost:3000/api/conversations"));
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

    const response = await GET(new NextRequest("http://localhost:3000/api/conversations"));
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
    mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Recipient not found" });
  });

  it("returns 500 on RPC error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // find_conversation → no existing conversation
    mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });
    // sender profile
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { id: USER_ID, role: "citizen" },
      error: null,
    });
    // recipient profile
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { id: RECIPIENT_ID, role: "citizen" },
      error: null,
    });
    // is_blocked → not blocked
    mockClient.rpc.mockResolvedValueOnce({ data: false, error: null });
    // find_or_create_conversation → RPC error
    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "RPC failed" },
    });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));
    expect(response.status).toBe(500);
  });

  it("returns 200 when conversation already exists", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // find_conversation → existing conversation found
    mockClient.rpc.mockResolvedValueOnce({ data: CONV_ID, error: null });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.conversation_id).toBe(CONV_ID);
  });

  it("returns 201 on successful conversation creation", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // find_conversation → no existing conversation
    mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });
    // sender profile
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { id: USER_ID, role: "citizen" },
      error: null,
    });
    // recipient profile
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { id: RECIPIENT_ID, role: "citizen" },
      error: null,
    });
    // is_blocked → not blocked
    mockClient.rpc.mockResolvedValueOnce({ data: false, error: null });
    // find_or_create_conversation → success
    mockClient.rpc.mockResolvedValueOnce({ data: CONV_ID, error: null });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.conversation_id).toBe(CONV_ID);
  });
});

// --- POST: a Contributor writing first to a citizen (S13) ---
// A Contributor may message a citizen who has interacted with them. The follow half of that rule is asked
// through the recipient_follows_me function; the follow tables are readable only by their owner.
describe("POST /api/conversations: Contributor to citizen", () => {
  beforeEach(() => vi.clearAllMocks());

  function arrange(followsMe: { data: unknown; error?: unknown }) {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    mockClient.rpc.mockResolvedValueOnce({ data: null, error: null }); // find_conversation
    mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: { id: USER_ID, role: "contributor" }, error: null });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: { id: RECIPIENT_ID, role: "citizen" }, error: null });
    mockClient.rpc.mockResolvedValueOnce({ data: false, error: null }); // is_blocked
    mockClient.rpc.mockResolvedValueOnce({ data: followsMe.data, error: followsMe.error ?? null }); // recipient_follows_me
  }

  it("starts a pending conversation with a citizen who follows them", async () => {
    arrange({ data: true });
    mockClient.rpc.mockResolvedValueOnce({ data: CONV_ID, error: null }); // find_or_create_conversation

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));

    expect(response.status).toBe(201);
    expect(mockClient.rpc).toHaveBeenCalledWith("recipient_follows_me", { p_recipient: RECIPIENT_ID });
    expect(mockClient.rpc).toHaveBeenCalledWith("find_or_create_conversation", {
      user_a: USER_ID,
      user_b: RECIPIENT_ID,
      p_status: "pending",
    });
  });

  it("does not read the follow tables itself", async () => {
    arrange({ data: true });
    mockClient.rpc.mockResolvedValueOnce({ data: CONV_ID, error: null });

    await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));

    // If either read comes back, the closed tables answer nothing and every Contributor message is refused.
    expect(mockClient.from).not.toHaveBeenCalledWith("follows");
    expect(mockClient.from).not.toHaveBeenCalledWith("place_follows");
  });

  it("refuses with 403 when the citizen has not interacted with them", async () => {
    arrange({ data: false });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));

    expect(response.status).toBe(403);
    expect(mockClient.rpc).not.toHaveBeenCalledWith("find_or_create_conversation", expect.anything());
  });

  it("refuses with 403 when the follow check itself errors", async () => {
    arrange({ data: null, error: { message: "boom" } });

    const response = await POST(makePostRequest({ recipient_id: RECIPIENT_ID }));

    expect(response.status).toBe(403);
    expect(mockClient.rpc).not.toHaveBeenCalledWith("find_or_create_conversation", expect.anything());
  });
});
