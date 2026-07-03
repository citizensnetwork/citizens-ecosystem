import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

vi.mock("@/lib/connect/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/connect/api")>();
  return {
    ...actual,
    connectApi: { ...actual.connectApi, getContributor: vi.fn() },
  };
});

const { connectApi, ConnectApiError } = await import("@/lib/connect/api");
const getContributor = connectApi.getContributor as ReturnType<typeof vi.fn>;
const { POST } = await import("@/app/api/connect/link/route");

const validOrg = "660e8400-e29b-41d4-a716-446655440000";

function makeReq(body: Record<string, unknown>) {
  return new NextRequest(new URL("/api/connect/link", "http://localhost"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chainFrom(impls: Array<Record<string, unknown>>) {
  let i = 0;
  mockSupabase.from.mockImplementation(() => impls[Math.min(i++, impls.length - 1)]);
}

const roleChain = (role: string) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { role } }),
});

describe("POST /api/connect/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(makeReq({ org_id: validOrg, slug: "x" }))).status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    expect((await POST(makeReq({ slug: "x" }))).status).toBe(400);
  });

  it("returns 400 for missing slug", async () => {
    expect((await POST(makeReq({ org_id: validOrg }))).status).toBe(400);
  });

  it("returns 403 for non-admins", async () => {
    chainFrom([roleChain("org_manager")]);
    expect(
      (await POST(makeReq({ org_id: validOrg, slug: "x" }))).status
    ).toBe(403);
  });

  it("returns 400 for a malformed slug", async () => {
    chainFrom([roleChain("org_admin")]);
    expect(
      (await POST(makeReq({ org_id: validOrg, slug: "Bad Slug!" }))).status
    ).toBe(400);
  });

  it("returns 404 when the contributor slug does not resolve", async () => {
    chainFrom([roleChain("org_admin")]);
    getContributor.mockRejectedValue(new ConnectApiError("nope", 404));
    expect(
      (await POST(makeReq({ org_id: validOrg, slug: "ghost" }))).status
    ).toBe(404);
  });

  it("returns 403 when linking a contributor the admin does not own", async () => {
    chainFrom([roleChain("org_admin")]);
    getContributor.mockResolvedValue({
      data: { profile: { id: "someone-else", full_name: "X" } },
    });
    expect(
      (await POST(makeReq({ org_id: validOrg, slug: "not-mine" }))).status
    ).toBe(403);
  });

  it("links the org to the admin's own resolved contributor", async () => {
    chainFrom([
      roleChain("org_admin"),
      { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) },
    ]);
    // The contributor profile id IS the caller's auth user id (shared auth.users).
    getContributor.mockResolvedValue({
      data: { profile: { id: "u1", full_name: "Rooted PTA" } },
    });
    const res = await POST(makeReq({ org_id: validOrg, slug: "rooted-pta" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connect_contributor_id).toBe("u1");
    expect(body.contributor.name).toBe("Rooted PTA");
  });
});
