import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import {
  readDailyAggregates,
  type DailyAggregateRow,
} from "@/lib/queries/aggregates";

/**
 * GET /api/metrics/trends
 *
 * Returns time-series aggregates for an org. Phase 15b: reads from
 * `activity_daily_aggregates` (pre-computed daily rollup) instead of
 * scanning the raw `activities` table per request. Same response
 * contract as before.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 },
    );
  }

  const dateFrom =
    searchParams.get("date_from") ??
    new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const dateTo =
    searchParams.get("date_to") ?? new Date().toISOString().split("T")[0];
  const granularity = (searchParams.get("granularity") ?? "day") as
    | "day"
    | "week"
    | "month";

  if (!["day", "week", "month"].includes(granularity)) {
    return NextResponse.json(
      { error: "granularity must be day, week, or month" },
      { status: 400 },
    );
  }

  let rows: DailyAggregateRow[];
  try {
    rows = await readDailyAggregates(supabase, orgId, {
      from: dateFrom,
      to: dateTo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const buckets = new Map<string, { count: number; participants: number }>();
  const typeBuckets = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const key = bucketKey(r.day, granularity);

    const existing = buckets.get(key);
    if (existing) {
      existing.count += r.activity_count;
      existing.participants += r.participant_total;
    } else {
      buckets.set(key, {
        count: r.activity_count,
        participants: r.participant_total,
      });
    }

    if (!typeBuckets.has(key)) typeBuckets.set(key, new Map());
    const inner = typeBuckets.get(key)!;
    inner.set(
      r.activity_type,
      (inner.get(r.activity_type) ?? 0) + r.activity_count,
    );
  }

  const trend = Array.from(buckets.entries())
    .map(([date, vals]) => ({
      date,
      count: vals.count,
      participants: vals.participants,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const typeBreakdown = Array.from(typeBuckets.entries())
    .map(([date, types]) => ({
      date,
      ...Object.fromEntries(types),
    }))
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));

  return NextResponse.json({
    trend,
    type_breakdown: typeBreakdown,
    granularity,
    date_from: dateFrom,
    date_to: dateTo,
  });
}

function bucketKey(
  dateStr: string,
  granularity: "day" | "week" | "month",
): string {
  if (granularity === "day") return dateStr;

  const d = new Date(dateStr);
  if (granularity === "week") {
    // ISO week start (Monday)
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setUTCDate(diff);
    return monday.toISOString().split("T")[0];
  }
  // month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
