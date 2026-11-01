/**
 * POST /api/admin/contributors/create
 *
 * Admin-only. Manually creates a live Contributor listing — visible
 * immediately on the map and in Kingdom Discovery, exactly like a
 * self-serve one — tied to an email address so the real person/org can
 * later claim it (see `claim_admin_created_contributor`, migration 169).
 *
 * `profiles.id` has a hard FK to `auth.users(id)`, so there is no way to
 * have a live, map-visible profile without a real auth user behind it.
 * This route creates that auth user via the Admin Auth API (service_role),
 * which fires the existing `handle_new_user` trigger to seed a base
 * `profiles` row, then fills in the Contributor fields on it directly
 * (service_role bypasses RLS — this is an admin-privileged write, not a
 * self-serve one, so it does not go through `contributor_applications` or
 * the admin review step). Best-effort rollback: if the
 * profile fill-in fails after the auth user was created, the auth user is
 * deleted so no orphaned account is left behind. Every field is validated
 * (shared rules: `@/lib/contributorFields`) BEFORE the auth user is created.
 *
 * Verify-first (C10, migration 196): the listing is live at once but is never attached to anybody until the
 * owner has signed in with the address and confirmed. If the address has no account, the new auth user holds it
 * and the owner confirms the listing is theirs; if the address already has an account (a plain Citizen), the
 * new auth user gets an alias address that is never mailed and the owner is asked to attach the listing to
 * their own account. Either way a listing_claims row records the request (one reminder goes out at 7 days).
 * The response carries `ownerHasAccount` and `awaitingOwner: true` so the success panel can say so.
 *
 * Welcome email (founder decision D-13): unless the admin unticks "Email the
 * owner" (`email_owner: false`; on by default), Connect itself mails the owner
 * the sign-in steps from no-reply@citizenscentral.co.za, with the admin's notify
 * address as Reply-To. It is sent only AFTER the listing exists, and it is
 * fail-soft: a mail problem never fails the create. The response carries
 * `email: "sent" | "failed" | "skipped"` ("skipped" = not requested, or no
 * sending key / usable address) so the success panel can say what happened.
 * It also carries `onMap`: whether the new listing has a map pin (hasMapPin), so
 * neither the owner's email nor the admin's toast promises the map to an
 * online-only Contributor (tracker C21).
 *
 * Body: { display_name, claim_email, contributor_kind?, contributor_category,
 *   bio?, website_url?, contact_email?, instagram_handle?, facebook_url?,
 *   tiktok_handle?, youtube_url?, x_handle?, linkedin_url?, whatsapp_number?,
 *   no_fixed_location?, physical_address?, physical_latitude?,
 *   physical_longitude?, logo_url?, gallery_urls?, cover_photo_urls?, email_owner? }
 *
 * Contact email, X, LinkedIn, WhatsApp and the cover are columns the listing
 * already has, and parseListingFields already checks the first four. The
 * create RPC (migration 170) still has no arguments for them, so once it
 * succeeds this route writes just those columns through the admin's own
 * session. "Admins can update any profile" allows it, and is_admin() passes
 * the server-column guard. A failed write deletes the new auth user, the
 * same rollback as a failed RPC, so a listing is never left half-filled.
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { createListingUser, pendingListingMessage, registerListingClaim } from "@/lib/listingClaim";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { coercePublicUrl, normalisePublicUrl } from "@/lib/publicUrl";
import { MAX_URL, hasMapPin, parseListingFields, trimOrNull } from "@/lib/contributorFields";
import { adminNotifyEmail, sendEmail, type EmailOutcome } from "@/lib/email/send";
import { siteBase } from "@/lib/siteUrl";
import { ownerWelcomeEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GALLERY_URLS = 6;

type CoverPhoto = { url: string; caption: null };

/**
 * One cover, the shape profiles.cover_photo_urls already stores.
 * Empty means none. Anything that is not a single http(s) image link is refused.
 */
function oneCover(value: unknown): CoverPhoto[] | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 1) return "invalid";
  if (value.length === 0) return null;
  const item = value[0];
  const raw =
    typeof item === "string"
      ? item
      : item && typeof item === "object"
        ? (item as { url?: unknown }).url
        : null;
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return null;
  const url = normalisePublicUrl(raw, MAX_URL);
  if (!url) return "invalid";
  return [{ url, caption: null }];
}

export async function POST(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(`admin-create-contributor:${guard.user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseListingFields(payload);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const fields = parsed.fields;

  // Admin-only extras. The logo is rendered as an <img> and a link target,
  // so it must be a real http(s) URL (a stored `javascript:` is stored XSS).
  const rawLogo = trimOrNull(payload.logo_url, MAX_URL);
  const logoUrl = rawLogo === null ? null : coercePublicUrl(rawLogo, MAX_URL);
  if (rawLogo !== null && logoUrl === null) {
    return NextResponse.json({ error: "invalid_logo_url" }, { status: 400 });
  }

  let galleryUrls: string[] = [];
  if (Array.isArray(payload.gallery_urls)) {
    galleryUrls = payload.gallery_urls
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
      .slice(0, MAX_GALLERY_URLS);
  }

  const covers = oneCover(payload.cover_photo_urls);
  if (covers === "invalid") {
    return NextResponse.json({ error: "invalid_cover_url" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Create the auth user this listing will live under (a placeholder: no password, no OAuth identity, only
  //    ever usable by its owner once they have confirmed). If the address already has an account the user gets
  //    an alias address instead. Only the service_role client can call the Admin Auth API.
  const origin = siteBase(request);
  const listingUser = await createListingUser(admin, {
    claimEmail: fields.claimEmail,
    userMetadata: { full_name: fields.displayName, created_by_admin: true },
    origin,
  });
  if (!listingUser.ok) {
    return NextResponse.json(
      { error: listingUser.error, ...(listingUser.message ? { message: listingUser.message } : {}) },
      { status: listingUser.status },
    );
  }
  const { userId: newUserId, ownerHasAccount } = listingUser;

  // 2. Fill in the Contributor fields via the admin_create_contributor_profile
  //    RPC, called through the ADMIN'S OWN session (`supabase`, resolved
  //    above by getRouteAuth) — NOT the service_role client. profiles has a
  //    protect_role_column trigger whose only non-self-row bypass is
  //    `is_admin()`, which resolves auth.uid() from the calling connection;
  //    service_role has no auth.uid(), so a raw service_role UPDATE here
  //    would be rejected by that trigger. Calling the RPC as the admin's own
  //    authenticated user is what makes the bypass fire correctly.
  const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_create_contributor_profile", {
    _target_id: newUserId,
    _display_name: fields.displayName,
    _claim_email: fields.claimEmail,
    _contributor_kind: fields.kind,
    _contributor_category: fields.category,
    _bio: fields.bio,
    _website_url: fields.websiteUrl,
    _instagram_handle: fields.socials.instagram_handle,
    _facebook_url: fields.socials.facebook_url,
    _tiktok_handle: fields.socials.tiktok_handle,
    _youtube_url: fields.socials.youtube_url,
    _no_fixed_location: fields.noFixedLocation,
    _physical_address: fields.physicalAddress,
    _physical_latitude: fields.latitude,
    _physical_longitude: fields.longitude,
    _logo_url: logoUrl,
    _gallery_urls: galleryUrls,
  });

  const result = rpcData as { success?: boolean; reason?: string; slug?: string } | null;
  if (rpcErr || !result?.success) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    console.error("[/api/admin/contributors/create] profile rpc", rpcErr, result);
    return NextResponse.json(
      { error: result?.reason ?? "create_failed" },
      { status: result?.reason === "not_admin" ? 403 : 500 },
    );
  }

  // Columns migration 170's RPC does not take. Written as the admin, and only
  // when there is something to store, so a create that leaves them blank
  // stays a single RPC call.
  const extras: Record<string, unknown> = {};
  if (fields.contactEmail) extras.contributor_contact_email = fields.contactEmail;
  if (fields.socials.x_handle) extras.x_handle = fields.socials.x_handle;
  if (fields.socials.linkedin_url) extras.linkedin_url = fields.socials.linkedin_url;
  if (fields.socials.whatsapp_number) extras.whatsapp_number = fields.socials.whatsapp_number;
  if (covers) extras.cover_photo_urls = covers;
  if (Object.keys(extras).length > 0) {
    const { data: updated, error: updateErr } = await supabase
      .from("profiles")
      .update(extras)
      .eq("id", newUserId)
      .select("id")
      .maybeSingle();
    if (updateErr || !updated || updated.id !== newUserId) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      console.error("[/api/admin/contributors/create] listing extras", updateErr);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
  }

  // The ledger row: from here the owner is asked to confirm. A second open request for the same address is
  // refused by the database; roll this one back and say which listing is already waiting.
  const claim = await registerListingClaim(admin, {
    placeholderId: newUserId,
    slug: result.slug ?? "",
    claimEmail: fields.claimEmail,
    source: "admin_create",
  });
  if (!claim.ok) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    if (claim.reason === "duplicate") {
      return NextResponse.json(
        { error: "listing_pending", message: pendingListingMessage(fields.claimEmail, claim.existingSlug, origin) },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "contributor_created",
    targetType: "profile",
    targetId: newUserId,
    metadata: { display_name: fields.displayName, claim_email: fields.claimEmail },
  });

  // The listing exists. Welcome the owner (on unless the admin unticked it).
  // Not rate-limited separately: only an admin reaches this route, which has its
  // own mutation limit, and there is deliberately no "resend" button.
  // Whether the listing has a map pin (the one rule: hasMapPin). The owner's email and the admin's screen say
  // "on the map" only when this is true (tracker C21).
  const onMap = hasMapPin({ no_fixed_location: fields.noFixedLocation, physical_latitude: fields.latitude, physical_longitude: fields.longitude });
  let email: EmailOutcome = "skipped";
  if (payload.email_owner !== false) {
    email = await sendEmail({
      to: fields.claimEmail,
      replyTo: adminNotifyEmail(),
      ...ownerWelcomeEmail({
        name: fields.displayName,
        ownerEmail: fields.claimEmail,
        listingUrl: result.slug ? `${origin}/c/${encodeURIComponent(result.slug)}` : origin,
        signInUrl: `${origin}/dashboard`,
        onMap,
        hasAccount: ownerHasAccount,
      }),
    });
  }

  return NextResponse.json({
    success: true,
    contributor_id: newUserId,
    slug: result.slug,
    claim_email: fields.claimEmail,
    onMap,
    email,
    ownerHasAccount,
    awaitingOwner: true,
  });
}
