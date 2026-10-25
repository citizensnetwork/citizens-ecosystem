/**
 * /api/contributor/claim — the owner's side of the verify-first listing claim (C10, migration 196).
 *
 *   GET   what is waiting for the person who is signed in right now (read-only, nothing changes)
 *   POST  CONFIRM: the owner said yes. Attaches the listing to their own account, or, when they signed in AS the
 *         listing's placeholder account, records that the listing is theirs.
 *
 * "Not me" is POST /api/contributor/claim/decline.
 *
 * Nothing is attached by merely signing in or by calling GET: the sign-in bootstrap only ASKS (GET) and the
 * confirm screen is the only thing that calls POST. There is no body and no id: the match is entirely server-side
 * against the caller's own VERIFIED email (the SECURITY DEFINER functions refuse an unverified address), so there is
 * nothing for a client to forge or enumerate.
 *
 * The POST tries "self" first and "attach" second. A person can be in only one of the two states (an account that is
 * itself a listing placeholder is already a Contributor and so can never attach another), so the order is a choice
 * of which cheap check runs first, not a way to reach a different listing.
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RpcResult = { success?: boolean; reason?: string; slug?: string } | null;

const STATUS_FOR_REASON: Record<string, number> = {
  nothing_to_claim: 404,
  nothing_to_mark: 404,
  email_not_verified: 403,
  not_authenticated: 401,
  not_eligible: 409,
  no_email: 409,
};

export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`contrib-claim-peek:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  const { data, error } = await supabase.rpc("peek_claimable_listing");
  if (error) {
    console.error("[/api/contributor/claim] peek", error);
    return NextResponse.json({ error: "peek_failed" }, { status: 500 });
  }
  // Only the fields the confirm screen shows. Never an email address.
  const peek = (data ?? {}) as Record<string, unknown>;
  if (peek.found !== true) return NextResponse.json({ found: false });
  return NextResponse.json({
    found: true,
    mode: peek.mode === "self" ? "self" : "attach",
    eligible: peek.eligible === true,
    name: typeof peek.name === "string" ? peek.name : "",
    slug: typeof peek.slug === "string" ? peek.slug : null,
    kind: typeof peek.kind === "string" ? peek.kind : null,
    category: typeof peek.category === "string" ? peek.category : null,
    logo_url: typeof peek.logo_url === "string" ? peek.logo_url : null,
  });
}

export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`contrib-claim:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  // Self first: it matches only when the caller IS the placeholder.
  const own = await supabase.rpc("mark_own_listing_claimed");
  if (own.error) {
    console.error("[/api/contributor/claim] mark_own", own.error);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }
  const ownResult = own.data as RpcResult;
  if (ownResult?.success) return NextResponse.json({ success: true, mode: "self", slug: ownResult.slug });
  if (ownResult?.reason && ownResult.reason !== "nothing_to_mark") {
    return NextResponse.json({ error: ownResult.reason }, { status: STATUS_FOR_REASON[ownResult.reason] ?? 409 });
  }

  const { data, error } = await supabase.rpc("claim_admin_created_contributor");
  if (error) {
    console.error("[/api/contributor/claim] rpc", error);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  const result = data as RpcResult;
  if (!result?.success) {
    const reason = result?.reason ?? "claim_failed";
    return NextResponse.json({ error: reason }, { status: STATUS_FOR_REASON[reason] ?? 409 });
  }

  return NextResponse.json({ success: true, mode: "attach", slug: result.slug });
}
