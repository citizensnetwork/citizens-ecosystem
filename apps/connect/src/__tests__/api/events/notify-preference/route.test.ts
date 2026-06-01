import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { PATCH } = await import("@/app/api/events/[id]/notify-preference/route");

const USER_ID = "22222222-2222-2222-2222-222222222222";
const EVENT_ID = "33333333-3333-3333-3333-333333333333";

function makeReq(body: unknown) {
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}/notify-preference`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const params = Promise.resolve({ id: EVENT_ID });

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });
  mockClient.rpc.mockResolvedValue({ data: true, error: null });
});

describe("PATCH /api/events/[id]/notify-preference", () => {
  it("rejects unauthenticated callers", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await PATCH(makeReq({ notify_updates: false }), { params });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid event id", async () => {
    const badParams = Promise.resolve({ id: "not-a-uuid" });
    const res = await PATCH(makeReq({ notify_updates: false }), { params: badParams });
    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean notify_updates", async () => {
    const res = await PATCH(makeReq({ notify_updates: "no" }), { params });
    expect(res.status).toBe(400);
  });

  it("calls the RPC and returns success on a valid mute", async () => {
    const res = await PATCH(makeReq({ notify_updates: false }), { params });
    expect(res.status).toBe(200);
    expect(mockClient.rpc).toHaveBeenCalledWith("set_rsvp_notify_updates", {
      p_event_id: EVENT_ID,
      p_notify: false,
    });
    const json = await res.json();
    expect(json).toMatchObject({ success: true, notify_updates: false });
  });

  it("returns 409 when the caller has no RSVP row (RPC returns false)", async () => {
    mockClient.rpc.mockResolvedValue({ data: false, error: null });
    const res = await PATCH(makeReq({ notify_updates: true }), { params });
    expect(res.status).toBe(409);
  });

  it("returns 500 when the RPC errors", async () => {
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await PATCH(makeReq({ notify_updates: false }), { params });
    expect(res.status).toBe(500);
  });
});
