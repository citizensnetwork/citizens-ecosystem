import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import type { AnalyticsPeriod } from "@/types/db";

const VALID_PERIODS: AnalyticsPeriod[] = [7, 14, 30, 60, 90, 180, 365];
const VALID_ENTITY_TYPES = ["contributor", "event", "place"] as const;

/** GET /api/contributor/[handle]/analytics */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const { searchParams } = new URL(request.url);

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`analytics:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const periodRaw = parseInt(searchParams.get("period") ?? "30", 10);
  const period = (VALID_PERIODS.includes(periodRaw as AnalyticsPeriod) ? periodRaw : 30) as AnalyticsPeriod;

  const entityTypeRaw = searchParams.get("entity_type") ?? "contributor";
  const entityType = VALID_ENTITY_TYPES.includes(entityTypeRaw as (typeof VALID_ENTITY_TYPES)[number])
    ? entityTypeRaw
    : "contributor";

  const entityId = searchParams.get("entity_id");
  if (entityType !== "contributor" && entityId && !isValidUUID(entityId)) {
    return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
  }

  const since = new Date();
  since.setDate(since.getDate() - period);
  const sinceIso = since.toISOString().split("T")[0]; // date-only

  let query = supabase
    .from("contributor_analytics")
    .select("date, metric, value, entity_type, entity_id")
    .eq("contributor_id", contributorId)
    .eq("entity_type", entityType)
    .gte("date", sinceIso)
    .order("date", { ascending: true });

  if (entityType !== "contributor" && entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[API analytics GET]", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }

  // Aggregate by metric
  type Row = { date: string; metric: string; value: number; entity_type: string; entity_id: string | null };
  const byMetric: Record<string, { date: string; value: number }[]> = {};
  for (const row of (data ?? []) as Row[]) {
    if (!byMetric[row.metric]) byMetric[row.metric] = [];
    byMetric[row.metric].push({ date: row.date, value: row.value });
  }

  // Build totals for quick summary cards
  const totals: Record<string, number> = {};
  for (const [metric, series] of Object.entries(byMetric)) {
    totals[metric] = series.reduce((sum, r) => sum + r.value, 0);
  }

  return NextResponse.json({
    period,
    entity_type: entityType,
    entity_id: entityId ?? null,
    series: byMetric,
    totals,
  });
}
