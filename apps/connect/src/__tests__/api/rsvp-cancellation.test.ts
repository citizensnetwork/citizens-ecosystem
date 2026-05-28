import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { DELETE } = await import("@/app/api/rsvp/route");

const USER_ID = "22222222-2222-2222-2222-222222222222";
const EVENT_ID = "33333333-3333-3333-3333-333333333333";

function makeReq() {
  return new NextRequest("http://localhost/api/rsvp", {
    method: "DELETE",
    body: JSON.stringify({ event_id: EVENT_ID }),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });
});

afterEach(() => {
  mockClient._chain._result.data = null;
});

describe("DELETE /api/rsvp — cancellation logging (Stage H)", () => {
  it("logs a cancellation when an RSVP row was actually removed", async () => {
    // Simulate the delete().select("id") returning a removed row.
    mockClient._chain._result.data = [{ id: "rsvp-1" }];

    const res = await DELETE(makeReq());
    expect(res.status).toBe(200);

    const cancellationInsert = mockClient._chain.insert.mock.calls.find(
      (c) => (c[0] as { event_id?: string })?.event_id === EVENT_ID,
    );
    expect(cancellationInsert).toBeDefined();
    const row = cancellationInsert?.[0] as { event_id: string; user_id: string };
    expect(row.user_id).toBe(USER_ID);
    expect(mockClient.from).toHaveBeenCalledWith("rsvp_cancellations");
  });

  it("does NOT log a cancellation for a no-op delete (no RSVP existed)", async () => {
    mockClient._chain._result.data = [];

    const res = await DELETE(makeReq());
    expect(res.status).toBe(200);
    expect(mockClient._chain.insert).not.toHaveBeenCalled();
  });
});
