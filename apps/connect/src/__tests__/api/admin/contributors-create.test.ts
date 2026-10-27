import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();
// from("profiles").select().eq().maybeSingle() finds the existing account behind a taken address;
// from("listing_claims").insert() writes the verify-first ledger row (C10); .select().eq().eq().maybeSingle() finds the open one.
const adminTable = {
  select: vi.fn(() => adminTable),
  eq: vi.fn(() => adminTable),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
};
const mockAdmin = {
  auth: {
    admin: {
      createUser: vi.fn(),
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
    },
  },
  from: vi.fn(() => adminTable),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));
// No real emails, ever: only the network send is faked (escapeHtml / siteOrigin /
// adminNotifyEmail stay real).
const mockSendEmail = vi.fn();
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const { POST } = await import("@/app/api/admin/contributors/create/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const NEW_USER_ID = "22222222-2222-2222-2222-222222222222";
const ADMIN_INBOX = "admin@citizens.example";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/contributors/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  display_name: "Grace Outreach",
  claim_email: "org@example.com",
  contributor_kind: "ministry",
  contributor_category: "outreach-missions",
  bio: "We serve the community.",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  mockClient._chain._result.data = { role: "admin" };
  mockClient._chain._result.error = null;
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: { id: ADMIN_ID, email: "admin@example.com" } },
    error: null,
  });
  mockAdmin.auth.admin.createUser.mockResolvedValue({
    data: { user: { id: NEW_USER_ID } },
    error: null,
  });
  adminTable.maybeSingle.mockResolvedValue({ data: null, error: null });
  adminTable.insert.mockResolvedValue({ error: null });
  mockSendEmail.mockResolvedValue("sent");
  vi.stubEnv("ADMIN_NOTIFY_EMAIL", ADMIN_INBOX);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/contributors/create", () => {
  it("rejects non-admins", async () => {
    mockClient._chain._result.data = { role: "citizen" };
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("rejects a missing display_name", async () => {
    const res = await POST(req({ ...validBody, display_name: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid claim_email", async () => {
    const res = await POST(req({ ...validBody, claim_email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("rejects a pathological claim_email quickly (ReDoS guard)", async () => {
    // Length is checked before the regex ever runs, and the regex itself
    // uses bounded quantifiers — this must resolve in well under a second,
    // not hang. See the CodeQL "polynomial regular expression" finding this
    // guards against.
    const evil = "a".repeat(50_000) + "@" + "a".repeat(50_000) + "!";
    const start = Date.now();
    const res = await POST(req({ ...validBody, claim_email: evil }));
    expect(Date.now() - start).toBeLessThan(500);
    expect(res.status).toBe(400);
  });

  it("rejects an unknown contributor_category", async () => {
    const res = await POST(req({ ...validBody, contributor_category: "not-real" }));
    expect(res.status).toBe(400);
  });

  it("creates the auth user then calls the profile RPC as the admin's own session", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, slug: "grace-outreach" },
      error: null,
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.contributor_id).toBe(NEW_USER_ID);
    expect(json.slug).toBe("grace-outreach");

    expect(mockAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "org@example.com", email_confirm: true }),
    );
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "admin_create_contributor_profile",
      expect.objectContaining({
        _target_id: NEW_USER_ID,
        _display_name: "Grace Outreach",
        _claim_email: "org@example.com",
        _contributor_kind: "ministry",
        _contributor_category: "outreach-missions",
      }),
    );
  });

  it("nulls physical_address/lat/lng when no_fixed_location is set", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, slug: "grace-outreach" },
      error: null,
    });
    await POST(
      req({
        ...validBody,
        no_fixed_location: true,
        physical_address: "123 Main St",
        physical_latitude: -25.7,
        physical_longitude: 28.2,
      }),
    );
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "admin_create_contributor_profile",
      expect.objectContaining({
        _no_fixed_location: true,
        _physical_address: null,
        _physical_latitude: null,
        _physical_longitude: null,
      }),
    );
  });

  it("stores contact email, X, LinkedIn, WhatsApp and the cover, and still sends the original socials to the RPC", async () => {
    mockClient._chain._result.data = { role: "admin", id: NEW_USER_ID };
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, slug: "grace-outreach" },
      error: null,
    });
    const res = await POST(
      req({
        ...validBody,
        contact_email: "Hello@Example.org",
        instagram_handle: "@graceexample",
        facebook_url: "facebook.com/graceexample",
        x_handle: "@graceexample",
        linkedin_url: "linkedin.com/company/example",
        whatsapp_number: "+27 82 000 0000",
        cover_photo_urls: ["https://images.example.org/cover.jpg"],
      }),
    );
    expect(res.status).toBe(200);

    expect(mockClient.rpc).toHaveBeenCalledWith(
      "admin_create_contributor_profile",
      expect.objectContaining({
        _instagram_handle: "@graceexample",
        _facebook_url: "https://facebook.com/graceexample",
      }),
    );
    const rpcArgs = mockClient.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(rpcArgs).not.toHaveProperty("_x_handle");
    expect(rpcArgs).not.toHaveProperty("_contact_email");
    expect(rpcArgs).not.toHaveProperty("_cover_photo_urls");

    expect(mockClient._chain.update).toHaveBeenCalledWith({
      contributor_contact_email: "hello@example.org",
      x_handle: "@graceexample",
      linkedin_url: "https://linkedin.com/company/example",
      whatsapp_number: "27820000000",
      cover_photo_urls: [{ url: "https://images.example.org/cover.jpg", caption: null }],
    });
    expect(mockClient._chain.eq).toHaveBeenCalledWith("id", NEW_USER_ID);
    expect(mockAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("does not write the extra columns when contact, the new socials and the cover are left blank", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, slug: "grace-outreach" },
      error: null,
    });
    const res = await POST(req({ ...validBody, instagram_handle: "@graceexample" }));
    expect(res.status).toBe(200);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "admin_create_contributor_profile",
      expect.objectContaining({ _instagram_handle: "@graceexample" }),
    );
    expect(mockClient._chain.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid public contact email, social link or cover before creating a user", async () => {
    for (const extra of [
      { contact_email: "not-an-email" },
      { x_handle: "Grace Radio" },
      { linkedin_url: "javascript:alert(1)" },
      { whatsapp_number: "call the office" },
      { cover_photo_urls: ["javascript:alert(1)"] },
      { cover_photo_urls: ["not a url"] },
      { cover_photo_urls: "https://images.example.org/cover.jpg" },
    ]) {
      mockAdmin.auth.admin.createUser.mockClear();
      const res = await POST(req({ ...validBody, ...extra }));
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
    }
  });

  it("deletes the new auth user when the extra columns cannot be saved", async () => {
    mockClient._chain._result.data = { role: "admin", id: NEW_USER_ID };
    mockClient._chain._result.error = { message: "update refused" };
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, slug: "grace-outreach" },
      error: null,
    });
    const res = await POST(req({ ...validBody, contact_email: "hello@example.org" }));
    expect(res.status).toBe(500);
    expect(mockAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("cleans up the auth user when the profile RPC fails", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: false, reason: "target_not_found" },
      error: null,
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    expect(mockAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
  });

  it("returns 409 when the email is registered to an account that cannot be offered a listing", async () => {
    mockAdmin.auth.admin.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Email address has already been registered" },
    });
    adminTable.maybeSingle.mockResolvedValueOnce({ data: { role: "admin", contributor_status: "not_applied", contributor_slug: null }, error: null });
    const res = await POST(req(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("email_already_registered");
    expect(json.message).toMatch(/administrator/);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("returns 409 listing_exists for an address that already holds a live listing", async () => {
    mockAdmin.auth.admin.createUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "", code: "email_exists" } });
    adminTable.maybeSingle.mockResolvedValueOnce({ data: { role: "contributor", contributor_slug: "grace-outreach", contributor_hidden: false }, error: null });
    const res = await POST(req(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("listing_exists");
  });

  // ── C10: verify-first. An address that already has an account is never touched. ──
  describe("verify-first (C10)", () => {
    const ALIAS_ID = "77777777-7777-4777-8777-777777777777";
    const created = () =>
      mockClient.rpc.mockResolvedValueOnce({ data: { success: true, slug: "grace-outreach" }, error: null });
    const takenByCitizen = () => {
      mockAdmin.auth.admin.createUser
        .mockResolvedValueOnce({ data: { user: null }, error: { message: "has already been registered", code: "email_exists" } })
        .mockResolvedValueOnce({ data: { user: { id: ALIAS_ID } }, error: null });
      adminTable.maybeSingle.mockResolvedValueOnce({
        data: { role: "citizen", contributor_status: "not_applied", contributor_slug: null },
        error: null,
      });
    };

    it("a new address: records the ledger row and tells the screen the owner has no account", async () => {
      created();
      const json = await (await POST(req(validBody))).json();
      expect(json).toMatchObject({ success: true, ownerHasAccount: false, awaitingOwner: true });
      expect(mockAdmin.from).toHaveBeenCalledWith("listing_claims");
      expect(adminTable.insert).toHaveBeenCalledWith({
        placeholder_id: NEW_USER_ID,
        slug: "grace-outreach",
        claim_email: "org@example.com",
        source: "admin_create",
      });
    });

    it("an address with an account: the listing goes live under an alias placeholder, and nothing on that account is touched", async () => {
      takenByCitizen();
      created();
      const res = await POST(req(validBody));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: true, contributor_id: ALIAS_ID, ownerHasAccount: true, awaitingOwner: true });
      const alias = mockAdmin.auth.admin.createUser.mock.calls[1][0] as { email: string; email_confirm: boolean };
      expect(alias.email).toMatch(/^listing-[0-9a-f-]{36}@listing-placeholder\.invalid$/);
      expect(alias.email_confirm).toBe(true);
      // The profile is made on the alias user and remembers the REAL address as the claim email.
      expect(mockClient.rpc).toHaveBeenCalledWith("admin_create_contributor_profile", expect.objectContaining({ _target_id: ALIAS_ID, _claim_email: "org@example.com" }));
      expect(adminTable.insert).toHaveBeenCalledWith(expect.objectContaining({ placeholder_id: ALIAS_ID, claim_email: "org@example.com", source: "admin_create" }));
      expect(mockClient._chain.update).not.toHaveBeenCalled();
    });

    it("the welcome email is addressed to the REAL address and offers the attach, never to the alias", async () => {
      takenByCitizen();
      created();
      await POST(req(validBody));
      const mail = mockSendEmail.mock.calls[0][0] as { to: string; text: string; html: string };
      expect(mail.to).toBe("org@example.com");
      expect(mail.to).not.toContain("listing-placeholder");
      expect(mail.text).toContain("You already have a Citizens Connect account with org@example.com");
      expect(mail.text).toContain('"Attach Grace Outreach to your account?"');
      expect(mail.text).toContain("Nothing on your account changes unless you tap Confirm");
      expect(mail.html).toContain("Attach Grace Outreach to your account?");
    });

    it("a second open request for the same address: 409 listing_pending, rolled back, no email", async () => {
      created();
      adminTable.insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate" } });
      adminTable.maybeSingle.mockResolvedValueOnce({ data: { slug: "grace-first" }, error: null });
      const res = await POST(req(validBody));
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe("listing_pending");
      expect(json.message).toContain("/c/grace-first");
      expect(mockAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("a ledger failure rolls the listing back (never a listing nobody is asked about)", async () => {
      created();
      adminTable.insert.mockResolvedValueOnce({ error: { code: "42P01", message: "relation does not exist" } });
      const res = await POST(req(validBody));
      expect(res.status).toBe(500);
      expect(mockAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  // ── D-13: the owner's welcome email ─────────────────────────────────────
  describe("welcome email to the owner", () => {
    const created = () =>
      mockClient.rpc.mockResolvedValueOnce({ data: { success: true, slug: "grace-outreach" }, error: null });

    it("is sent by default, to the owner's address, after the listing exists", async () => {
      created();
      const res = await POST(req(validBody));
      expect(res.status).toBe(200);
      expect((await res.json()).email).toBe("sent");

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const mail = mockSendEmail.mock.calls[0][0] as { to: string; replyTo: string; subject: string; html: string; text: string };
      expect(mail.to).toBe("org@example.com");
      expect(mail.replyTo).toBe(ADMIN_INBOX);
      expect(mail.subject).toContain("Grace Outreach");
    });

    it("tells a listing with a map pin it is on the map", async () => {
      created();
      await POST(req({ ...validBody, physical_address: "Church Square, Pretoria", physical_latitude: -25.7, physical_longitude: 28.2 }));
      const mail = mockSendEmail.mock.calls[0][0] as { text: string; html: string };
      expect(mail.text).toContain("now on the map and in Kingdom Discovery");
      expect(mail.html).toContain("now on the map and in Kingdom Discovery");
    });

    it("does not say 'on the map' for a listing without a pin (no coordinates, or 'no fixed location')", async () => {
      for (const body of [
        validBody,
        { ...validBody, no_fixed_location: true, physical_latitude: -25.7, physical_longitude: 28.2 },
        { ...validBody, physical_latitude: -25.7 },
      ]) {
        mockSendEmail.mockClear();
        created();
        await POST(req(body));
        const mail = mockSendEmail.mock.calls[0][0] as { text: string; html: string };
        expect(mail.text).toContain("now in Kingdom Discovery");
        expect(mail.text).not.toContain("on the map");
        expect(mail.html).not.toContain("on the map");
      }
    });

    it("tells the admin's screen whether the listing is on the map, even when no email is sent (C21)", async () => {
      for (const [body, want] of [
        [{ ...validBody, physical_address: "Church Square, Pretoria", physical_latitude: -25.7, physical_longitude: 28.2 }, true],
        [validBody, false],
        [{ ...validBody, no_fixed_location: true, physical_latitude: -25.7, physical_longitude: 28.2 }, false],
        [{ ...validBody, physical_latitude: -25.7 }, false],
        [{ ...validBody, physical_latitude: -25.7, physical_longitude: 28.2, email_owner: false }, true],
        [{ ...validBody, email_owner: false }, false],
      ] as const) {
        created();
        const json = await (await POST(req(body))).json();
        expect(json.onMap, JSON.stringify(body)).toBe(want);
      }
    });

    it("carries the 6-digit sign-in steps, the listing link and 'sign in to see your listing' wording", async () => {
      created();
      await POST(req(validBody));
      const mail = mockSendEmail.mock.calls[0][0] as { text: string; html: string };
      expect(mail.text).toContain("Continue with email");
      expect(mail.text).toContain("6-digit code");
      expect(mail.text).toContain("/c/grace-outreach");
      expect(mail.text).toContain("/dashboard");
      expect(mail.text).toContain("sign in with org@example.com");
      // C10: a confirm screen sits in front of every claim, so the email says so and never promises it is "automatically yours".
      expect(mail.text.toLowerCase()).not.toContain("automatically");
      expect(mail.text).toContain("confirm the listing is yours");
      expect(mail.text).toContain("tap Not me");
      expect(mail.text).not.toContain("land on your Contributor dashboard");
      expect(mail.html).toContain("Google");
    });

    it("is skipped, and nothing is sent, when the admin unticks 'Email the owner'", async () => {
      created();
      const res = await POST(req({ ...validBody, email_owner: false }));
      expect(res.status).toBe(200);
      expect((await res.json()).email).toBe("skipped");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("only an explicit false turns it off (a missing or truthy value still sends)", async () => {
      for (const email_owner of [undefined, true, "false", 0]) {
        mockSendEmail.mockClear();
        resetRateLimitStore();
        created();
        await POST(req({ ...validBody, email_owner }));
        expect(mockSendEmail).toHaveBeenCalledTimes(1);
      }
    });

    it("never fails the create when the email fails, and says so", async () => {
      created();
      mockSendEmail.mockResolvedValueOnce("failed");
      const res = await POST(req(validBody));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.email).toBe("failed");
    });

    it("reports 'skipped' when email isn't configured (sendEmail's own answer)", async () => {
      created();
      mockSendEmail.mockResolvedValueOnce("skipped");
      const res = await POST(req(validBody));
      expect((await res.json()).email).toBe("skipped");
    });

    it("sends no Reply-To rather than a bad one when ADMIN_NOTIFY_EMAIL isn't set", async () => {
      vi.stubEnv("ADMIN_NOTIFY_EMAIL", "");
      created();
      await POST(req(validBody));
      expect((mockSendEmail.mock.calls[0][0] as { replyTo: unknown }).replyTo).toBeNull();
    });

    it("escapes a hostile name in the HTML part", async () => {
      created();
      await POST(req({ ...validBody, display_name: '<img src=x onerror="alert(1)"> Co' }));
      const mail = mockSendEmail.mock.calls[0][0] as { html: string };
      expect(mail.html).not.toContain("<img");
      expect(mail.html).toContain("&lt;img");
    });

    it("sends nothing when the listing could not be created", async () => {
      mockClient.rpc.mockResolvedValueOnce({ data: { success: false, reason: "target_not_found" }, error: null });
      const res = await POST(req(validBody));
      expect(res.status).toBe(500);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("is never sent for a non-admin", async () => {
      mockClient._chain._result.data = { role: "citizen" };
      await POST(req(validBody));
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
