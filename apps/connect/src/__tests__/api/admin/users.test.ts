import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit",
  );
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ success: true, resetMs: 0 }),
  };
});

const { PATCH, GET } = await import("@/app/api/admin/users/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

function makeReq(body: unknown, method: "PATCH" | "GET" = "PATCH", qs = "") {
  return new NextRequest(`http://localhost/api/admin/users${qs}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "PATCH" ? JSON.stringify(body) : undefined,
  });
}

describe("/api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result.data = { role: "admin" };
    mockClient._chain._result.error = null;
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: ADMIN_ID, email: "a@example.com" } },
      error: null,
    });
  });

  it("GET rejects non-admin", async () => {
    mockClient._chain._result.data = { role: "citizen" };
    const res = await GET(makeReq(null, "GET"));
    expect(res.status).toBe(403);
  });

  it("PATCH rejects when admin tries to demote self", async () => {
    const res = await PATCH(makeReq({ user_id: ADMIN_ID, role: "citizen" }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/demote/i);
  });

  it("PATCH rejects invalid role", async () => {
    const res = await PATCH(makeReq({ user_id: OTHER_ID, role: "king" }));
    expect(res.status).toBe(400);
  });

  it("PATCH rejects invalid user_id", async () => {
    const res = await PATCH(makeReq({ user_id: "not-a-uuid", role: "citizen" }));
    expect(res.status).toBe(400);
  });

  it("PATCH rejects invalid contributor_status", async () => {
    const res = await PATCH(
      makeReq({ user_id: OTHER_ID, contributor_status: "banished" }),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH rejects empty patch", async () => {
    const res = await PATCH(makeReq({ user_id: OTHER_ID }));
    expect(res.status).toBe(400);
  });
});
