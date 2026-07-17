import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The members GET now reads through the SECURITY DEFINER vision.org_members(org)
// reader (migration 154), which joins public.profiles for display-safe member
// identity. These tests cover the route's auth / validation / 42501→403 mapping
// and the display-safe pass-through shape (the PII guard itself lives in the SQL).
const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const { GET } = await import("@/app/api/orgs/[orgId]/members/route");

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

function makeCtx(orgId: string) {
  return { params: Promise.resolve({ orgId }) };
}

function req() {
  return new NextRequest("http://localhost/api/orgs/" + VALID_ORG + "/members");
}

describe("GET /api/orgs/[orgId]/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req(), makeCtx(VALID_ORG));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the org id is not a valid UUID", async () => {
    const res = await GET(req(), makeCtx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("reads the roster via the org_members reader and returns display-safe rows", async () => {
    const row = {
      id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      user_id: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      full_name: "Grace Mokoena",
      avatar_url: "https://cdn.example/a.png",
      role: "org_admin",
      department_id: null,
      department_name: "Leadership",
      title: "Director",
      is_founder: true,
    };
    mockRpc.mockResolvedValue({ data: [row], error: null });
    const res = await GET(req(), makeCtx(VALID_ORG));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("org_members", { p_org_id: VALID_ORG });
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].full_name).toBe("Grace Mokoena");
    expect(body.data[0].role).toBe("org_admin");
    // display-safe: the reader never returns email/PII columns
    expect(body.data[0]).not.toHaveProperty("email");
  });

  it("returns 200 with an empty array when the reader yields no rows", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const res = await GET(req(), makeCtx(VALID_ORG));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("maps the reader's 42501 membership gate to 403", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "unauthorized" } });
    const res = await GET(req(), makeCtx(VALID_ORG));
    expect(res.status).toBe(403);
  });

  it("returns 500 on an unexpected reader error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const res = await GET(req(), makeCtx(VALID_ORG));
    expect(res.status).toBe(500);
  });
});
