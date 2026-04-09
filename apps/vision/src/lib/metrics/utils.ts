// Citizens Vision — Metrics Utility Functions

import type { TrendDataPoint, TypeDistribution } from "@/types/metrics";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";

/** Default date range: last 30 days */
export function getDefaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

/** Format a number with thousands separators */
export function formatMetricValue(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString("en-ZA");
}

/** Compute trend direction from growth percentage */
export function getTrendDirection(
  growthPct: number
): "up" | "down" | "neutral" {
  if (growthPct > 0) return "up";
  if (growthPct < 0) return "down";
  return "neutral";
}

/** Format growth percentage for display */
export function formatGrowthPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** Colours per activity type for charts */
export const CHART_COLOURS: Record<string, string> = {
  event: "#4a90d9",
  meeting: "#6bcf7f",
  outreach: "#f5a623",
  workshop: "#e06c75",
  service: "#c678dd",
  training: "#56b6c2",
  other: "#abb2bf",
};

/** Fill missing dates in trend data with zero values */
export function fillTrendGaps(
  data: TrendDataPoint[],
  from: string,
  to: string,
  granularity: "day" | "week" | "month"
): TrendDataPoint[] {
  const existing = new Map(data.map((d) => [d.date, d]));
  const result: TrendDataPoint[] = [];
  const current = new Date(from);
  const end = new Date(to);

  while (current <= end) {
    const key = current.toISOString().split("T")[0];
    result.push(
      existing.get(key) ?? { date: key, count: 0, participants: 0 }
    );

    if (granularity === "day") {
      current.setDate(current.getDate() + 1);
    } else if (granularity === "week") {
      current.setDate(current.getDate() + 7);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }

  return result;
}

/** Transform raw activity rows to type distribution */
export function computeTypeDistribution(
  activities: Array<{ type: string }>
): TypeDistribution[] {
  const counts = new Map<string, number>();
  for (const a of activities) {
    counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({
      type,
      count,
      label: ACTIVITY_TYPE_LABELS[type] ?? type,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Auto-select granularity based on date range */
export function autoGranularity(
  from: string,
  to: string
): "day" | "week" | "month" {
  const days = Math.ceil(
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}
