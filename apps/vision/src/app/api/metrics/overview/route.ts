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

  const dateFrom = searchParams.get("date_from") ?? undefined;
  const dateTo = searchParams.get("date_to") ?? undefined;

  // Build KPI query using direct aggregation (works with RLS)
  const [kpiResult, deptResult, typeResult] = await Promise.all([
    computeKPIs(supabase, orgId, dateFrom, dateTo),
    supabase
      .from("activities")
      .select("department_id, departments(name)")
      .eq("org_id", orgId)
      .gte("date", dateFrom ?? "1970-01-01")
      .lte("date", dateTo ?? "2099-12-31")
      .not("department_id", "is", null)
      .then(({ data }) => aggregateDepartments(data ?? [])),
    supabase
      .from("activities")
      .select("type")
      .eq("org_id", orgId)
      .gte("date", dateFrom ?? "1970-01-01")
      .lte("date", dateTo ?? "2099-12-31")
      .then(({ data }) => aggregateTypes(data ?? [])),
  ]);

  return NextResponse.json({
    kpis: kpiResult,
    departments: deptResult,
    type_distribution: typeResult,
  });
}

async function computeKPIs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  dateFrom?: string,
  dateTo?: string
) {
  const from = dateFrom ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const to = dateTo ?? new Date().toISOString().split("T")[0];

  const periodDays = Math.ceil(
    (new Date(to).getTime() - new Date(from).getTime()) / 86400000
  );
  const prevFrom = new Date(new Date(from).getTime() - periodDays * 86400000)
    .toISOString()
    .split("T")[0];
  const prevTo = new Date(new Date(from).getTime() - 86400000)
    .toISOString()
    .split("T")[0];

  const [current, previous] = await Promise.all([
    supabase
      .from("activities")
      .select("id, participant_count, department_id", { count: "exact" })
      .eq("org_id", orgId)
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("date", prevFrom)
      .lte("date", prevTo),
  ]);

  const activities = current.data ?? [];
  const totalActivities = current.count ?? 0;
  const prevCount = previous.count ?? 0;
  const participantsReached = activities.reduce(
    (sum, a) => sum + (a.participant_count ?? 0),
    0
  );
  const activeDepartments = new Set(
    activities.filter((a) => a.department_id).map((a) => a.department_id)
  ).size;

  const growthPct =
    prevCount > 0
      ? Math.round(((totalActivities - prevCount) / prevCount) * 1000) / 10
      : totalActivities > 0
        ? 100
        : 0;

  return {
    total_activities: totalActivities,
    participants_reached: participantsReached,
    active_departments: activeDepartments,
    activity_growth_pct: growthPct,
    previous_period_count: prevCount,
    period_days: periodDays,
    date_from: from,
    date_to: to,
  };
}

function aggregateDepartments(
  // Supabase may return departments as object or array depending on query type
  data: Array<{ department_id: string | null; departments: unknown }>
) {
  const map = new Map<
    string,
    { department_id: string; department_name: string; activity_count: number }
  >();

  for (const row of data) {
    if (!row.department_id) continue;
    const existing = map.get(row.department_id);
    if (existing) {
      existing.activity_count++;
    } else {
      const dept = Array.isArray(row.departments)
        ? row.departments[0]
        : row.departments;
      map.set(row.department_id, {
        department_id: row.department_id,
        department_name:
          (dept as { name: string } | null)?.name ?? "Unknown",
        activity_count: 1,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.activity_count - a.activity_count
  );
}

function aggregateTypes(data: Array<{ type: string }>) {
  const map = new Map<string, number>();
  for (const row of data) {
    map.set(row.type, (map.get(row.type) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}
