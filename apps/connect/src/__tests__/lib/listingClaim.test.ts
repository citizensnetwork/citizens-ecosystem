import { describe, it, expect, vi } from "vitest";
import { isPlaceholderEmail, placeholderAliasEmail, PLACEHOLDER_EMAIL_DOMAIN } from "@/lib/placeholderEmail";
import { ageInDays, createListingUser, pendingListingMessage, registerListingClaim } from "@/lib/listingClaim";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

describe("placeholder alias addresses (C10)", () => {
  it("makes a unique, unguessable address on the reserved .invalid domain", () => {
    const a = placeholderAliasEmail();
    const b = placeholderAliasEmail();
    expect(a).toMatch(/^listing-[0-9a-f-]{36}@listing-placeholder\.invalid$/);
    expect(a).not.toBe(b);
    expect(PLACEHOLDER_EMAIL_DOMAIN.endsWith(".invalid")).toBe(true);
    expect(placeholderAliasEmail("abc")).toBe("listing-abc@listing-placeholder.invalid");
  });

  it("recognises an alias whatever its case or surrounding space, and nothing else", () => {
    expect(isPlaceholderEmail(placeholderAliasEmail())).toBe(true);
    expect(isPlaceholderEmail("  LISTING-X@Listing-Placeholder.INVALID ")).toBe(true);
    for (const v of ["owner@example.com", "x@listing-placeholder.invalid.example.com", "x@notlisting-placeholder.invalid", "", null, undefined, 42]) {
      expect(isPlaceholderEmail(v), String(v)).toBe(false);
    }
  });
});

describe("ageInDays", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  it("counts whole days, never negative, and survives a bad date", () => {
    expect(ageInDays("2026-10-21T08:00:00Z", now)).toBe(0);
    expect(ageInDays("2026-10-20T11:59:00Z", now)).toBe(1);
    expect(ageInDays("2026-10-14T12:00:00Z", now)).toBe(7);
    expect(ageInDays("2026-10-30T12:00:00Z", now)).toBe(0);
    expect(ageInDays("not a date", now)).toBe(0);
  });
});

describe("pendingListingMessage", () => {
  it("names the waiting listing and tells the admin what to do", () => {
    const m = pendingListingMessage("o@example.com", "grace-first", "https://x.test");
    expect(m).toContain("o@example.com");
    expect(m).toContain("https://x.test/c/grace-first");
    expect(m).toMatch(/needs to answer that one first/);
    expect(pendingListingMessage("o@example.com", null, "https://x.test")).not.toContain("/c/");
  });
});

// A tiny admin client: auth.admin.createUser answers from a queue; from() is one chain with scripted results.
function fakeAdmin(opts: { users?: Array<{ id?: string; error?: { message?: string; code?: string } }>; profile?: unknown; insertError?: { code?: string } | null; openSlug?: string | null }) {
  const users = [...(opts.users ?? [])];
  const table = {
    select: vi.fn(() => table),
    eq: vi.fn(() => table),
    maybeSingle: vi.fn(async () => ({ data: opts.openSlug !== undefined ? { slug: opts.openSlug } : (opts.profile ?? null), error: null })),
    insert: vi.fn(async () => ({ error: opts.insertError ?? null })),
  };
  const createUser = vi.fn(async () => {
    const next = users.shift() ?? { id: "u-default" };
    return next.error ? { data: { user: null }, error: next.error } : { data: { user: { id: next.id } }, error: null };
  });
  const admin = { auth: { admin: { createUser } }, from: vi.fn(() => table) } as unknown as Admin;
  return { admin, createUser, table };
}

const taken = { error: { message: "A user with this email address has already been registered", code: "email_exists" } };
const input = { claimEmail: "owner@example.com", userMetadata: { full_name: "Org" }, origin: "https://x.test" };

describe("createListingUser", () => {
  it("a free address: the placeholder holds it, owner has no account", async () => {
    const { admin, createUser } = fakeAdmin({ users: [{ id: "u1" }] });
    expect(await createListingUser(admin, input)).toEqual({ ok: true, userId: "u1", ownerHasAccount: false });
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith({ email: "owner@example.com", email_confirm: true, user_metadata: { full_name: "Org" } });
  });

  it("defer: a plain Citizen is handed back for an upgrade, and no alias user is created", async () => {
    const profile = { id: "citizen-1", role: "citizen", email: "owner@example.com", contributor_status: "not_applied", contributor_slug: null, deleted_at: null };
    const { admin, createUser } = fakeAdmin({ users: [taken], profile });
    const result = await createListingUser(admin, input, { existingCitizen: "defer" });
    expect(result).toEqual({ ok: false, status: 409, error: "existing_citizen", profile });
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it("a removed account is refused, even when the caller would otherwise defer or alias it", async () => {
    const { admin, createUser } = fakeAdmin({
      users: [taken],
      profile: { role: "citizen", contributor_status: "not_applied", deleted_at: "2026-01-01T00:00:00.000Z" },
    });
    const result = await createListingUser(admin, input, { existingCitizen: "defer" });
    expect(result).toMatchObject({ ok: false, status: 409, error: "account_not_eligible" });
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it("a Contributor with no public page is refused without an alias", async () => {
    const { admin, createUser } = fakeAdmin({
      users: [taken],
      profile: { role: "contributor", contributor_slug: null },
    });
    const result = await createListingUser(admin, input);
    expect(result).toMatchObject({ ok: false, status: 409, error: "account_not_eligible" });
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it("a taken address of a plain Citizen: an alias placeholder, flagged, never the real address twice", async () => {
    const { admin, createUser } = fakeAdmin({ users: [taken, { id: "alias1" }], profile: { role: "citizen", contributor_status: "not_applied", contributor_slug: null } });
    expect(await createListingUser(admin, input)).toEqual({ ok: true, userId: "alias1", ownerHasAccount: true });
    const second = createUser.mock.calls[1] as unknown as [{ email: string; email_confirm: boolean; user_metadata: Record<string, unknown> }];
    expect(isPlaceholderEmail(second[0].email)).toBe(true);
    expect(second[0].email_confirm).toBe(true);
    expect(second[0].user_metadata).toMatchObject({ full_name: "Org", listing_for_existing_account: true });
  });

  it("refuses without creating anything for an existing Contributor, an applicant, an admin and an unknown account", async () => {
    const cases: Array<[unknown, string, RegExp | null]> = [
      [{ role: "contributor", contributor_status: "approved", contributor_slug: "grace", contributor_hidden: true }, "listing_exists", /currently hidden/],
      [{ role: "citizen", contributor_status: "pending", contributor_slug: null }, "email_already_registered", /application of its own/],
      [{ role: "citizen", contributor_status: "rejected", contributor_slug: null }, "email_already_registered", /application of its own/],
      [{ role: "admin", contributor_status: "not_applied", contributor_slug: null }, "email_already_registered", /administrator/],
      [null, "email_already_registered", /already has a Citizens Connect account/],
    ];
    for (const [profile, error, words] of cases) {
      const { admin, createUser } = fakeAdmin({ users: [taken], profile });
      const result = await createListingUser(admin, input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.error).toBe(error);
        if (words) expect(result.message).toMatch(words);
      }
      expect(createUser).toHaveBeenCalledTimes(1);
    }
  });

  it("an unexpected createUser failure is a 500, not a guess about the account", async () => {
    const { admin } = fakeAdmin({ users: [{ error: { message: "database is down" } }] });
    const result = await createListingUser(admin, input);
    expect(result).toMatchObject({ ok: false, status: 500, error: "create_user_failed" });
  });

  it("a failed alias is a 500 that names the address", async () => {
    const { admin } = fakeAdmin({
      users: [taken, { error: { message: "Unable to validate email address: invalid format" } }],
      profile: { role: "citizen", contributor_status: "not_applied", contributor_slug: null },
    });
    const result = await createListingUser(admin, input);
    expect(result).toMatchObject({ ok: false, status: 500, error: "create_user_failed" });
    if (!result.ok) expect(result.message).toContain("owner@example.com");
  });
});

describe("registerListingClaim", () => {
  const row = { placeholderId: "p1", slug: "grace", claimEmail: "owner@example.com", source: "google_form" as const };

  it("writes the ledger row with exactly the fields the table takes", async () => {
    const { admin, table } = fakeAdmin({});
    expect(await registerListingClaim(admin, row)).toEqual({ ok: true });
    expect(table.insert).toHaveBeenCalledWith({ placeholder_id: "p1", slug: "grace", claim_email: "owner@example.com", source: "google_form" });
  });

  it("a unique violation is 'duplicate' and finds the listing already waiting", async () => {
    const { admin } = fakeAdmin({ insertError: { code: "23505" }, openSlug: "grace-first" });
    expect(await registerListingClaim(admin, row)).toEqual({ ok: false, reason: "duplicate", existingSlug: "grace-first" });
  });

  it("any other failure is an error, not a duplicate", async () => {
    const { admin } = fakeAdmin({ insertError: { code: "42501" } });
    expect(await registerListingClaim(admin, row)).toEqual({ ok: false, reason: "error" });
  });
});
