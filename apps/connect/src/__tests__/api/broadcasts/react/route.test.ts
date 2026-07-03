import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/broadcasts/[id]/react/route");

const USER_ID = "22222222-2222-2222-2222-222222222222";
const BROADCAST_ID = "33333333-3333-3333-3333-333333333333";

function makeReq(body: unknown) {
  return new NextRequest(`http://localhost/api/broadcasts/${BROADCAST_ID}/react`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const params = Promise.resolve({ id: BROADCAST_ID });

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });
  mockClient.rpc.mockResolvedValue({ data: 1, error: null });
});

describe("POST /api/broadcasts/[id]/react", () => {
  it("rejects unauthenticated callers", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(makeReq({ emoji: "🙏" }), { params });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid broadcast id", async () => {
    const badParams = Promise.resolve({ id: "not-a-uuid" });
    const res = await POST(makeReq({ emoji: "🙏" }), { params: badParams });
    expect(res.status).toBe(400);
  });

  it("rejects an emoji outside the fixed set", async () => {
    const res = await POST(makeReq({ emoji: "😈" }), { params });
    expect(res.status).toBe(400);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-string emoji", async () => {
    const res = await POST(makeReq({ emoji: 5 }), { params });
    expect(res.status).toBe(400);
  });

  it("calls the RPC and returns the new count on success", async () => {
    mockClient.rpc.mockResolvedValue({ data: 7, error: null });
    const res = await POST(makeReq({ emoji: "❤️" }), { params });
    expect(res.status).toBe(200);
    expect(mockClient.rpc).toHaveBeenCalledWith("increment_broadcast_reaction", {
      p_broadcast_id: BROADCAST_ID,
      p_emoji: "❤️",
    });
    const json = await res.json();
    expect(json).toMatchObject({ success: true, emoji: "❤️", count: 7 });
  });

  it("returns 404 when the broadcast is missing (RPC P0002)", async () => {
    mockClient.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "broadcast_not_found" },
    });
    const res = await POST(makeReq({ emoji: "🎉" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 500 when the RPC errors", async () => {
    mockClient.rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    });
    const res = await POST(makeReq({ emoji: "🔥" }), { params });
    expect(res.status).toBe(500);
  });
});
