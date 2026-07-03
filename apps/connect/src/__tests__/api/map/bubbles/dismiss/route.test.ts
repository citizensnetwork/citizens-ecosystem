import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/map/bubbles/[id]/dismiss/route");

const USER_ID = "22222222-2222-2222-2222-222222222222";
const BUBBLE_ID = "44444444-4444-4444-4444-444444444444";

function makeReq() {
  return new NextRequest(`http://localhost/api/map/bubbles/${BUBBLE_ID}/dismiss`, {
    method: "POST",
  });
}

const params = Promise.resolve({ id: BUBBLE_ID });

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });
  mockClient.rpc.mockResolvedValue({ data: true, error: null });
});

describe("POST /api/map/bubbles/[id]/dismiss", () => {
  it("rejects unauthenticated callers", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(401);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid bubble id", async () => {
    const badParams = Promise.resolve({ id: "not-a-uuid" });
    const res = await POST(makeReq(), { params: badParams });
    expect(res.status).toBe(400);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("calls the dismiss RPC and returns success", async () => {
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    expect(mockClient.rpc).toHaveBeenCalledWith("dismiss_map_bubble", {
      p_bubble_id: BUBBLE_ID,
    });
    const json = await res.json();
    expect(json).toMatchObject({ success: true });
  });

  it("returns 500 when the RPC errors", async () => {
    mockClient.rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(500);
  });
});
