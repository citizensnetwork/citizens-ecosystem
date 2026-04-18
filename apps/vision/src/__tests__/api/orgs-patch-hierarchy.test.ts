import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetUser, mockUpdateSingle, mockMembershipSingle } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockUpdateSingle: vi.fn(),
    mockMembershipSingle: vi.fn(),
  }),
);

function makeSupabase() {
  // Two distinct chains — one for the user_org_roles membership read,
  // one for the organisations update. We pick which by the table arg.
  const membershipChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockMembershipSingle,
  };
  const orgChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: mockUpdateSingle,
  };
  return {
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) =>
      table === "user_org_roles" ? membershipChain : orgChain,
    ),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => makeSupabase()),
}));

const { PATCH } = await import("@/app/api/orgs/[orgId]/route");

const VALID_ORG = "11111111-1111-4111-8111-111111111111";
const NEW_PARENT = "22222222-2222-4222-8222-222222222222";

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/orgs/x", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/orgs/[orgId] — parent_org_id", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockUpdateSingle.mockReset();
    mockMembershipSingle.mockReset();
  });

  it("rejects a parent_org_id that is not a UUID", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await PATCH(patchReq({ parent_org_id: "not-a-uuid" }), {
      params: Promise.resolve({ orgId: VALID_ORG }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects setting parent_org_id to self", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await PATCH(patchReq({ parent_org_id: VALID_ORG }), {
      params: Promise.resolve({ orgId: VALID_ORG }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when caller is not org_admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockMembershipSingle.mockResolvedValueOnce({
      data: { role: "org_manager" },
      error: null,
    });
    const res = await PATCH(patchReq({ parent_org_id: NEW_PARENT }), {
      params: Promise.resolve({ orgId: VALID_ORG }),
    });
    expect(res.status).toBe(403);
  });

  it("updates parent_org_id when caller is org_admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockMembershipSingle.mockResolvedValueOnce({
      data: { role: "org_admin" },
      error: null,
    });
    mockUpdateSingle.mockResolvedValueOnce({
      data: { id: VALID_ORG, parent_org_id: NEW_PARENT },
      error: null,
    });
    const res = await PATCH(patchReq({ parent_org_id: NEW_PARENT }), {
      params: Promise.resolve({ orgId: VALID_ORG }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.parent_org_id).toBe(NEW_PARENT);
  });

  it("accepts parent_org_id = null to detach (org_admin)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockMembershipSingle.mockResolvedValueOnce({
      data: { role: "org_admin" },
      error: null,
    });
    mockUpdateSingle.mockResolvedValueOnce({
      data: { id: VALID_ORG, parent_org_id: null },
      error: null,
    });
    const res = await PATCH(patchReq({ parent_org_id: null }), {
      params: Promise.resolve({ orgId: VALID_ORG }),
    });
    expect(res.status).toBe(200);
  });
});
