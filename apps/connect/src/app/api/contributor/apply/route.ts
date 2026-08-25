/**
 * POST /api/contributor/apply
 *
 * Inserts a pending `contributor_applications` row for the caller, then
 * — as of Connect v1's self-serve go-live (migration 164,
 * V1_SCOPE.md) — immediately calls `self_approve_contributor_application`
 * so the Contributor is live on submit, no admin wait. RLS enforces
 * `user_id = auth.uid()`, the unique-pending partial index prevents
 * duplicates, and the `protect_role_column` trigger allows the exact two
 * transitions this route drives in sequence: `not_applied → pending`
 * (the flip below) then `pending → approved` (inside the RPC).
 *
 * NOTE: Admin notification is NOT fired from this route — there is no
 * admin gate to notify for in v1. The application row still exists as an
 * audit trail (`reviewer_id` = the applicant themselves on self-approval,
 * distinguishing it from an admin-reviewed row) and admins retain
 * `set_contributor_hidden` as the moderation safety net.
 *
 * Historical context: this route previously proxied the entire
 * insert through the `submit-contributor-application` Edge Function.
 * Any deploy skew / missing secret surfaced to end users as
 * "Something went wrong" and left no DB row, so applications were
 * silently lost. Inserting directly here is the durability fix.
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isApprovedContributor } from "@/lib/profiles/capabilities";
import { EVENT_CATEGORIES, PLACE_CATEGORIES } from "@/lib/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DISPLAY_NAME = 120;
const MAX_BIO = 1_000;
const MAX_MOTIVATION = 2_000;
const MAX_URL = 500;
const MAX_ADDRESS = 300;
const MAX_HANDLE = 80;
const ALLOWED_KINDS = new Set(["ministry", "organization", "business"]);
// The map/pin category — same slug space list.jsx's category picker and
// map.jsx's window.DATA.getCategory() use (EVENT_CATEGORIES ∪
// PLACE_CATEGORIES). Distinct from contributor_kind above.
const ALLOWED_CATEGORIES = new Set<string>([
  ...EVENT_CATEGORIES.map((c) => c.value),
  ...PLACE_CATEGORIES.map((c) => c.value),
]);

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

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
  // path and gives a stable error shape).
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

  const rawKind =
    typeof payload.contributor_kind === "string"
      ? payload.contributor_kind
      : "";
  const contributorKind = ALLOWED_KINDS.has(rawKind)
    ? (rawKind as "ministry" | "organization" | "business")
    : null;

  const rawCategory =
    typeof payload.contributor_category === "string"
      ? payload.contributor_category
      : "";
  const contributorCategory = ALLOWED_CATEGORIES.has(rawCategory)
    ? rawCategory
    : null;

  // A Contributor with no fixed physical location (online-only, mobile, or
  // no permanent office) — force address/lat/lng to null regardless of what
  // was sent, so we never persist a stale/inconsistent pin for them. The RPC
  // that copies this row onto profiles on approval applies the same rule
  // defensively.
  const noFixedLocation = payload.no_fixed_location === true;

  const insertRow = {
    user_id: user.id,
    status: "pending" as const,
    display_name: displayName,
    contributor_kind: contributorKind,
    contributor_category: contributorCategory,
    bio: trimOrNull(payload.bio, MAX_BIO),
    website_url: trimOrNull(payload.website_url, MAX_URL),
    instagram_handle: trimOrNull(payload.instagram_handle, MAX_HANDLE),
    facebook_url: trimOrNull(payload.facebook_url, MAX_URL),
    tiktok_handle: trimOrNull(payload.tiktok_handle, MAX_HANDLE),
    youtube_url: trimOrNull(payload.youtube_url, MAX_URL),
    no_fixed_location: noFixedLocation,
    physical_address: noFixedLocation ? null : trimOrNull(payload.physical_address, MAX_ADDRESS),
    physical_latitude: noFixedLocation ? null : finiteOrNull(payload.physical_latitude),
    physical_longitude: noFixedLocation ? null : finiteOrNull(payload.physical_longitude),
    motivation_text: trimOrNull(payload.motivation_text, MAX_MOTIVATION),
  };

  const { data: inserted, error: insertErr } = await supabase
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

  // Flip profile status so the trigger's not_applied → pending transition
  // is satisfied before we call the pending → approved RPC below.
  // Non-fatal on error the OLD way is no longer safe here — v1 depends on
  // this succeeding for self-approval to be reachable — but the trigger
  // itself is the actual gate, so a failure here means self-approve will
  // cleanly no-op (not_found_or_not_pending) rather than corrupt state.
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ contributor_status: "pending" })
    .eq("id", user.id);
  if (profileErr) {
    console.error("[/api/contributor/apply] profile flip", profileErr);
  }

  // v1 self-serve go-live: approve the caller's own application
  // immediately — no admin review. self_approve_contributor_application
  // is SECURITY DEFINER but internally re-checks auth.uid() === the
  // application's user_id, so this is exactly as safe as the client
  // calling the RPC directly would be.
  const { data: approveResult, error: approveErr } = await supabase.rpc(
    "self_approve_contributor_application",
    { _application_id: inserted.id },
  );
  if (approveErr) {
    console.error("[/api/contributor/apply] self-approve RPC", approveErr);
  }
  const approved =
    !approveErr &&
    !!approveResult &&
    (approveResult as { success?: boolean }).success === true;
  const slug = approved
    ? (approveResult as { slug?: string }).slug ?? null
    : null;

  return NextResponse.json({
    success: true,
    application_id: inserted.id,
    approved,
    slug,
  });
}
