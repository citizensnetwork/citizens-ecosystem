/**
 * POST /api/contributor/apply
 *
 * Inserts a pending `contributor_applications` row for the caller.
 * RLS enforces `user_id = auth.uid()`, the unique-pending partial
 * index prevents duplicates, and the `protect_role_column` trigger
 * allows the follow-up `profiles.contributor_status` flip
 * (`not_applied → pending`, `rejected → pending`).
 *
 * NOTE: Admin notification is NOT fired from this route. Admins see
 * pending applications via the `/admin/applications` inbox (reads
 * `contributor_applications WHERE status = 'pending'`). Email-based
 * alerts are tracked as a separate concern (see
 * `.github/DECISIONS.md`) — if/when they return they should be wired
 * via a Supabase DB webhook on insert, not an inline Edge hop, so
 * route latency and user-visible success aren't coupled to an
 * external email provider.
 *
 * Historical context: this route previously proxied the entire
 * insert through the `submit-contributor-application` Edge Function.
 * Any deploy skew / missing secret surfaced to end users as
 * "Something went wrong" and left no DB row, so applications were
 * silently lost. Inserting directly here is the durability fix.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isApprovedContributor } from "@/lib/profiles/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DISPLAY_NAME = 120;
const MAX_BIO = 1_000;
const MAX_MOTIVATION = 2_000;
const MAX_URL = 500;
const MAX_ADDRESS = 300;
const MAX_HANDLE = 80;
const ALLOWED_KINDS = new Set(["ministry", "organization", "business"]);

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
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

  const insertRow = {
    user_id: user.id,
    status: "pending" as const,
    display_name: displayName,
    contributor_kind: contributorKind,
    bio: trimOrNull(payload.bio, MAX_BIO),
    website_url: trimOrNull(payload.website_url, MAX_URL),
    instagram_handle: trimOrNull(payload.instagram_handle, MAX_HANDLE),
    facebook_url: trimOrNull(payload.facebook_url, MAX_URL),
    tiktok_handle: trimOrNull(payload.tiktok_handle, MAX_HANDLE),
    youtube_url: trimOrNull(payload.youtube_url, MAX_URL),
    physical_address: trimOrNull(payload.physical_address, MAX_ADDRESS),
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

  // Flip profile status so UI banner appears. `protect_role_column`
  // allows not_applied → pending and rejected → pending. Non-fatal on
  // error — the insert already exists.
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ contributor_status: "pending" })
    .eq("id", user.id);
  if (profileErr) {
    console.error("[/api/contributor/apply] profile flip", profileErr);
  }

  // Admin notification is intentionally deferred (see top-of-file).
  // Pending applications are queryable via `/admin/applications`.

  return NextResponse.json({
    success: true,
    application_id: inserted.id,
  });
}
