import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST, DELETE } = await import("@/app/api/convince/route");

const EVENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TARGET_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const SELF_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

function makeRequest(method: "POST" | "DELETE", body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/convince", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/convince", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
  });

  it("returns 401 when not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when event_id is not a valid UUID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: SELF_ID } }, error: null });
    const res = await POST(makeRequest("POST", { event_id: "not-uuid", to_user_id: TARGET_ID }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when convincing yourself", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: SELF_ID } }, error: null });
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: SELF_ID }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/yourself/i);
  });

  it("returns 409 on duplicate convince (23505)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: SELF_ID } }, error: null });
    mockClient._chain._result.data = null;
    mockClient._chain._result.error = { code: "23505", message: "duplicate key" };
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(409);
  });

  it("returns 403 when RLS forbids (not mutual / not considering)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: SELF_ID } }, error: null });
    mockClient._chain._result.data = null;
    mockClient._chain._result.error = { code: "42501", message: "row-level security policy" };
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(403);
  });

  it("returns 201 on success", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: SELF_ID } }, error: null });
    mockClient._chain._result.data = { id: "convince-1", created_at: new Date().toISOString() };
    mockClient._chain._result.error = null;
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("rate-limits aggressive callers", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: SELF_ID } }, error: null });
    mockClient._chain._result.data = { id: "x", created_at: "now" };
    mockClient._chain._result.error = null;
    let last = 0;
    for (let i = 0; i < 40; i++) {
      const r = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
      last = r.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});

describe("DELETE /api/convince", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
  });

  it("returns 401 when not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await DELETE(makeRequest("DELETE", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 200 on success", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: SELF_ID } }, error: null });
    mockClient._chain._result.data = null;
    mockClient._chain._result.error = null;
    const res = await DELETE(makeRequest("DELETE", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(200);
  });
});
