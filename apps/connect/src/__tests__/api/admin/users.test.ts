import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// The list selects + searches `email`, a private profiles column (mig 176):
// that one admin-gated read runs on the service-role client.
const adminClient = createMockSupabaseClient();
const createAdminClient = vi.fn(() => adminClient);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClient(),
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
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("GET lists users (incl. email) via the service-role client only after the admin gate", async () => {
    adminClient._chain._result.data = [{ id: OTHER_ID, email: "x@example.com" }];
    adminClient._chain._result.count = 1;
    const res = await GET(makeReq(null, "GET", "?q=example"));
    expect(res.status).toBe(200);
    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(adminClient.from).toHaveBeenCalledWith("profiles");
    const json = await res.json();
    expect(json.data).toEqual([{ id: OTHER_ID, email: "x@example.com" }]);
    expect(json.meta.total).toBe(1);
  });

  it("GET ?role=contributor lists only Contributors, with their hidden + claim state (Listings tab)", async () => {
    adminClient._chain._result.data = [];
    adminClient._chain._result.count = 0;
    const res = await GET(makeReq(null, "GET", "?role=contributor"));
    expect(res.status).toBe(200);
    expect(adminClient._chain.eq).toHaveBeenCalledWith("role", "contributor");
    const columns = String(adminClient._chain.select.mock.calls[0][0]);
    for (const col of ["contributor_slug", "contributor_hidden", "contributor_claim_email", "contributor_claimed_at"]) {
      expect(columns).toContain(col);
    }
  });

  it("GET ignores an unknown role filter instead of passing it to the query", async () => {
    adminClient._chain._result.data = [];
    const res = await GET(makeReq(null, "GET", "?role=king"));
    expect(res.status).toBe(200);
    expect(adminClient._chain.eq).not.toHaveBeenCalledWith("role", expect.anything());
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
