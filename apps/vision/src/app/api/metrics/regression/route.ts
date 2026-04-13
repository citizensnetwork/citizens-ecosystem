import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import {
  computeLinearRegression,
  computeMovingAverage,
  getTrendDirection,
} from "@/lib/metrics/analytics";
import type { TrendDataPoint } from "@/types/metrics";

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
  const dateFrom =
    searchParams.get("date_from") ??
    new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
  const dateTo =
    searchParams.get("date_to") ?? new Date().toISOString().split("T")[0];
  const granularity = (searchParams.get("granularity") ?? "day") as
    | "day"
    | "week"
    | "month";
  const windowSize = Math.min(
    Math.max(parseInt(searchParams.get("window") ?? "7", 10) || 7, 2),
    30
  );

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  if (!["day", "week", "month"].includes(granularity)) {
    return NextResponse.json(
      { error: "granularity must be day, week, or month" },
      { status: 400 }
    );
  }

  try {
    const { data: activities, error } = await supabase
      .from("activities")
      .select("date, participant_count")
      .eq("org_id", orgId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true });

    if (error) {
      console.error("[metrics/regression] Query error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Bucket activities by granularity
    const buckets = new Map<string, { count: number; participants: number }>();
    for (const a of activities ?? []) {
      const key = bucketKey(a.date, granularity);
      const existing = buckets.get(key);
      if (existing) {
        existing.count++;
        existing.participants += a.participant_count ?? 0;
      } else {
        buckets.set(key, {
          count: 1,
          participants: a.participant_count ?? 0,
        });
      }
    }

    const trend: TrendDataPoint[] = Array.from(buckets.entries())
      .map(([date, vals]) => ({
        date,
        count: vals.count,
        participants: vals.participants,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const regression = computeLinearRegression(trend);
    const moving_average = computeMovingAverage(trend, windowSize);
    const direction = getTrendDirection(regression.slope);

    return NextResponse.json({
      regression: {
        slope: regression.slope,
        intercept: regression.intercept,
        r_squared: regression.r_squared,
        data_points: trend.length,
        trend_line: regression.trend_line,
        moving_average,
      },
      direction,
      trend,
      granularity,
      date_from: dateFrom,
      date_to: dateTo,
    });
  } catch (error) {
    console.error("[metrics/regression] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function bucketKey(
  dateStr: string,
  granularity: "day" | "week" | "month"
): string {
  const d = new Date(dateStr);
  if (granularity === "day") return dateStr;
  if (granularity === "week") {
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setUTCDate(diff);
    return monday.toISOString().split("T")[0];
  }
  // month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
