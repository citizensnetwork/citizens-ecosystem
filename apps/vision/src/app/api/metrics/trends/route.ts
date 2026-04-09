import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

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
      { status: 400 }
    );
  }

  const dateFrom = searchParams.get("date_from") ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const dateTo = searchParams.get("date_to") ?? new Date().toISOString().split("T")[0];
  const granularity = (searchParams.get("granularity") ?? "day") as
    | "day"
    | "week"
    | "month";

  // Validate granularity
  if (!["day", "week", "month"].includes(granularity)) {
    return NextResponse.json(
      { error: "granularity must be day, week, or month" },
      { status: 400 }
    );
  }

  const { data: activities, error } = await supabase
    .from("activities")
    .select("date, participant_count, type")
    .eq("org_id", orgId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate by granularity
  const buckets = new Map<
    string,
    { count: number; participants: number }
  >();

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

  const trend = Array.from(buckets.entries())
    .map(([date, vals]) => ({
      date,
      count: vals.count,
      participants: vals.participants,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Type breakdown over time
  const typeOverTime = new Map<string, Map<string, number>>();
  for (const a of activities ?? []) {
    const key = bucketKey(a.date, granularity);
    if (!typeOverTime.has(key)) {
      typeOverTime.set(key, new Map());
    }
    const inner = typeOverTime.get(key)!;
    inner.set(a.type, (inner.get(a.type) ?? 0) + 1);
  }

  const typeBreakdown = Array.from(typeOverTime.entries())
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
  granularity: "day" | "week" | "month"
): string {
  const d = new Date(dateStr);
  if (granularity === "day") {
    return dateStr;
  }
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
