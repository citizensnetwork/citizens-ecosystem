/**
 * POST /api/contributor/apply
 *
 * Self-serve "Become a Contributor" — and it WAITS for an admin (founder
 * decision D-12, migration 180). The route saves a `pending`
 * `contributor_applications` row, flips `profiles.contributor_status`
 * `not_applied | rejected → pending`, and emails the admin. Nothing of the
 * applicant's is public until an admin approves it in Admin → Applications
 * (`approve_contributor_application`, which also copies their staged profile
 * onto `profiles` and clears any `contributor_hidden` left by an earlier
 * removal).
 *
 * Writes are server-side on purpose. Migration 180 takes every client write
 * privilege away from `contributor_applications` (a signed-in user could
 * otherwise rewrite their own row after validation, and approval copies it
 * onto the public profile), so this route validates here and writes with the
 * service-role client — always scoped to the VERIFIED `user.id`, never to
 * anything the body says. The self-approve RPC from v1 no longer exists.
 *
 * Failure handling: the application insert and the profile flip are two
 * writes. If the flip fails the application is deleted again and the caller
 * gets a 500, so the person is never left "pending" in one table and
 * "not applied" in the other. The admin email is fail-soft: a mail problem
 * never fails an application that is already saved.
 *
 * Historical context: this route once proxied through the
 * `submit-contributor-application` Edge Function (never deployed, so
 * applications were silently lost); inserting directly is the durability fix.
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isApprovedContributor } from "@/lib/profiles/capabilities";
import { CONTRIBUTOR_TYPES, isContributorType } from "@/lib/categories";
import { coercePublicUrl, normaliseSocialValue } from "@/lib/publicUrl";
import { MAX_ADDRESS, MAX_BIO, MAX_DISPLAY_NAME, MAX_URL, trimOrNull } from "@/lib/contributorFields";
import { adminNotifyEmail, sendEmail, siteOrigin } from "@/lib/email/send";
import { newApplicationAdminEmail } from "@/lib/email/templates";
import { isContributorKind } from "@/types/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MOTIVATION = 2_000;

/** At most this many "new application" emails to the admin per hour, across all applicants. */
const ADMIN_NOTIFY_LIMIT = { limit: 20, windowMs: 3_600_000 } as const;

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate-limit per user — block abusive re-submits even if the unique
  // index would already stop duplicates (the index only fires after
  // the row reaches Postgres; rate-limit short-circuits earlier).
  const rl = await checkRateLimit(`contrib-apply:${user.id}`, RATE_LIMITS.heavy);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many attempts" },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() },
      },
    );
  }

  // Short-circuit already-approved contributors.
  const { data: me } = await supabase
    .from("profiles")
    .select("contributor_status, role")
    .eq("id", user.id)
    .maybeSingle();
  if (isApprovedContributor(me)) {
    return NextResponse.json(
      { error: "already_approved" },
      { status: 409 },
    );
  }

  // Duplicate-pending check up-front (cheaper than the DB unique index
  // path and gives a stable error shape). Reads stay on the caller's own
  // session: RLS lets them see their own applications.
  const { data: existing } = await supabase
    .from("contributor_applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "already_pending", application_id: existing.id },
      { status: 409 },
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
    return NextResponse.json(
      { error: "display_name_required" },
      { status: 400 },
    );
  }

  const contributorKind = isContributorKind(payload.contributor_kind)
    ? payload.contributor_kind
    : null;

  // The map/pin category — one of the 12 Contributor types (the wizard's
  // picker, window.DATA.CONTRIBUTOR_TYPES). Distinct from contributor_kind.
  const contributorCategory = isContributorType(payload.contributor_category)
    ? payload.contributor_category
    : null;

  // A Contributor with no fixed physical location (online-only, mobile, or
  // no permanent office) — force address/lat/lng to null regardless of what
  // was sent, so we never persist a stale/inconsistent pin for them. The RPC
  // that copies this row onto profiles on approval applies the same rule
  // defensively.
  const noFixedLocation = payload.no_fixed_location === true;

  // The website ends up rendered as a real link (profile page, and the
  // Kingdom Discovery card's Website button), so it must be http(s) — a
  // stored `javascript:` URL is stored XSS. The wizard's own placeholder is
  // "yourministry.org", so a scheme-less value is coerced rather than
  // rejected; only an explicitly dangerous scheme is refused.
  const website = trimOrNull(payload.website_url, MAX_URL);
  const websiteUrl = website === null ? null : coercePublicUrl(website, MAX_URL);
  if (website !== null && websiteUrl === null) {
    return NextResponse.json(
      { error: "Website must be a valid web address (for example yourministry.org)." },
      { status: 400 },
    );
  }

  // A social value may be a handle OR a link, whatever the column is called —
  // same rule as /api/contributor/profile (normaliseSocialValue): a dangerous
  // scheme is refused, a URL-shaped value is normalised, and a plain handle is
  // kept verbatim for the display layer to turn into a platform URL.
  //
  // This wizard asks for four socials. The rest (X / LinkedIn / WhatsApp, the
  // logo, cover photos and public contact email) are staged afterwards from the
  // pending Dashboard through PATCH /api/contributor/application.
  const socialUrls: Record<string, string | null> = {};
  for (const [key, label] of [
    ["instagram_handle", "Instagram"],
    ["facebook_url", "Facebook"],
    ["tiktok_handle", "TikTok"],
    ["youtube_url", "YouTube"],
  ] as const) {
    const norm = normaliseSocialValue(payload[key], MAX_URL);
    if (norm === undefined) {
      return NextResponse.json(
        { error: `${label} must be a handle or a valid web address.` },
        { status: 400 },
      );
    }
    socialUrls[key] = norm;
  }

  const physicalAddress = noFixedLocation ? null : trimOrNull(payload.physical_address, MAX_ADDRESS);
  const insertRow = {
    user_id: user.id,
    status: "pending" as const,
    display_name: displayName,
    contributor_kind: contributorKind,
    contributor_category: contributorCategory,
    bio: trimOrNull(payload.bio, MAX_BIO),
    website_url: websiteUrl,
    instagram_handle: socialUrls.instagram_handle,
    facebook_url: socialUrls.facebook_url,
    tiktok_handle: socialUrls.tiktok_handle,
    youtube_url: socialUrls.youtube_url,
    no_fixed_location: noFixedLocation,
    physical_address: physicalAddress,
    physical_latitude: noFixedLocation ? null : finiteOrNull(payload.physical_latitude),
    physical_longitude: noFixedLocation ? null : finiteOrNull(payload.physical_longitude),
    motivation_text: trimOrNull(payload.motivation_text, MAX_MOTIVATION),
  };

  // Everything below writes as the server, scoped to the verified user.id.
  const admin = createAdminClient();

  const { data: inserted, error: insertErr } = await admin
    .from("contributor_applications")
    .insert(insertRow)
    .select("id")
    .single();

  if (insertErr) {
    // 23505 = unique_violation (pending already exists — race with the
    // pre-flight check above).
    const code = (insertErr as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json(
        { error: "already_pending" },
        { status: 409 },
      );
    }
    console.error("[/api/contributor/apply] insert", insertErr);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  // Flip the profile to `pending` (this is what puts them on the pending
  // Dashboard). Only from the two states an applicant may apply from; a profile
  // that is already `pending` simply matches nothing. If it fails, take the
  // application back out so the two tables never disagree.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ contributor_status: "pending" })
    .eq("id", user.id)
    .in("contributor_status", ["not_applied", "rejected"]);
  if (profileErr) {
    console.error("[/api/contributor/apply] profile flip", profileErr);
    const { error: rollbackErr } = await admin
      .from("contributor_applications")
      .delete()
      .eq("id", inserted.id)
      .eq("user_id", user.id);
    if (rollbackErr) {
      console.error("[/api/contributor/apply] rollback of the application failed", rollbackErr);
    }
    return NextResponse.json({ error: "apply_failed" }, { status: 500 });
  }

  // Tell the admin. Fail-soft: the application is already saved. The notices
  // share one global cap so a flood of throwaway sign-ups (anyone can create an
  // account with an emailed code) cannot mail-bomb the admin's inbox or burn the
  // sending quota; past the cap the application still shows up in Admin →
  // Applications, it just isn't announced by email.
  const adminTo = adminNotifyEmail();
  const notifyBudget = adminTo ? await checkRateLimit("contrib-apply-admin-notify", ADMIN_NOTIFY_LIMIT) : null;
  if (adminTo && notifyBudget && !notifyBudget.success) {
    console.warn("[/api/contributor/apply] admin notification cap reached; the admin was not emailed");
  } else if (adminTo) {
    const categoryLabel = contributorCategory
      ? (CONTRIBUTOR_TYPES.find((t) => t.value === contributorCategory)?.label ?? null)
      : null;
    await sendEmail({
      to: adminTo,
      ...newApplicationAdminEmail({
        name: displayName,
        categoryLabel,
        area: physicalAddress,
        siteUrl: siteOrigin(request),
      }),
    });
  } else {
    console.warn("[/api/contributor/apply] ADMIN_NOTIFY_EMAIL is not set; the admin was not emailed");
  }

  return NextResponse.json({
    success: true,
    application_id: inserted.id,
    status: "pending",
    approved: false,
    slug: null,
  });
}
