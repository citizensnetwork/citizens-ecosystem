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
const OTHER_ID = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44";

function makeRequest(method: "POST" | "DELETE", body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/convince", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeRawRequest(method: "POST" | "DELETE", raw: string) {
  return new NextRequest("http://localhost:3000/api/convince", {
    method,
    body: raw,
    headers: { "Content-Type": "application/json" },
  });
}

function signInAsSelf() {
  mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: SELF_ID } }, error: null });
}

function dbReturns(data: unknown, error: unknown) {
  mockClient._chain._result.data = data;
  mockClient._chain._result.error = error;
}

describe("POST /api/convince", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    dbReturns(null, null);
  });

  it("returns 401 when not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(401);
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("returns 400 when event_id is not a valid UUID", async () => {
    signInAsSelf();
    const res = await POST(makeRequest("POST", { event_id: "not-uuid", to_user_id: TARGET_ID }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when to_user_id is not a valid UUID", async () => {
    signInAsSelf();
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: "not-uuid" }));
    expect(res.status).toBe(400);
    expect(mockClient._chain.insert).not.toHaveBeenCalled();
  });

  it("returns 400 when the ids are missing or not strings", async () => {
    signInAsSelf();
    const missing = await POST(makeRequest("POST", {}));
    expect(missing.status).toBe(400);
    signInAsSelf();
    const numbers = await POST(makeRequest("POST", { event_id: 1, to_user_id: 2 }));
    expect(numbers.status).toBe(400);
    expect(mockClient._chain.insert).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not JSON", async () => {
    signInAsSelf();
    const res = await POST(makeRawRequest("POST", "{not json"));
    expect(res.status).toBe(400);
    expect(mockClient._chain.insert).not.toHaveBeenCalled();
  });

  it("returns 400 when convincing yourself, without touching the database", async () => {
    signInAsSelf();
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: SELF_ID }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/yourself/i);
    expect(mockClient._chain.insert).not.toHaveBeenCalled();
  });

  it("returns 409 on duplicate convince (23505)", async () => {
    signInAsSelf();
    dbReturns(null, { code: "23505", message: "duplicate key" });
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("already");
  });

  it("returns 403 when RLS forbids (error code 42501)", async () => {
    signInAsSelf();
    dbReturns(null, { code: "42501", message: "permission denied" });
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
  });

  it("returns 403 when only the message says row-level security (no error code)", async () => {
    signInAsSelf();
    dbReturns(null, {
      message: 'new row violates row-level security policy for table "convinces"',
    });
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(403);
  });

  it("gives the same neutral 403 whatever the reason, never naming a block or an RSVP", async () => {
    signInAsSelf();
    dbReturns(null, { code: "42501", message: "row-level security" });
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    const json = await res.json();
    expect(JSON.stringify(json)).not.toMatch(/block/i);
    expect(JSON.stringify(json)).not.toMatch(/\bnot (a )?(mutual|friend)/i);
    expect(Object.keys(json).sort()).toEqual(["code", "error"]);
  });

  it("returns 201 on success and says nothing but the new row's id and time", async () => {
    signInAsSelf();
    dbReturns({ id: "convince-1", created_at: "2026-10-18T08:00:00.000Z" }, null);
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.convince).toEqual({ id: "convince-1", created_at: "2026-10-18T08:00:00.000Z" });
  });

  it("inserts into convinces with the sender taken from the session, never from the body", async () => {
    signInAsSelf();
    dbReturns({ id: "convince-1", created_at: "now" }, null);
    await POST(
      makeRequest("POST", {
        event_id: EVENT_ID,
        to_user_id: TARGET_ID,
        from_user_id: OTHER_ID,
      }),
    );
    expect(mockClient.from).toHaveBeenCalledWith("convinces");
    expect(mockClient._chain.insert).toHaveBeenCalledTimes(1);
    expect(mockClient._chain.insert).toHaveBeenCalledWith({
      from_user_id: SELF_ID,
      to_user_id: TARGET_ID,
      event_id: EVENT_ID,
    });
  });

  it("returns 500 on an unexpected database error and does not leak its message", async () => {
    signInAsSelf();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    dbReturns(null, { code: "XX000", message: "secret internal detail" });
    const res = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret internal detail");
    consoleError.mockRestore();
  });

  it("rate-limits aggressive callers", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: SELF_ID } }, error: null });
    dbReturns({ id: "x", created_at: "now" }, null);
    let last = 0;
    for (let i = 0; i < 40; i++) {
      const r = await POST(makeRequest("POST", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
      last = r.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
    // restore the default so later tests start signed out
    mockClient.auth.getUser.mockReset();
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });
});

describe("DELETE /api/convince", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    dbReturns(null, null);
  });

  it("returns 401 when not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await DELETE(makeRequest("DELETE", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(401);
    expect(mockClient._chain.delete).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid ids and for a body that is not JSON", async () => {
    signInAsSelf();
    const badEvent = await DELETE(
      makeRequest("DELETE", { event_id: "nope", to_user_id: TARGET_ID }),
    );
    expect(badEvent.status).toBe(400);
    signInAsSelf();
    const badTarget = await DELETE(
      makeRequest("DELETE", { event_id: EVENT_ID, to_user_id: "nope" }),
    );
    expect(badTarget.status).toBe(400);
    signInAsSelf();
    const notJson = await DELETE(makeRawRequest("DELETE", "{not json"));
    expect(notJson.status).toBe(400);
    expect(mockClient._chain.delete).not.toHaveBeenCalled();
  });

  it("returns 200 on success", async () => {
    signInAsSelf();
    const res = await DELETE(makeRequest("DELETE", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(200);
  });

  it("only ever withdraws the signed-in person's own convince for that friend and event", async () => {
    signInAsSelf();
    await DELETE(
      makeRequest("DELETE", {
        event_id: EVENT_ID,
        to_user_id: TARGET_ID,
        from_user_id: OTHER_ID,
      }),
    );
    expect(mockClient.from).toHaveBeenCalledWith("convinces");
    expect(mockClient._chain.delete).toHaveBeenCalledTimes(1);
    const filters = mockClient._chain.eq.mock.calls.map((c) => `${c[0]}=${c[1]}`).sort();
    expect(filters).toEqual(
      [`event_id=${EVENT_ID}`, `from_user_id=${SELF_ID}`, `to_user_id=${TARGET_ID}`].sort(),
    );
  });

  it("returns 500 on a database error and does not leak its message", async () => {
    signInAsSelf();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    dbReturns(null, { code: "XX000", message: "secret internal detail" });
    const res = await DELETE(makeRequest("DELETE", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret internal detail");
    consoleError.mockRestore();
  });

  it("rate-limits aggressive callers", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: SELF_ID } }, error: null });
    let last = 0;
    for (let i = 0; i < 40; i++) {
      const r = await DELETE(makeRequest("DELETE", { event_id: EVENT_ID, to_user_id: TARGET_ID }));
      last = r.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
    mockClient.auth.getUser.mockReset();
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });
});
