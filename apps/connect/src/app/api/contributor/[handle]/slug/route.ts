import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { recordContributorMutation } from "@/lib/dashboard/activity";

/**
 * Stage K — Contributor handle (slug) change.
 *
 * PATCH /api/contributor/[handle]/slug
 *   Body: { new_slug: string, reason?: string }
 *
 * Authorisation modes:
 *   - Owner: must satisfy `checkDashboardAccess`. 30-day cooldown enforced
 *     server-side via `profiles.handle_changed_at`. Hard cap: 1 change
 *     per 30 days, no exceptions on this path.
 *   - Admin-with-grant: bypasses the cooldown. Routes through the
 *     `admin_change_contributor_slug` SECURITY DEFINER RPC which performs
 *     the role re-check inside Postgres and writes both `admin_actions`
 *     and `activity_log` rows. `reason` is required for the admin path.
 *
 * Slug format: `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$` — 2..40 chars,
 * lowercase alnum + hyphens, no leading/trailing hyphen. Same rule the
 * RPC enforces in Postgres so a compromised admin session cannot inject
 * arbitrary strings via SECURITY DEFINER.
 *
 * Uniqueness: `profiles_contributor_slug_key` partial unique index
 * (migration 036) collapses races into a 23505 the API translates to 409.
 *
 * Per A62: no legacy-handle redirect. Old handles stop resolving the
 * instant the write commits.
 */

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const COOLDOWN_DAYS = 30;
const REASON_MAX = 500;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`slug-change:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const newSlugRaw =
    typeof raw.new_slug === "string" ? raw.new_slug.trim().toLowerCase() : "";
  const reasonRaw =
    typeof raw.reason === "string"
      ? raw.reason.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, REASON_MAX)
      : "";

  if (!SLUG_RE.test(newSlugRaw)) {
    return NextResponse.json(
      {
        error:
          "Handle must be 2–40 lowercase letters, numbers, or hyphens. No leading/trailing hyphen.",
      },
      { status: 400 },
    );
  }

  if (newSlugRaw === handle) {
    return NextResponse.json(
      { error: "New handle is the same as the current handle." },
      { status: 400 },
    );
  }

  // ── Admin-with-grant path — route through SECURITY DEFINER RPC.
  if (access.isAdminWithAccess && !access.isOwner) {
    if (!reasonRaw) {
      return NextResponse.json(
        { error: "Reason is required for admin overrides." },
        { status: 400 },
      );
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "admin_change_contributor_slug",
      {
        p_contributor_id: access.contributorId,
        p_new_slug: newSlugRaw,
        p_reason: reasonRaw,
      },
    );

    if (rpcError) {
      const code = rpcError.code;
      // 23505 = unique_violation (slug already taken)
      if (code === "23505") {
        return NextResponse.json(
          { error: "That handle is already taken." },
          { status: 409 },
        );
      }
      // 42501 = admin role missing / not authenticated
      if (code === "42501") {
        return NextResponse.json(
          { error: "Admin authorisation required." },
          { status: 403 },
        );
      }
      // 22023 = invalid slug format (server-side double-check)
      if (code === "22023") {
        return NextResponse.json(
          { error: rpcError.message ?? "Invalid slug." },
          { status: 400 },
        );
      }
      console.error("[API slug PATCH admin]", rpcError);
      return NextResponse.json(
        { error: "Failed to change handle." },
        { status: 500 },
      );
    }

    return NextResponse.json({ slug: rpcData, admin_override: true });
  }

  // ── Owner path — enforce 30-day cooldown in the API.
  const { data: current, error: currentErr } = await supabase
    .from("profiles")
    .select("contributor_slug, handle_changed_at")
    .eq("id", access.contributorId)
    .maybeSingle<{ contributor_slug: string | null; handle_changed_at: string | null }>();

  if (currentErr || !current) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 },
    );
  }

  if (current.handle_changed_at) {
    const lastChanged = new Date(current.handle_changed_at).getTime();
    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - lastChanged;
    if (elapsed < cooldownMs) {
      const remainingDays = Math.ceil((cooldownMs - elapsed) / (24 * 60 * 60 * 1000));
      return NextResponse.json(
        {
          error: `You can only change your handle once every ${COOLDOWN_DAYS} days. Try again in ${remainingDays} day${
            remainingDays === 1 ? "" : "s"
          }.`,
          retry_after_days: remainingDays,
        },
        { status: 429 },
      );
    }
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      contributor_slug: newSlugRaw,
      handle_changed_at: new Date().toISOString(),
    })
    .eq("id", access.contributorId);

  if (updateErr) {
    // 23505 / 23502 / Supabase-coded uniqueness collision
    if (
      updateErr.code === "23505" ||
      /duplicate key/i.test(updateErr.message ?? "")
    ) {
      return NextResponse.json(
        { error: "That handle is already taken." },
        { status: 409 },
      );
    }
    console.error("[API slug PATCH owner]", updateErr);
    return NextResponse.json(
      { error: "Failed to change handle." },
      { status: 500 },
    );
  }

  await recordContributorMutation(supabase, {
    handle: newSlugRaw,
    access,
    actorId: user.id,
    action: "contributor_slug_changed",
    entityType: "profiles",
    entityId: access.contributorId,
    metadata: {
      old_slug: current.contributor_slug,
      new_slug: newSlugRaw,
    },
  });

  return NextResponse.json({ slug: newSlugRaw, admin_override: false });
}
