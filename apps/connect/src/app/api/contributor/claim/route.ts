/**
 * POST /api/contributor/claim
 *
 * A signed-in citizen claims an admin-created Contributor listing
 * (`/api/admin/contributors/create`, migration 169) whose
 * `contributor_claim_email` matches their own verified sign-in email.
 * No body needed — the match is entirely server-side against the caller's
 * own identity, so there is nothing for a client to forge.
 *
 * All the actual logic (email match, field copy, trigger-safe role/status
 * transition, hiding the placeholder) lives in the SECURITY DEFINER RPC
 * `claim_admin_created_contributor()` — this route is a thin, rate-limited
 * wrapper.
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { data, error } = await supabase.rpc("claim_admin_created_contributor");
  if (error) {
    console.error("[/api/contributor/claim] rpc", error);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  const result = data as { success?: boolean; reason?: string; slug?: string } | null;
  if (!result?.success) {
    const status = result?.reason === "nothing_to_claim" ? 404 : 409;
    return NextResponse.json({ error: result?.reason ?? "claim_failed" }, { status });
  }

  return NextResponse.json({ success: true, slug: result.slug });
}
