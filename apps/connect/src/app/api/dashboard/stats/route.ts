/**
 * GET /api/dashboard/stats
 * ----------------------------------------------------------------
 * Consolidated stats for the logged-in contributor's dashboard.
 * Callers are authenticated; the RPCs enforce ownership (auth.uid()
 * must equal the org_id OR the caller must be admin). Admins
 * additionally receive community-health + category-trends blocks.
 *
 * Response envelope:
 *   {
 *     data: {
 *       role: "contributor" | "admin",
 *       org_id: string | null,         // null for admin/community view
 *       stats: { total_events, upcoming, past, total_rsvps,
 *                avg_rsvps_per_event, views_total, new_followers_30d },
 *       audience: { rsvps_30d: [...], new_followers_30d: [...] },
 *       community_health?: { ... },     // admins only
 *       category_trends?: [ ... ]       // admins only
 *     }
 *   }
 *
 * Errors:
 *   401 — not signed in
 *   403 — signed in but not a contributor/admin
 *   500 — RPC failed
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("role, contributor_status")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = me?.role === "admin";
  const isApprovedContributor =
    me?.role === "contributor" && me?.contributor_status === "approved";

  if (!isAdmin && !isApprovedContributor) {
    return NextResponse.json(
      { error: "Dashboard is for approved contributors and admins only" },
      { status: 403 },
    );
  }

  // Fetch each block independently so a transient failure in one
  // (e.g. the admin-only category trends) doesn't collapse the whole
  // dashboard for everyone. Per-block error flags are surfaced to the
  // client so it can render partial data with inline error banners.
  type RpcResult = {
    data: unknown;
    error: { message: string } | null;
  } | null;

  const run = async <T,>(thenable: PromiseLike<T>): Promise<T | null> => {
    try {
      return await thenable;
    } catch (e) {
      console.error("[dashboard/stats rpc throw]", e);
      return null;
    }
  };

  const [statsRes, audienceRes, healthRes, trendsRes] = (await Promise.all([
    run(supabase.rpc("get_org_event_stats", { p_org_id: user.id })),
    run(supabase.rpc("get_org_audience", { p_org_id: user.id })),
    isAdmin ? run(supabase.rpc("get_community_health")) : Promise.resolve(null),
    isAdmin ? run(supabase.rpc("get_category_trends")) : Promise.resolve(null),
  ])) as [RpcResult, RpcResult, RpcResult, RpcResult];

  // Log (don't fail) individual RPC errors so the client still renders
  // whatever blocks did succeed.
  const logIfError = (label: string, r: RpcResult) => {
    if (r?.error) console.error(`[dashboard/stats ${label}]`, r.error);
  };
  logIfError("stats", statsRes);
  logIfError("audience", audienceRes);
  logIfError("community_health", healthRes);
  logIfError("category_trends", trendsRes);

  // Hard fail only if the two baseline (org-scoped) blocks both failed —
  // otherwise the page has nothing to show.
  if (statsRes?.error && audienceRes?.error) {
    return NextResponse.json(
      { error: "Failed to load dashboard stats" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      data: {
        role: isAdmin ? "admin" : "contributor",
        org_id: user.id,
        stats: statsRes?.data ?? null,
        audience: audienceRes?.data ?? null,
        community_health: isAdmin ? (healthRes?.data ?? null) : undefined,
        category_trends: isAdmin ? (trendsRes?.data ?? null) : undefined,
      },
    },
    {
      headers: {
        // Short private cache — per-user data.
        "Cache-Control": "private, max-age=30",
      },
    },
  );
}
