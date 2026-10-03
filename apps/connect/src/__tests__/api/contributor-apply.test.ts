import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

// Two clients, because the route uses two on purpose: the caller's own session
// (reads only, RLS-scoped) and the service-role client (every write — migration
// 180 removed the table's client write privileges).
const mockClient = createMockSupabaseClient();
const adminClient = createMockSupabaseClient();
const mockGetRouteAuth = vi.fn();
const mockSendEmail = vi.fn();

// The real frontend authenticates via `Authorization: Bearer` (its Supabase
// session lives in localStorage, not cookies), so the route resolves the
// caller through `getRouteAuth` — mock that directly, matching every other
// Bearer-aware route's test convention, not the old cookie-only `createClient`.
vi.mock("@/lib/supabase/route", () => ({
  getRouteAuth: (...args: unknown[]) => mockGetRouteAuth(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClient,
}));
// Keep the real escapeHtml / siteOrigin / adminNotifyEmail; only the network send is faked.
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const { POST } = await import("@/app/api/contributor/apply/route");

const USER_ID = "11111111-2222-3333-4444-555555555555";
const ADMIN_INBOX = "admin@citizens.example";

function makeReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/contributor/apply", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function mockUser(user: { id: string } | null) {
  mockGetRouteAuth.mockResolvedValueOnce({ supabase: mockClient, user });
}

/** The two pre-flight reads: the caller's profile, then any existing pending application. */
function preflight(profile: Record<string, unknown> = { contributor_status: "not_applied", role: "citizen" }) {
  mockClient._chain.maybeSingle
    .mockResolvedValueOnce({ data: profile, error: null })
    .mockResolvedValueOnce({ data: null, error: null });
}

function insertedRow(): Record<string, unknown> | undefined {
  return adminClient._chain.insert.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
}

let originalAdminEmail: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  adminClient._chain._result = { data: null, error: null, count: 0 };
  adminClient._chain.single.mockResolvedValue({ data: { id: "new-app-id" }, error: null });
  mockSendEmail.mockResolvedValue("sent");
  originalAdminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  process.env.ADMIN_NOTIFY_EMAIL = ADMIN_INBOX;
});

afterEach(() => {
  if (originalAdminEmail === undefined) delete process.env.ADMIN_NOTIFY_EMAIL;
  else process.env.ADMIN_NOTIFY_EMAIL = originalAdminEmail;
});

describe("POST /api/contributor/apply", () => {
  it("returns 401 when unauthenticated", async () => {
    mockUser(null);
    const res = await POST(makeReq({ display_name: "Hope" }));
    expect(res.status).toBe(401);
  });

  it("returns 409 when already approved contributor", async () => {
    mockUser({ id: USER_ID });
    // first maybySingle → profile.contributor_status = "approved", role = "contributor"
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { contributor_status: "approved", role: "contributor" },
      error: null,
    });
    const res = await POST(makeReq({ display_name: "Hope Ministries" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("already_approved");
  });

  it("returns 409 when pending application already exists", async () => {
    mockUser({ id: USER_ID });
    mockClient._chain.maybeSingle
      // profiles.contributor_status
      .mockResolvedValueOnce({ data: { contributor_status: "pending" }, error: null })
      // existing pending
      .mockResolvedValueOnce({ data: { id: "app-1" }, error: null });
    const res = await POST(makeReq({ display_name: "Kingdom Hub" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("already_pending");
    expect(adminClient._chain.insert).not.toHaveBeenCalled();
  });

  it("returns 400 when display_name is too short", async () => {
    mockUser({ id: USER_ID });
    preflight();
    const res = await POST(makeReq({ display_name: "H" }));
    expect(res.status).toBe(400);
    expect(adminClient._chain.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["website_url", "Website"],
    ["facebook_url", "Facebook"],
    ["youtube_url", "YouTube"],
  ])("returns 400 when %s carries a dangerous scheme (stored-XSS guard)", async (key, label) => {
    mockUser({ id: USER_ID });
    preflight();
    const res = await POST(
      makeReq({ display_name: "Hope Ministries", [key]: "javascript:alert(1)" }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain(label);
    expect(adminClient._chain.insert).not.toHaveBeenCalled();
  });

  it("accepts the wizard's own scheme-less website placeholder and stores it as https", async () => {
    mockUser({ id: USER_ID });
    preflight();
    // apply.jsx's Website field literally placeholders "yourministry.org" —
    // rejecting that would fail a legitimate application.
    const res = await POST(
      makeReq({ display_name: "Hope Ministries", website_url: "yourministry.org" }),
    );
    expect(res.status).not.toBe(400);
    expect(insertedRow()?.website_url).toBe("https://yourministry.org/");
  });

  it("keeps a social handle as typed (the display layer builds the platform URL)", async () => {
    mockUser({ id: USER_ID });
    preflight();
    const res = await POST(
      makeReq({ display_name: "Hope Ministries", facebook_url: "hopeministries" }),
    );
    expect(res.status).not.toBe(400);
    expect(insertedRow()?.facebook_url).toBe("hopeministries");
  });

  it("normalises a valid website_url instead of rejecting it", async () => {
    mockUser({ id: USER_ID });
    preflight();
    const res = await POST(
      makeReq({ display_name: "Hope Ministries", website_url: "  https://hope.org  " }),
    );
    expect(res.status).not.toBe(400);
    expect(insertedRow()?.website_url).toBe("https://hope.org/");
  });

  it("rejects invalid contributor_kind by coercing to null", async () => {
    mockUser({ id: USER_ID });
    preflight();
    await POST(
      makeReq({
        display_name: "Valid Name",
        contributor_kind: "admin", // not in allow-list
      }),
    );
    expect(insertedRow()?.contributor_kind).toBeNull();
  });

  it("accepts a Contributor type and coerces anything else (incl. event-only slugs) to null", async () => {
    mockUser({ id: USER_ID });
    preflight();
    await POST(
      makeReq({
        display_name: "Grace Hub",
        contributor_category: "retreat-healing",
        contributor_kind: "individual",
        physical_latitude: -25.7479,
        physical_longitude: 28.2293,
      }),
    );
    const firstRow = insertedRow();
    expect(firstRow?.contributor_category).toBe("retreat-healing");
    expect(firstRow?.contributor_kind).toBe("individual");
    expect(firstRow?.physical_latitude).toBe(-25.7479);
    expect(firstRow?.physical_longitude).toBe(28.2293);

    resetRateLimitStore();
    mockUser({ id: USER_ID });
    preflight();
    await POST(
      makeReq({
        display_name: "Grace Hub Two",
        // An event category, not one of the 12 Contributor types.
        contributor_category: "worship-prayer",
        physical_latitude: "not-a-number",
      }),
    );
    const secondRow = insertedRow();
    expect(secondRow?.contributor_category).toBeNull();
    expect(secondRow?.physical_latitude).toBeNull();
  });

  it("no fixed location nulls the address and the pin", async () => {
    mockUser({ id: USER_ID });
    preflight();
    await POST(
      makeReq({
        display_name: "Online Ministry",
        no_fixed_location: true,
        physical_address: "1 Church Street",
        physical_latitude: -25.7,
        physical_longitude: 28.2,
      }),
    );
    const row = insertedRow();
    expect(row?.no_fixed_location).toBe(true);
    expect(row?.physical_address).toBeNull();
    expect(row?.physical_latitude).toBeNull();
    expect(row?.physical_longitude).toBeNull();
  });

  describe("D-12: the application waits for an admin", () => {
    it("saves a PENDING application and returns approved:false with no slug", async () => {
      mockUser({ id: USER_ID });
      preflight();
      const res = await POST(
        makeReq({
          display_name: "Kingdom Hub",
          contributor_kind: "ministry",
          motivation_text: "We host weekly community meals and outreach.",
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        success: true,
        application_id: "new-app-id",
        status: "pending",
        approved: false,
        slug: null,
      });
    });

    it("never calls any RPC, so there is nothing that can approve the caller", async () => {
      mockUser({ id: USER_ID });
      preflight();
      await POST(makeReq({ display_name: "Grace Hub" }));
      expect(mockClient.rpc).not.toHaveBeenCalled();
      expect(adminClient.rpc).not.toHaveBeenCalled();
    });

    it("writes with the service-role client, never the caller's own session", async () => {
      mockUser({ id: USER_ID });
      preflight();
      await POST(makeReq({ display_name: "Grace Hub" }));
      expect(mockClient._chain.insert).not.toHaveBeenCalled();
      expect(mockClient._chain.update).not.toHaveBeenCalled();
      expect(adminClient.from.mock.calls.map((c) => c[0])).toEqual(["contributor_applications", "profiles"]);
    });

    it("scopes the row to the VERIFIED user and ignores user_id / status smuggled in the body", async () => {
      mockUser({ id: USER_ID });
      preflight();
      await POST(
        makeReq({
          display_name: "Grace Hub",
          user_id: "99999999-9999-9999-9999-999999999999",
          status: "approved",
          reviewer_id: USER_ID,
          rejection_reason: "x",
        }),
      );
      const row = insertedRow();
      expect(row?.user_id).toBe(USER_ID);
      expect(row?.status).toBe("pending");
      expect(row).not.toHaveProperty("reviewer_id");
      expect(row).not.toHaveProperty("rejection_reason");
    });

    it("flips the profile to pending only from not_applied / rejected, for the verified user", async () => {
      mockUser({ id: USER_ID });
      preflight();
      await POST(makeReq({ display_name: "Grace Hub" }));
      expect(adminClient._chain.update).toHaveBeenCalledWith({ contributor_status: "pending" });
      expect(adminClient._chain.eq).toHaveBeenCalledWith("id", USER_ID);
      expect(adminClient._chain.in).toHaveBeenCalledWith("contributor_status", ["not_applied", "rejected"]);
    });

    it("removes the application again and returns 500 if the profile flip fails", async () => {
      mockUser({ id: USER_ID });
      preflight();
      // Only the awaited update/delete chains see _result; the insert's .single() has its own.
      adminClient._chain._result = { data: null, error: { message: "boom" }, count: 0 };
      const res = await POST(makeReq({ display_name: "Grace Hub" }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("apply_failed");
      expect(adminClient._chain.delete).toHaveBeenCalledTimes(1);
      expect(adminClient._chain.eq).toHaveBeenCalledWith("id", "new-app-id");
      expect(adminClient.from.mock.calls.map((c) => c[0])).toEqual([
        "contributor_applications",
        "profiles",
        "contributor_applications",
      ]);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("maps a unique-violation on insert to 409 already_pending (the race with the pre-flight)", async () => {
      mockUser({ id: USER_ID });
      preflight();
      adminClient._chain.single.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "dup" } });
      const res = await POST(makeReq({ display_name: "Grace Hub" }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("already_pending");
      expect(adminClient._chain.update).not.toHaveBeenCalled();
    });

    it("returns 500 insert_failed on any other insert error and does not touch the profile", async () => {
      mockUser({ id: USER_ID });
      preflight();
      adminClient._chain.single.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
      const res = await POST(makeReq({ display_name: "Grace Hub" }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("insert_failed");
      expect(adminClient._chain.update).not.toHaveBeenCalled();
    });

    it("lets a previously rejected applicant apply again", async () => {
      mockUser({ id: USER_ID });
      preflight({ contributor_status: "rejected", role: "citizen" });
      const res = await POST(makeReq({ display_name: "Grace Hub" }));
      expect(res.status).toBe(200);
      expect(adminClient._chain.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe("the admin email", () => {
    it("emails the configured admin address with the applicant's name, category and area", async () => {
      mockUser({ id: USER_ID });
      preflight();
      await POST(
        makeReq({
          display_name: "Grace Hub",
          contributor_category: "retreat-healing",
          physical_address: "12 Example Road, Pretoria",
        }),
      );
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const mail = mockSendEmail.mock.calls[0][0] as { to: string; subject: string; html: string; text: string };
      expect(mail.to).toBe(ADMIN_INBOX);
      expect(mail.subject).toContain("Grace Hub");
      expect(mail.text).toContain("Retreat / Healing");
      expect(mail.text).toContain("12 Example Road, Pretoria");
      expect(mail.text).toContain("Admin → Applications");
    });

    it("escapes a hostile name in the HTML part", async () => {
      mockUser({ id: USER_ID });
      preflight();
      await POST(makeReq({ display_name: '<img src=x onerror="alert(1)">Evil' }));
      const mail = mockSendEmail.mock.calls[0][0] as { html: string };
      expect(mail.html).not.toContain("<img");
      expect(mail.html).toContain("&lt;img");
    });

    it("still succeeds, without emailing, when ADMIN_NOTIFY_EMAIL is not configured", async () => {
      delete process.env.ADMIN_NOTIFY_EMAIL;
      mockUser({ id: USER_ID });
      preflight();
      const res = await POST(makeReq({ display_name: "Grace Hub" }));
      expect(res.status).toBe(200);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("still succeeds when the email fails (the application is already saved)", async () => {
      mockSendEmail.mockResolvedValueOnce("failed");
      mockUser({ id: USER_ID });
      preflight();
      const res = await POST(makeReq({ display_name: "Grace Hub" }));
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });
  });
});
