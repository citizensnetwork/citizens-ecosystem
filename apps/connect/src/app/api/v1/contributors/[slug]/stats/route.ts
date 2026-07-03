/**
 * GET /api/v1/contributors/{slug}/stats
 * ----------------------------------------------------------------
 * Public, unauthenticated stats endpoint for ecosystem consumers.
 * Only exposes counts derived from public data:
 *   - total_events (public + published)
 *   - upcoming_events
 *   - total_rsvps (on public + published events)
 *   - followers
 *
 * Never exposes demographic data, event_views, or private events.
 * The underlying RPC returns null for non-approved contributors.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = (rawSlug ?? "").trim().slice(0, 120);
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  // Gate: key-scoped tier if authenticated, else IP + per-slug combo.
  // The per-slug secondary cap is the fix for Architect audit M2 — an
  // attacker rotating IPs can no longer DoS a single contributor.
  const gate = await gateV1(request, {
    bucket: "v1-contributor-stats",
    resourceId: slug,
  });
  if (gate.deny) return gate.deny;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("contributor_slug", slug)
    .eq("role", "contributor")
    .eq("contributor_status", "approved")
    .maybeSingle<{ id: string }>();

  if (!profile) {
    return NextResponse.json(
      { error: "Contributor not found" },
      { status: 404 },
    );
  }

  const { data: stats, error } = await supabase.rpc(
    "get_contributor_public_stats",
    { p_org_id: profile.id },
  );

  if (error) {
    console.error("[v1 contributor stats rpc]", error);
    return NextResponse.json(
      { error: "Failed to load stats" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      data: stats,
      meta: { generated_at: new Date().toISOString() },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
