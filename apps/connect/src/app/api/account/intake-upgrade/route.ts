/**
 * POST /api/account/intake-upgrade
 *
 * The signed-in half of an intake upgrade (issue #248). The email link only
 * opens the screen. This route is what changes anything, and only for the
 * account the link was sent to.
 *
 * Body: { token: 64 hex chars, action: "preview" | "confirm" | "decline" }
 * Auth: getRouteAuth (Bearer or cookie). The database checks auth.uid().
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { hasMapPin } from "@/lib/contributorFields";
import { hashUpgradeToken, UPGRADE_TOKEN_RE } from "@/lib/intake/upgradeToken";
import { sendOwnerWelcome, settleFlaggedUpgrade } from "@/lib/intake/upgradeSideEffects";
import { siteBase } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpgradeRow = {
  success?: boolean;
  reason?: string;
  status?: string;
  request_id?: string;
  display_name?: string;
  contributor_kind?: string | null;
  contributor_category?: string | null;
  bio?: string | null;
  no_fixed_location?: boolean;
  physical_address?: string | null;
  physical_latitude?: number | null;
  physical_longitude?: number | null;
  expires_at?: string;
  listing_slug?: string | null;
  slug?: string;
  notify_admin?: boolean;
  logo_storage_path?: string | null;
  cover_storage_path?: string | null;
};

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

function publicPreview(row: UpgradeRow) {
  return {
    status: "pending" as const,
    display_name: row.display_name ?? "",
    contributor_kind: row.contributor_kind ?? null,
    contributor_category: row.contributor_category ?? null,
    bio: row.bio ?? null,
    no_fixed_location: row.no_fixed_location === true,
    physical_address: row.physical_address ?? null,
    expires_at: row.expires_at ?? null,
  };
}

export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return fail(401, "unauthorized");

  const rl = await checkRateLimit(`intake-upgrade:${user.id}`, RATE_LIMITS.auth);
  if (!rl.success) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "invalid_json");
  }

  const token = typeof body.token === "string" ? body.token.trim().toLowerCase() : "";
  const action = body.action;
  if (!UPGRADE_TOKEN_RE.test(token) || (action !== "preview" && action !== "confirm" && action !== "decline")) {
    return fail(400, "invalid_input");
  }

  const fn = action === "preview" ? "preview_intake_upgrade" : action === "confirm" ? "confirm_intake_upgrade" : "decline_intake_upgrade";
  const { data, error } = await supabase.rpc(fn, { _token_hash: hashUpgradeToken(token) });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("not_eligible")) return fail(409, "not_eligible");
    console.error("[/api/account/intake-upgrade]", action, error.code ?? "error");
    return fail(500, "upgrade_failed");
  }

  const row = (data ?? {}) as UpgradeRow;
  const admin = () => createAdminClient();

  if (row.reason === "expired") {
    await settleFlaggedUpgrade(admin(), row, "expired");
    return fail(410, "expired");
  }
  if (row.reason === "wrong_account") return fail(403, "wrong_account");
  if (row.reason === "not_found" || row.reason === "not_authenticated") return fail(404, "not_found");
  if (row.reason === "not_eligible") return fail(409, "not_eligible");
  if (row.reason === "declined") return fail(409, "declined");
  if (row.reason === "confirmed") {
    return NextResponse.json({
      status: "confirmed",
      slug: row.listing_slug ?? null,
      url: row.listing_slug ? `${siteBase(request)}/c/${row.listing_slug}` : null,
    });
  }

  if (action === "preview" && row.success && row.status === "pending") {
    return NextResponse.json(publicPreview(row));
  }

  if (action === "decline" && row.success && row.status === "declined") {
    await settleFlaggedUpgrade(admin(), row, "declined");
    return NextResponse.json({ status: "declined" });
  }

  if (action === "confirm" && row.success && row.slug) {
    const onMap = hasMapPin({
      no_fixed_location: row.no_fixed_location === true,
      physical_latitude: row.physical_latitude,
      physical_longitude: row.physical_longitude,
    });
    const email = await sendOwnerWelcome({
      to: user.email,
      name: row.display_name || "Your listing",
      slug: row.slug,
      onMap,
      request,
    });
    const origin = siteBase(request);
    return NextResponse.json({
      status: "confirmed",
      slug: row.slug,
      url: `${origin}/c/${row.slug}`,
      on_map: onMap,
      email,
    });
  }

  console.error("[/api/account/intake-upgrade] unexpected", action, row.reason ?? row.status ?? "empty");
  return fail(500, "upgrade_failed");
}
