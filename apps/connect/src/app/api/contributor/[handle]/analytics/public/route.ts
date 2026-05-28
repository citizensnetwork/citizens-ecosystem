import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { AnalyticsPeriod } from "@/types/db";

const VALID_PERIODS: AnalyticsPeriod[] = [7, 14, 30, 60, 90, 180, 365];

/**
 * GET /api/contributor/[handle]/analytics/public
 *
 * Public-readable subset of contributor analytics per A19.
 * Delegates to the `get_public_contributor_analytics` SECURITY DEFINER
 * RPC which enforces the public metric allowlist (follows + joins).
 *
 * Aggregated totals only — never per-entity rows — so callers cannot
 * enumerate the contributor's events/places from this endpoint.
 *
 * Query params:
 *   - period: 7 | 14 | 30 | 60 | 90 | 180 | 365 (default 30)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const { searchParams } = new URL(request.url);

  const contributor = await resolveContributorSlug(handle);
  if (!contributor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Per-IP-ish rate limit using user id when present, else handle.
  // Public endpoint — keep heavy bucket so anon scrape is bounded.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rlKey = `analytics-public:${user?.id ?? handle}`;
  const rl = checkRateLimit(rlKey, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const periodRaw = parseInt(searchParams.get("period") ?? "30", 10);
  const period = (VALID_PERIODS.includes(periodRaw as AnalyticsPeriod)
    ? periodRaw
    : 30) as AnalyticsPeriod;

  const { data, error } = await supabase.rpc("get_public_contributor_analytics", {
    p_contributor_id: contributor.id,
    p_days: period,
  });

  if (error) {
    console.error("[API analytics public]", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }

  // RPC returns [{ metric, total }] — fold to a flat record for the client.
  type Row = { metric: string; total: number };
  const totals: Record<string, number> = {};
  for (const row of (data ?? []) as Row[]) {
    totals[row.metric] = Number(row.total) || 0;
  }

  return NextResponse.json({ period, totals });
}
