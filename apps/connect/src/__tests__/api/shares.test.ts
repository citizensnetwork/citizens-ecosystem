import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/shares/route");

const USER_ID = "22222222-2222-2222-2222-222222222222";
const EVENT_ID = "33333333-3333-3333-3333-333333333333";

function makeReq(body?: Record<string, unknown>, ip = "1.2.3.4") {
  return new NextRequest("http://localhost/api/shares", {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("POST /api/shares", () => {
  it("rejects an invalid entity_type", async () => {
    const res = await POST(makeReq({ entity_type: "user", entity_id: EVENT_ID }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-UUID entity_id", async () => {
    const res = await POST(makeReq({ entity_type: "event", entity_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("logs an authenticated share with the user id", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(makeReq({ entity_type: "event", entity_id: EVENT_ID }));
    expect(res.status).toBe(201);
    const insertArgs = mockClient._chain.insert.mock.calls[0]?.[0] as {
      entity_type: string;
      entity_id: string;
      user_id: string | null;
    };
    expect(insertArgs.entity_type).toBe("event");
    expect(insertArgs.entity_id).toBe(EVENT_ID);
    expect(insertArgs.user_id).toBe(USER_ID);
  });

  it("allows an anonymous share (user_id = null)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await POST(makeReq({ entity_type: "place", entity_id: EVENT_ID }));
    expect(res.status).toBe(201);
    const insertArgs = mockClient._chain.insert.mock.calls[0]?.[0] as {
      user_id: string | null;
    };
    expect(insertArgs.user_id).toBeNull();
  });

  it("rate-limits a flood of anonymous shares from one IP", async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    // RATE_LIMITS.mutation = 30/min. The 31st must 429.
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const res = await POST(
        makeReq({ entity_type: "event", entity_id: EVENT_ID }, "9.9.9.9"),
      );
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
