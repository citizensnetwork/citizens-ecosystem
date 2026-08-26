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
 * `self_approve_contributor_application`). Best-effort rollback: if the
 * profile fill-in fails after the auth user was created, the auth user is
 * deleted so no orphaned account is left behind.
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
import { EVENT_CATEGORIES, PLACE_CATEGORIES } from "@/lib/categories";
import { coercePublicUrl, hasUnsafeScheme } from "@/lib/publicUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DISPLAY_NAME = 120;
const MAX_BIO = 1_000;
const MAX_URL = 500;
const MAX_ADDRESS = 300;
const MAX_HANDLE = 80;
const ALLOWED_KINDS = new Set(["ministry", "organization", "business"]);
const ALLOWED_CATEGORIES = new Set<string>([
  ...EVENT_CATEGORIES.map((c) => c.value),
  ...PLACE_CATEGORIES.map((c) => c.value),
]);
const MAX_GALLERY_URLS = 6;
const MAX_EMAIL = 254;
// Bounded quantifiers (not `+`) so this can't be driven into polynomial
// backtracking on attacker-shaped input — the state space is capped by the
// bounds themselves, not by input length. Length is also checked BEFORE
// this regex ever runs (see below), as defense in depth.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{1,24}$/;

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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

  const displayName = trimOrNull(payload.display_name, MAX_DISPLAY_NAME);
  if (!displayName || displayName.length < 2) {
    return NextResponse.json({ error: "display_name_required" }, { status: 400 });
  }

  const claimEmail = typeof payload.claim_email === "string" ? payload.claim_email.trim().toLowerCase() : "";
  // Length checked BEFORE the regex ever runs — never hand an unbounded
  // string to a pattern-match, even a ReDoS-safe one.
  if (!claimEmail || claimEmail.length > MAX_EMAIL || !EMAIL_RE.test(claimEmail)) {
    return NextResponse.json({ error: "valid_claim_email_required" }, { status: 400 });
  }

  const rawKind = typeof payload.contributor_kind === "string" ? payload.contributor_kind : "";
  const contributorKind = ALLOWED_KINDS.has(rawKind)
    ? (rawKind as "ministry" | "organization" | "business")
    : null;

  const rawCategory = typeof payload.contributor_category === "string" ? payload.contributor_category : "";
  const contributorCategory = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : null;
  if (!contributorCategory) {
    return NextResponse.json({ error: "contributor_category_required" }, { status: 400 });
  }

  const noFixedLocation = payload.no_fixed_location === true;

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
    email: claimEmail,
    email_confirm: true,
    user_metadata: { full_name: displayName, created_by_admin: true },
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
  // Same rule as the self-serve apply route — an admin-created listing is
  // rendered through the exact same public surfaces. Real URLs are coerced to
  // http(s); social handles only have to not declare a dangerous scheme.
  const adminLinks: Record<string, string | null> = {};
  for (const key of ["website_url", "logo_url"] as const) {
    const raw = trimOrNull(payload[key], MAX_URL);
    const norm = raw === null ? null : coercePublicUrl(raw, MAX_URL);
    if (raw !== null && norm === null) {
      return NextResponse.json(
        { error: `${key} must be a valid http(s) URL` },
        { status: 400 },
      );
    }
    adminLinks[key] = norm;
  }
  for (const key of ["facebook_url", "youtube_url"] as const) {
    const raw = trimOrNull(payload[key], MAX_URL);
    if (raw !== null && hasUnsafeScheme(raw)) {
      return NextResponse.json(
        { error: `${key} must be a valid http(s) URL` },
        { status: 400 },
      );
    }
    adminLinks[key] = raw;
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_create_contributor_profile", {
    _target_id: newUserId,
    _display_name: displayName,
    _claim_email: claimEmail,
    _contributor_kind: contributorKind,
    _contributor_category: contributorCategory,
    _bio: trimOrNull(payload.bio, MAX_BIO),
    _website_url: adminLinks.website_url,
    _instagram_handle: trimOrNull(payload.instagram_handle, MAX_HANDLE),
    _facebook_url: adminLinks.facebook_url,
    _tiktok_handle: trimOrNull(payload.tiktok_handle, MAX_HANDLE),
    _youtube_url: adminLinks.youtube_url,
    _no_fixed_location: noFixedLocation,
    _physical_address: noFixedLocation ? null : trimOrNull(payload.physical_address, MAX_ADDRESS),
    _physical_latitude: noFixedLocation ? null : finiteOrNull(payload.physical_latitude),
    _physical_longitude: noFixedLocation ? null : finiteOrNull(payload.physical_longitude),
    _logo_url: adminLinks.logo_url,
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
    metadata: { display_name: displayName, claim_email: claimEmail },
  });

  return NextResponse.json({
    success: true,
    contributor_id: newUserId,
    slug: result.slug,
    claim_email: claimEmail,
  });
}
