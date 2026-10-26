/**
 * Server helpers for the verify-first listing claim (C10, migration 196).
 *
 * A listing made for an owner by the Google Form or by an admin goes live at once, but it is never attached to
 * anybody's account until that person has proved the address and said yes:
 *
 *   - the address has NO account  → the placeholder auth user holds the real address ("self" mode); the owner
 *                                    signs in as it and confirms the listing is theirs;
 *   - the address HAS an account  → the placeholder gets an alias address ("attach" mode); the owner signs in to
 *                                    their own account and confirms the attach.
 *
 * Both flows record a `listing_claims` ledger row (state: awaiting → confirmed | declined). Everything the browser
 * does afterwards goes through the SECURITY DEFINER functions of migration 196; this module only covers the
 * service-role side (creating the placeholder user, writing the ledger row, the reminder sweep's queries).
 */

import { placeholderAliasEmail } from "@/lib/placeholderEmail";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type ClaimSource = "google_form" | "admin_create";

/** One reminder, this long after the listing went live. Nothing ever expires or attaches by itself. */
export const REMINDER_AFTER_DAYS = 7;

/** The profile row behind a taken address. Only the columns createListingUser selects. */
export type ExistingListingProfile = {
  id?: string;
  role?: string;
  email?: string | null;
  contributor_status?: string | null;
  contributor_slug?: string | null;
  contributor_hidden?: boolean | null;
  deleted_at?: string | null;
};

export type ListingUserResult =
  | { ok: true; userId: string; ownerHasAccount: boolean }
  | {
      ok: false;
      status: number;
      error: string;
      message?: string;
      url?: string;
      /** Set only for `existing_citizen`: the Google Form route starts an upgrade instead of an alias listing. */
      profile?: ExistingListingProfile;
    };

function isEmailTaken(err: { code?: string; message?: string } | null | undefined): boolean {
  return err?.code === "email_exists" || !!err?.message?.toLowerCase().includes("already been registered");
}

/**
 * Create the auth user a new listing will live under.
 *
 * Tries the real address first. If it is taken, the owner already has an account: a plain Citizen with nothing in
 * progress gets the alias flow, unless the caller passes `existingCitizen: "defer"` (the Google Form). That returns
 * `existing_citizen` and creates nothing, so the form can start a confirm-and-upgrade of the account itself.
 * Anything else is refused with a message that says what to do (it goes to the Sheet's Notes / the admin's screen).
 * The profile lookup is service-role: `profiles.email` is private, and this is only reachable past the HMAC check
 * or the admin check.
 */
export async function createListingUser(
  admin: Admin,
  input: { claimEmail: string; userMetadata: Record<string, unknown>; origin: string },
  opts?: { existingCitizen?: "alias" | "defer" },
): Promise<ListingUserResult> {
  const first = await admin.auth.admin.createUser({
    email: input.claimEmail,
    email_confirm: true,
    user_metadata: input.userMetadata,
  });
  if (!first.error && first.data?.user) {
    return { ok: true, userId: first.data.user.id, ownerHasAccount: false };
  }
  if (!isEmailTaken(first.error)) {
    console.error("[listingClaim] createUser", first.error);
    return { ok: false, status: 500, error: "create_user_failed" };
  }

  const { data } = await admin
    .from("profiles")
    .select("id, role, contributor_status, contributor_slug, contributor_hidden, deleted_at")
    .eq("email", input.claimEmail)
    .maybeSingle();
  const existing = data as ExistingListingProfile | null;

  // A removed account is never a listing target and never an upgrade target.
  if (existing?.deleted_at) {
    return {
      ok: false,
      status: 409,
      error: "account_not_eligible",
      message: "That email can't take a Contributor listing this way, so nothing was changed.",
    };
  }

  if (existing?.role === "contributor" && existing.contributor_slug) {
    const url = `${input.origin}/c/${existing.contributor_slug}`;
    const hidden = existing.contributor_hidden ? " (currently hidden)" : "";
    return {
      ok: false,
      status: 409,
      error: "listing_exists",
      message: `${input.claimEmail} already has a Contributor listing${hidden}: ${url} — nothing was changed.`,
      url,
    };
  }

  if (existing?.role === "contributor") {
    return {
      ok: false,
      status: 409,
      error: "account_not_eligible",
      message: "That email already belongs to a Contributor account, so nothing was changed.",
    };
  }

  // Google Form (#248): a plain citizen confirms an upgrade of their own account. No alias listing.
  // Admin Create keeps the alias (default). Pending and rejected applications are refused below.
  const plainCitizen =
    existing?.role === "citizen" && existing.contributor_status !== "pending" && existing.contributor_status !== "rejected";
  if (opts?.existingCitizen === "defer" && existing && plainCitizen) {
    return { ok: false, status: 409, error: "existing_citizen", profile: existing };
  }

  if (existing?.role === "citizen" && existing.contributor_status === "not_applied") {
    const alias = await admin.auth.admin.createUser({
      email: placeholderAliasEmail(),
      email_confirm: true,
      user_metadata: { ...input.userMetadata, listing_for_existing_account: true },
    });
    if (alias.error || !alias.data?.user) {
      console.error("[listingClaim] createUser (alias)", alias.error);
      return {
        ok: false,
        status: 500,
        error: "create_user_failed",
        message: `${input.claimEmail} already has an account and the placeholder for its listing could not be created.`,
      };
    }
    return { ok: true, userId: alias.data.user.id, ownerHasAccount: true };
  }

  const why =
    existing?.role === "admin"
      ? " belongs to an administrator account"
      : existing?.contributor_status === "pending" || existing?.contributor_status === "rejected"
        ? " has a Contributor application of its own"
        : " already has a Citizens Connect account";
  return {
    ok: false,
    status: 409,
    error: "email_already_registered",
    message:
      `${input.claimEmail}${why}, so no listing was created. Ask the owner to sign in and choose ` +
      "Settings → Become a Contributor, or change the owner's email on this row and tick Approve again.",
  };
}

export type RegisterClaimResult = { ok: true } | { ok: false; reason: "duplicate"; existingSlug: string | null } | { ok: false; reason: "error" };

/**
 * Record the ledger row for a listing that was just created. A second open request for the same address
 * (a second approval while the first still waits) is refused by the database; the caller rolls the new
 * placeholder back and tells the admin which listing is already waiting.
 */
export async function registerListingClaim(
  admin: Admin,
  input: { placeholderId: string; slug: string; claimEmail: string; source: ClaimSource },
): Promise<RegisterClaimResult> {
  const { error } = await admin.from("listing_claims").insert({
    placeholder_id: input.placeholderId,
    slug: input.slug,
    claim_email: input.claimEmail,
    source: input.source,
  });
  if (!error) return { ok: true };
  if (error.code === "23505") {
    const { data } = await admin
      .from("listing_claims")
      .select("slug")
      .eq("claim_email", input.claimEmail)
      .eq("status", "awaiting")
      .maybeSingle();
    return { ok: false, reason: "duplicate", existingSlug: (data as { slug?: string } | null)?.slug ?? null };
  }
  console.error("[listingClaim] ledger insert", error);
  return { ok: false, reason: "error" };
}

/** Message for the Sheet's Notes / admin screen when the address already has a listing waiting. */
export function pendingListingMessage(claimEmail: string, existingSlug: string | null, origin: string): string {
  const where = existingSlug ? `: ${origin}/c/${existingSlug}` : "";
  return `${claimEmail} already has a listing waiting for the owner to confirm${where}. Nothing was created; the owner needs to answer that one first.`;
}

/** Age in whole days of a ledger row, for the Sheet's "Awaiting owner" label. Never negative. */
export function ageInDays(createdAt: string, now: number = Date.now()): number {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}
