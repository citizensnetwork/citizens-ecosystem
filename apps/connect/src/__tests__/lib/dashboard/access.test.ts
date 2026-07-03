import { describe, it, expect, vi, beforeEach } from "vitest";

function chain(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const c: Record<string, ReturnType<typeof vi.fn> | unknown> = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  for (const key of ["select", "eq", "is", "gt"]) {
    (c[key] as ReturnType<typeof vi.fn>).mockReturnValue(c);
  }
  return c;
}

const mockClient = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { checkDashboardAccess } = await import("@/lib/dashboard/access");

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkDashboardAccess", () => {
  it("allows an approved admin contributor to access their own dashboard", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    const contributorChain = chain({
      data: { id: ADMIN_ID, role: "admin", contributor_status: "approved" },
      error: null,
    });
    const ownerChain = chain({ data: null, error: null });
    mockClient.from.mockImplementation((table: string) => {
      if (table === "profiles") return contributorChain;
      if (table === "team_memberships") return ownerChain;
      return chain();
    });

    await expect(checkDashboardAccess("admin-org")).resolves.toEqual({
      hasAccess: true,
      isOwner: true,
      isAdminWithAccess: false,
      contributorId: ADMIN_ID,
    });
  });
});
