/**
 * GET /api/v1/analytics/community
 * ----------------------------------------------------------------
 * Public platform-wide metrics for ecosystem dashboards. Pulls from
 * `analytics_daily` rows where `org_id IS NULL` — which RLS policy
 * "Platform analytics are public" (migration 044) permits anonymous
 * readers to see. Individual org rows stay private.
 *
 * Query params:
 *   metric  - optional metric_key to filter (else returns all keys)
 *   days    - lookback window, 1..365, default 30
 *
 * Response:
 *   { data: { metric_key: string; day: string; metric_value: number }[],
 *     meta: { days, from, to } }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METRIC_RE = /^[a-z0-9_:\-]{1,60}$/;

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: "v1-analytics-community" });
  if (gate.deny) return gate.deny;

  const url = new URL(request.url);
  const metricParam = (url.searchParams.get("metric") ?? "").trim();
  const metric = METRIC_RE.test(metricParam) ? metricParam : null;
  const daysRaw = parseInt(url.searchParams.get("days") ?? "30", 10);
  const days = Math.min(365, Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30));

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const supabase = await createClient();

  let q = supabase
    .from("analytics_daily")
    .select("metric_key, metric_value, day")
    .is("org_id", null)
    .eq("public", true)
    .gte("day", fromIso)
    .lte("day", toIso)
    .order("day", { ascending: true });
  if (metric) q = q.eq("metric_key", metric);

  const { data, error } = await q.limit(5000);
  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      data: data ?? [],
      meta: { days, from: fromIso, to: toIso },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
