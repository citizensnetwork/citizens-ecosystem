import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  canAdministerListing,
  canEditListingContent,
  isDashboardViewer,
} from "@/lib/dashboard/permissions";

function chain(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const filters: Record<string, unknown> = {};
  const c: Record<string, ReturnType<typeof vi.fn> | unknown> = {
    select: vi.fn(),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return c;
    }),
    is: vi.fn(),
    gt: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(async () => {
      const row = result.data as { role?: string; status?: string } | null;
      if (row && typeof row.status === "string") {
        if (filters.status == null || filters.status === row.status) {
          return { data: { role: row.role }, error: result.error };
        }
        return { data: null, error: null };
      }
      return result;
    }),
  };
  for (const key of ["select", "is", "gt", "in"]) {
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
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const LISTING_ID = "44444444-4444-4444-8444-444444444444";

const openListing = {
  id: LISTING_ID,
  role: "contributor",
  contributor_status: "approved",
  contributor_hidden: false,
  deleted_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

function asUser(id: string) {
  mockClient.auth.getUser.mockResolvedValueOnce({
    data: { user: { id } },
    error: null,
  });
}

function tables(map: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
  for (const [name, rows] of Object.entries(map)) queues[name] = [...rows];
  mockClient.from.mockImplementation((table: string) => {
    const next = (queues[table] || []).shift() || { data: null, error: null };
    return chain(next);
  });
}

describe("checkDashboardAccess", () => {
  it("allows an approved admin contributor to access their own dashboard", async () => {
    asUser(ADMIN_ID);
    tables({
      profiles: [{ data: { id: ADMIN_ID, role: "admin", contributor_status: "approved" }, error: null }],
      team_memberships: [{ data: null, error: null }],
    });

    await expect(checkDashboardAccess("admin-org")).resolves.toEqual({
      hasAccess: true,
      isOwner: true,
      isAdminWithAccess: false,
      contributorId: ADMIN_ID,
      teamRole: "owner",
    });
  });

  it("treats an active owner membership as the owner", async () => {
    asUser(OWNER_ID);
    tables({
      profiles: [{ data: openListing, error: null }],
      team_memberships: [{ data: { role: "owner", status: "active" }, error: null }],
    });
    await expect(checkDashboardAccess("org")).resolves.toMatchObject({
      hasAccess: true,
      isOwner: true,
      teamRole: "owner",
      contributorId: LISTING_ID,
    });
  });

  it("lets an active editor open a live listing", async () => {
    asUser(MEMBER_ID);
    tables({
      profiles: [{ data: openListing, error: null }],
      team_memberships: [{ data: { role: "editor", status: "active" }, error: null }],
    });
    await expect(checkDashboardAccess("org")).resolves.toEqual({
      hasAccess: true,
      isOwner: false,
      isAdminWithAccess: false,
      contributorId: LISTING_ID,
      teamRole: "editor",
    });
  });

  it("lets an active viewer open a live listing without write power", async () => {
    asUser(MEMBER_ID);
    tables({
      profiles: [{ data: openListing, error: null }],
      team_memberships: [{ data: { role: "viewer", status: "active" }, error: null }],
    });
    const access = await checkDashboardAccess("org");
    expect(access).toEqual({
      hasAccess: true,
      isOwner: false,
      isAdminWithAccess: false,
      contributorId: LISTING_ID,
      teamRole: "viewer",
    });
    expect(canEditListingContent(access)).toBe(false);
    expect(canAdministerListing(access)).toBe(false);
    expect(isDashboardViewer(access)).toBe(true);
  });

  it.each(["pending", "declined", "removed"])(
    "gives a %s membership nothing",
    async (status) => {
      asUser(MEMBER_ID);
      tables({
        profiles: [
          { data: openListing, error: null },
          { data: { role: "citizen" }, error: null },
        ],
        team_memberships: [{ data: { role: "editor", status }, error: null }],
      });
      await expect(checkDashboardAccess("org")).resolves.toEqual({ hasAccess: false });
    },
  );

  it("denies a stranger", async () => {
    asUser(MEMBER_ID);
    tables({
      profiles: [
        { data: openListing, error: null },
        { data: { role: "citizen" }, error: null },
      ],
      team_memberships: [{ data: null, error: null }],
    });
    await expect(checkDashboardAccess("org")).resolves.toEqual({ hasAccess: false });
  });

  it("denies an editor of a hidden, deleted, or unapproved listing", async () => {
    for (const listing of [
      { ...openListing, contributor_hidden: true },
      { ...openListing, deleted_at: "2026-01-01T00:00:00Z" },
      { ...openListing, contributor_status: "pending" },
    ]) {
      asUser(MEMBER_ID);
      tables({
        profiles: [
          { data: listing, error: null },
          { data: { role: "citizen" }, error: null },
        ],
        team_memberships: [{ data: { role: "editor", status: "active" }, error: null }],
      });
      await expect(checkDashboardAccess("org")).resolves.toEqual({ hasAccess: false });
    }
  });

  it("still lets the owner into a hidden listing", async () => {
    asUser(LISTING_ID);
    tables({
      profiles: [{ data: { ...openListing, contributor_hidden: true }, error: null }],
      team_memberships: [{ data: null, error: null }],
    });
    await expect(checkDashboardAccess("org")).resolves.toMatchObject({
      hasAccess: true,
      isOwner: true,
      teamRole: "owner",
    });
  });

  it("lets an admin in only with an approved unrevoked grant", async () => {
    asUser(ADMIN_ID);
    tables({
      profiles: [
        { data: openListing, error: null },
        { data: { role: "admin" }, error: null },
      ],
      team_memberships: [{ data: null, error: null }],
      contributor_access_requests: [{ data: { id: "grant", expires_at: "2099-01-01", revoked_at: null }, error: null }],
    });
    await expect(checkDashboardAccess("org")).resolves.toEqual({
      hasAccess: true,
      isOwner: false,
      isAdminWithAccess: true,
      contributorId: LISTING_ID,
      teamRole: null,
    });
  });

  it("denies an admin with no grant", async () => {
    asUser(ADMIN_ID);
    tables({
      profiles: [
        { data: openListing, error: null },
        { data: { role: "admin" }, error: null },
      ],
      team_memberships: [{ data: null, error: null }],
      contributor_access_requests: [{ data: null, error: null }],
    });
    await expect(checkDashboardAccess("org")).resolves.toEqual({ hasAccess: false });
  });
});

describe("dashboard permissions", () => {
  const editor = {
    hasAccess: true as const,
    isOwner: false,
    isAdminWithAccess: false,
    contributorId: LISTING_ID,
    teamRole: "editor" as const,
  };
  const owner = { ...editor, isOwner: true, teamRole: "owner" as const };

  it("lets an editor change content and not administer the listing", () => {
    expect(canEditListingContent(editor)).toBe(true);
    expect(canAdministerListing(editor)).toBe(false);
    expect(isDashboardViewer(editor)).toBe(false);
  });

  it("keeps the owner able to administer and edit", () => {
    expect(canEditListingContent(owner)).toBe(true);
    expect(canAdministerListing(owner)).toBe(true);
  });
});
