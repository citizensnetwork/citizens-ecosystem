/**
 * POST /api/contributor/claim/decline
 *
 * "Not me" (C10, migration 196). The person who signed in says the listing made for their address is not theirs.
 * The SECURITY DEFINER function `decline_listing_claim()` hides the placeholder listing at once and records the
 * refusal on the ledger (the Sheet then shows "Owner declined"); nothing on the caller's own account changes. This
 * route then tells the admin by email, fail-soft: a mail problem never undoes the refusal.
 *
 * Bearer-only like Confirm (a cookie session alone is refused: no cross-site request can answer for the person).
 * No body and no id: like Confirm, the match is the caller's own verified email, so there is nothing to forge.
 */

import { getRouteAuth, hasBearerToken } from "@/lib/supabase/route";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { adminNotifyEmail, sendEmail, siteOrigin } from "@/lib/email/send";
import { listingDeclinedAdminEmail } from "@/lib/email/listingClaimTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_FOR_REASON: Record<string, number> = {
  nothing_to_decline: 404,
  email_not_verified: 403,
  not_authenticated: 401,
};

export async function POST(request: Request) {
  if (!hasBearerToken(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`contrib-claim-decline:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  const { data, error } = await supabase.rpc("decline_listing_claim");
  if (error) {
    console.error("[/api/contributor/claim/decline] rpc", error);
    return NextResponse.json({ error: "decline_failed" }, { status: 500 });
  }

  const result = data as { success?: boolean; reason?: string; name?: string; slug?: string } | null;
  if (!result?.success) {
    const reason = result?.reason ?? "decline_failed";
    return NextResponse.json({ error: reason }, { status: STATUS_FOR_REASON[reason] ?? 409 });
  }

  const to = adminNotifyEmail();
  if (to) {
    await sendEmail({
      to,
      ...listingDeclinedAdminEmail({
        name: result.name || "A listing",
        slug: result.slug ?? null,
        siteUrl: siteOrigin(request),
      }),
    });
  }

  return NextResponse.json({ success: true });
}
