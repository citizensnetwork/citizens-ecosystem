import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { PATCH } = await import("@/app/api/connect/places/[id]/route");

const validId = "00000000-0000-4000-a000-000000000002";
const validOrg = "00000000-0000-4000-a000-000000000001";

function makeReq(body: Record<string, unknown>) {
  return new NextRequest(new URL(`/api/connect/places/${validId}`, "http://localhost"), {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
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

describe("PATCH /api/connect/places/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeReq({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid place ID", async () => {
    const res = await PATCH(makeReq({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing org_id", async () => {
    const res = await PATCH(makeReq({ action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin users", async () => {
    chainFrom([roleChain("org_member")]);
    const res = await PATCH(makeReq({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid action", async () => {
    chainFrom([roleChain("org_admin")]);
    const res = await PATCH(makeReq({ org_id: validOrg, action: "nope" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(400);
  });

  it("claims a place by inserting a claim row", async () => {
    chainFrom([
      roleChain("org_admin"),
      { insert: vi.fn().mockResolvedValue({ error: null }) },
      {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: { cc_place_id: validId, cv_org_id: validOrg } }),
      },
    ]);
    const res = await PATCH(makeReq({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).cv_org_id).toBe(validOrg);
  });

  it("returns 409 when the place is already claimed by another org", async () => {
    chainFrom([
      roleChain("org_admin"),
      { insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }) },
      {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { cv_org_id: "other-org" } }),
      },
    ]);
    const res = await PATCH(makeReq({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(409);
  });

  it("unclaims a place", async () => {
    chainFrom([
      roleChain("org_admin"),
      { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() },
    ]);
    const res = await PATCH(makeReq({ org_id: validOrg, action: "unclaim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).cv_org_id).toBeNull();
  });
});
