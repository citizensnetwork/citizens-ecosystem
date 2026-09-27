import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../helpers/supabase-mock";

// The team member search used to ILIKE `%email%` over every profile and
// return full addresses — an email-harvesting path for any contributor.
// Since mig 176 `email` is a private column: lookups are exact-match on the
// service-role client and results never carry an address.

const CONTRIBUTOR_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

const userClient = createMockSupabaseClient();
const adminClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/route", () => ({
  getRouteAuth: vi.fn(async () => ({ supabase: userClient, user: { id: USER_ID } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminClient),
}));
vi.mock("@/lib/dashboard/access", () => ({
  checkDashboardAccess: vi.fn(async () => ({
    hasAccess: true,
    isOwner: true,
    isAdminWithAccess: false,
    contributorId: CONTRIBUTOR_ID,
  })),
}));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ success: true, resetMs: 0 }) };
});

const { GET, POST } = await import("@/app/api/contributor/[handle]/team/route");

const params = { params: Promise.resolve({ handle: "grace-city" }) };

function search(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/contributor/grace-city/team", {
      method: "POST",
      body: JSON.stringify({ action: "search", ...body }),
      headers: { "Content-Type": "application/json" },
    }),
    params,
  );
}

describe("/api/contributor/[handle]/team — no email disclosure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userClient._chain._result.data = [];
    adminClient._chain._result.data = [];
  });

  it("GET lists members without their email addresses", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/contributor/grace-city/team"),
      params,
    );
    expect(res.status).toBe(200);
    const selects = userClient._chain.select.mock.calls.map((c) => String(c[0]));
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s).not.toMatch(/\bemail\b/);
  });

  it("rejects a partial email instead of wildcard-matching it", async () => {
    const res = await search({ email: "gmail" });
    expect(res.status).toBe(400);
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it("looks up a full email by exact match on the service-role client, returning no address", async () => {
    adminClient._chain._result.data = [{ id: USER_ID, full_name: "Thandi", avatar_url: null }];
    const res = await search({ email: "  Thandi_M@Example.org " });
    expect(res.status).toBe(200);
    expect(adminClient.from).toHaveBeenCalledWith("profiles");
    expect(adminClient._chain.select).toHaveBeenCalledWith("id, full_name, avatar_url");
    // Lower-cased, trimmed, and `_` preserved (sanitiseLike would strip it).
    expect(adminClient._chain.eq).toHaveBeenCalledWith("email", "thandi_m@example.org");
    expect(adminClient._chain.limit).toHaveBeenCalledWith(1);
    const json = await res.json();
    expect(json.results).toEqual([{ id: USER_ID, full_name: "Thandi", avatar_url: null }]);
    expect(JSON.stringify(json)).not.toMatch(/@/);
  });

  it("name search runs on the caller's client and never selects email", async () => {
    const res = await search({ name: "Thandi" });
    expect(res.status).toBe(200);
    expect(adminClient.from).not.toHaveBeenCalled();
    expect(userClient._chain.select).toHaveBeenCalledWith("id, full_name, avatar_url");
  });
});
