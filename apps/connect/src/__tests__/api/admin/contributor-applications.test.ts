import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

// The admin's own session — requireAdmin reads the role from it.
const mockClient = createMockSupabaseClient();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// service_role does the read (the applicant embed carries the private email), one chain per table.
const chains = {
  contributor_applications: createMockSupabaseClient()._chain,
  admin_actions: createMockSupabaseClient()._chain,
};
const adminClient = { from: vi.fn((table: keyof typeof chains) => chains[table]) };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClient,
}));

const { GET } = await import("@/app/api/admin/contributor-applications/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";

const get = () => new NextRequest("http://localhost/api/admin/contributor-applications");

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    user_id: USER_A,
    display_name: "Grace Hub",
    contributor_kind: "ministry",
    contributor_category: "retreat-healing",
    bio: "We serve the city.",
    website_url: "https://grace.example/",
    instagram_handle: "@gracehub",
    facebook_url: null,
    tiktok_handle: null,
    youtube_url: null,
    x_handle: "@gracehubx",
    linkedin_url: null,
    whatsapp_number: "27712345678",
    contributor_contact_email: "hello@grace.example",
    no_fixed_location: false,
    physical_address: "1 Example Road, Pretoria",
    physical_latitude: -25.7,
    physical_longitude: 28.2,
    logo_url: "https://cdn.grace.example/logo.png",
    cover_photo_urls: [{ url: "https://cdn.grace.example/c1.jpg", caption: null }],
    motivation_text: "To serve.",
    submitted_at: "2026-10-03T10:00:00Z",
    reviewed_at: null,
    rejection_reason: null,
    status: "pending",
    profiles: { email: "owner@grace.example", full_name: "Grace Owner", avatar_url: null },
    ...overrides,
  };
}

function rows(data: unknown[]) {
  chains.contributor_applications._result = { data, error: null, count: data.length };
}
function removals(data: unknown[] | null, error: unknown = null) {
  chains.admin_actions._result = { data, error, count: data?.length ?? 0 };
}

describe("GET /api/admin/contributor-applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result.data = { role: "admin" };
    mockClient._chain._result.error = null;
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null });
    rows([application()]);
    removals([]);
  });

  it("returns 401 with no session and 403 for a non-admin, without reading applications", async () => {
    // (getRouteAuth and requireAdmin each call getUser, so this must not be a one-shot.)
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(get())).status).toBe(401);
    mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null });

    mockClient._chain._result.data = { role: "citizen" };
    expect((await GET(get())).status).toBe(403);
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it("shows the map category in `category` (it used to show the kind) and keeps the kind apart", async () => {
    const { data } = await (await GET(get())).json();
    expect(data[0].category).toBe("retreat-healing");
    expect(data[0].kind).toBe("ministry");
  });

  it("returns the staged profile fields and every social, keyed by platform", async () => {
    const { data } = await (await GET(get())).json();
    expect(data[0]).toMatchObject({
      id: "app-1",
      userId: USER_A,
      name: "Grace Hub",
      photo: "https://cdn.grace.example/logo.png",
      location: "1 Example Road, Pretoria",
      hasPin: true,
      contactEmail: "hello@grace.example",
      covers: ["https://cdn.grace.example/c1.jpg"],
      socials: { instagram: "@gracehub", x: "@gracehubx", whatsapp: "27712345678" },
      status: "pending",
    });
  });

  it("labels an online-only applicant and reports no pin", async () => {
    rows([application({ no_fixed_location: true, physical_address: null, physical_latitude: null, physical_longitude: null })]);
    const { data } = await (await GET(get())).json();
    expect(data[0].location).toBe("Online / no fixed location");
    expect(data[0].noFixedLocation).toBe(true);
    expect(data[0].hasPin).toBe(false);
  });

  it("carries the rejection reason as the card's admin note", async () => {
    rows([application({ status: "rejected", rejection_reason: "Please add a website", reviewed_at: "2026-10-04T08:00:00Z" })]);
    const { data } = await (await GET(get())).json();
    expect(data[0].reviewNote).toBe("Please add a website");
    expect(data[0].reviewedAt).toBe("2026-10-04T08:00:00Z");
  });

  describe("previously removed by an admin", () => {
    it("marks a PENDING applicant with their latest removal date", async () => {
      rows([application()]);
      removals([
        { target_id: USER_A, created_at: "2026-10-03T14:07:00Z" },
        { target_id: USER_A, created_at: "2026-09-01T09:00:00Z" },
      ]);
      const { data } = await (await GET(get())).json();
      expect(data[0].previouslyRemovedAt).toBe("2026-10-03T14:07:00Z");
      expect(adminClient.from).toHaveBeenCalledWith("admin_actions");
      expect(chains.admin_actions.eq).toHaveBeenCalledWith("action", "contributor_listing_removed");
      expect(chains.admin_actions.in).toHaveBeenCalledWith("target_id", [USER_A]);
    });

    it("is null for an applicant who was never removed, and only pending ones are looked up", async () => {
      rows([
        application({ id: "app-1", user_id: USER_A }),
        application({ id: "app-2", user_id: USER_B, status: "approved" }),
      ]);
      removals([{ target_id: USER_B, created_at: "2026-10-03T14:07:00Z" }]);
      const { data } = await (await GET(get())).json();
      expect(data.find((r: { id: string }) => r.id === "app-1").previouslyRemovedAt).toBeNull();
      // USER_B is not pending, so it was never even asked about.
      expect(chains.admin_actions.in).toHaveBeenCalledWith("target_id", [USER_A]);
      expect(data.find((r: { id: string }) => r.id === "app-2").previouslyRemovedAt).toBeNull();
    });

    it("does not query admin_actions at all when nothing is pending", async () => {
      rows([application({ status: "approved" })]);
      await GET(get());
      expect(adminClient.from).not.toHaveBeenCalledWith("admin_actions");
    });

    it("still returns the list if the removal lookup fails", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      removals(null, { message: "boom" });
      const res = await GET(get());
      expect(res.status).toBe(200);
      expect((await res.json()).data[0].previouslyRemovedAt).toBeNull();
    });
  });

  it("returns 500 if the applications cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    chains.contributor_applications._result = { data: null, error: { message: "boom" }, count: 0 };
    expect((await GET(get())).status).toBe(500);
  });

  it("never returns the applicant's private email address", async () => {
    const body = JSON.stringify(await (await GET(get())).json());
    expect(body).not.toContain("owner@grace.example");
  });
});
