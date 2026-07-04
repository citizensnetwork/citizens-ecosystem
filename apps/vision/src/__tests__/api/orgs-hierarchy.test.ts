import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET } = await import("@/app/api/orgs/[orgId]/hierarchy/route");

const VALID_ORG = "00000000-0000-4000-8000-000000000001";

function req() {
  return new NextRequest("http://localhost/api/orgs/x/hierarchy");
}

describe("GET /api/orgs/[orgId]/hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for an invalid UUID", async () => {
    const res = await GET(req(), { params: Promise.resolve({ orgId: "nope" }) });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req(), { params: Promise.resolve({ orgId: VALID_ORG }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the target org is not readable", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const selfChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockSupabase.from.mockReturnValueOnce(selfChain);

    const res = await GET(req(), { params: Promise.resolve({ orgId: VALID_ORG }) });
    expect(res.status).toBe(404);
  });

  it("returns ancestors, siblings, and children for the target org", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const self = {
      id: VALID_ORG,
      name: "Middle",
      slug: "middle",
      parent_org_id: "root-id",
    };
    const selfChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: self, error: null }),
    };
    const visibleChain = {
      select: vi.fn().mockResolvedValue({
        data: [
          self,
          { id: "root-id", name: "Root", slug: "root", parent_org_id: null },
          { id: "sibling-id", name: "Sibling", slug: "sibling", parent_org_id: "root-id" },
          { id: "child-id", name: "Child", slug: "child", parent_org_id: VALID_ORG },
          { id: "grand-id", name: "Grand", slug: "grand", parent_org_id: "child-id" },
        ],
        error: null,
      }),
    };
    mockSupabase.from
      .mockReturnValueOnce(selfChain)
      .mockReturnValueOnce(visibleChain);

    const res = await GET(req(), { params: Promise.resolve({ orgId: VALID_ORG }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.self.id).toBe(VALID_ORG);
    expect(body.ancestors.map((a: { id: string }) => a.id)).toEqual(["root-id"]);
    expect(body.siblings.map((s: { id: string }) => s.id)).toEqual(["sibling-id"]);
    expect(body.children.map((c: { id: string }) => c.id)).toEqual(["child-id"]);
    expect(body.descendants.map((d: { id: string }) => d.id).sort()).toEqual([
      "child-id",
      "grand-id",
    ]);
  });

  it("returns 500 if the visibility query errors out", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const self = {
      id: VALID_ORG,
      name: "Middle",
      slug: "middle",
      parent_org_id: null,
    };
    const selfChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: self, error: null }),
    };
    const visibleChain = {
      select: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    };
    mockSupabase.from
      .mockReturnValueOnce(selfChain)
      .mockReturnValueOnce(visibleChain);

    const res = await GET(req(), { params: Promise.resolve({ orgId: VALID_ORG }) });
    expect(res.status).toBe(500);
  });
});
