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
 * Body: { display_name, claim_email, contributor_kind?, contributor_category,
 *   bio?, website_url?, instagram_handle?, facebook_url?, tiktok_handle?,
 *   youtube_url?, no_fixed_location?, physical_address?, physical_latitude?,
 *   physical_longitude?, logo_url?, gallery_urls? }
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { coercePublicUrl } from "@/lib/publicUrl";
import { MAX_URL, parseListingFields, trimOrNull } from "@/lib/contributorFields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GALLERY_URLS = 6;

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

  const admin = createAdminClient();

  // 1. Create the real auth user this listing will live under (unconfirmed
  //    password/no OAuth identity attached — only usable via claim). Only
  //    the service_role client can call the Admin Auth API.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: fields.claimEmail,
    email_confirm: true,
    user_metadata: { full_name: fields.displayName, created_by_admin: true },
  });
  if (createErr || !created?.user) {
    const alreadyExists = createErr?.message?.toLowerCase().includes("already been registered");
    return NextResponse.json(
      { error: alreadyExists ? "email_already_registered" : "create_user_failed" },
      { status: alreadyExists ? 409 : 500 },
    );
  }
  const newUserId = created.user.id;

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

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "contributor_created",
    targetType: "profile",
    targetId: newUserId,
    metadata: { display_name: fields.displayName, claim_email: fields.claimEmail },
  });

  return NextResponse.json({
    success: true,
    contributor_id: newUserId,
    slug: result.slug,
    claim_email: fields.claimEmail,
  });
}
