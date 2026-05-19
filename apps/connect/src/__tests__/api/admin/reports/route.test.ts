import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// Disable real rate-limiter so the mutation bucket doesn't trip between
// tests sharing the same admin id.
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit",
  );
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ success: true, resetMs: 0 }),
  };
});

const { PATCH } = await import("@/app/api/admin/reports/[id]/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const REPORT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function makeReq(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/reports/${REPORT_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: REPORT_ID }) };
}

describe("PATCH /api/admin/reports/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result.data = { role: "admin" };
    mockClient._chain._result.error = null;
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: ADMIN_ID, email: "a@example.com" } },
      error: null,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await PATCH(makeReq({ status: "actioned" }), ctx());
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    mockClient._chain._result.data = { role: "citizen" };
    const res = await PATCH(makeReq({ status: "actioned" }), ctx());
    expect(res.status).toBe(403);
  });

  it("returns 400 when id is not a UUID", async () => {
    const req = new NextRequest("http://localhost/api/admin/reports/bad", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "actioned" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid status", async () => {
    const res = await PATCH(makeReq({ status: "nuke" }), ctx());
    expect(res.status).toBe(400);
  });

  it("returns 400 when resolution_notes exceeds 1000 chars", async () => {
    const res = await PATCH(
      makeReq({ status: "actioned", resolution_notes: "x".repeat(1001) }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited", async () => {
    const rl = await import("@/lib/rate-limit");
    (rl.checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      success: false,
      resetMs: 60_000,
    });
    const res = await PATCH(makeReq({ status: "actioned" }), ctx());
    expect(res.status).toBe(429);
  });

  it("returns 200 on successful resolution", async () => {
    // Both the admin role lookup and the report update share the same
    // mock result; the admin check fires first and the update returns next.
    // We set the "final" row here — the role check still sees role:"admin"
    // because the single() is serialized.
    mockClient._chain._result.data = {
      role: "admin",
      id: REPORT_ID,
      target_type: "event",
      target_id: "00000000-0000-0000-0000-000000000000",
      status: "actioned",
    };
    const res = await PATCH(
      makeReq({ status: "actioned", resolution_notes: "Removed content" }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report?.status).toBe("actioned");
  });
});
