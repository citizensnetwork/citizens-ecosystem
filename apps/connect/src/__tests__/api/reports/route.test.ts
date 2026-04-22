import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST, GET } = await import("@/app/api/reports/route");

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const OTHER_USER = "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const VALID_TARGET = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const NEW_REPORT_ID = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44";

function makeReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/reports", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    mockClient._chain._result.data = null;
    mockClient._chain._result.error = null;
    mockClient._chain._result.count = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeReq({ target_type: "event", target_id: VALID_TARGET, reason: "spam" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when JSON is invalid", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    const req = new NextRequest("http://localhost:3000/api/reports", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when target_type is invalid", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    const res = await POST(makeReq({ target_type: "banana", target_id: VALID_TARGET, reason: "spam" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when target_id is not a UUID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    const res = await POST(makeReq({ target_type: "event", target_id: "nope", reason: "spam" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when reason is invalid", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    const res = await POST(makeReq({ target_type: "event", target_id: VALID_TARGET, reason: "nuke" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body exceeds 1000 chars", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    const res = await POST(
      makeReq({
        target_type: "event",
        target_id: VALID_TARGET,
        reason: "spam",
        body: "x".repeat(1001),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("blocks self-reports on target_type=user", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    const res = await POST(makeReq({ target_type: "user", target_id: USER_ID, reason: "spam" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/yourself/i);
  });

  it("returns 201 on successful insert", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    mockClient._chain._result.data = { id: NEW_REPORT_ID };
    mockClient._chain._result.error = null;
    const res = await POST(
      makeReq({ target_type: "user", target_id: OTHER_USER, reason: "harassment", body: "Sent me a rude DM" }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe(NEW_REPORT_ID);
  });

  it("returns 409 on duplicate open report", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    mockClient._chain._result.data = null;
    mockClient._chain._result.error = { code: "23505", message: "duplicate" };
    const res = await POST(
      makeReq({ target_type: "event", target_id: VALID_TARGET, reason: "spam" }),
    );
    expect(res.status).toBe(409);
  });

  it("enforces rate limit: 6th report within window returns 429", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mockClient._chain._result.data = { id: NEW_REPORT_ID };
    mockClient._chain._result.error = null;

    for (let i = 0; i < 5; i++) {
      const ok = await POST(
        makeReq({ target_type: "event", target_id: VALID_TARGET, reason: "spam" }),
      );
      expect(ok.status).toBe(201);
    }
    const blocked = await POST(
      makeReq({ target_type: "event", target_id: VALID_TARGET, reason: "spam" }),
    );
    expect(blocked.status).toBe(429);
  });
});

describe("GET /api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    mockClient._chain._result.data = null;
    mockClient._chain._result.error = null;
    mockClient._chain._result.count = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns list of reports for the caller", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    mockClient._chain._result.data = [{ id: NEW_REPORT_ID, target_type: "event", target_id: VALID_TARGET, reason: "spam", status: "open", created_at: "2026-01-01T00:00:00Z", resolved_at: null }];
    mockClient._chain._result.error = null;
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reports).toHaveLength(1);
  });
});
