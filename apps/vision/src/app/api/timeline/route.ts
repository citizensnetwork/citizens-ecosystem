import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import type {
  TimelineItem,
  TimelineMilestone,
  TimelineBucket,
} from "@/types/metrics";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const departmentId = searchParams.get("department_id");
  const projectId = searchParams.get("project_id");
  const goalId = searchParams.get("goal_id");
  const type = searchParams.get("type");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  if (departmentId && !isValidUUID(departmentId)) {
    return NextResponse.json(
      { error: "Invalid department_id" },
      { status: 400 }
    );
  }

  if (projectId && !isValidUUID(projectId)) {
    return NextResponse.json(
      { error: "Invalid project_id" },
      { status: 400 }
    );
  }

  if (goalId && !isValidUUID(goalId)) {
    return NextResponse.json({ error: "Invalid goal_id" }, { status: 400 });
  }

  // Verify org membership
  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // --- Fetch activities with joined data ---
  let activityQuery = supabase
    .from("activities")
    .select(
      `id, title, type, date, start_time, end_time, department_id,
       latitude, longitude, participant_count,
       departments(name)`
    )
    .eq("org_id", orgId)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });

  if (dateFrom) activityQuery = activityQuery.gte("date", dateFrom);
  if (dateTo) activityQuery = activityQuery.lte("date", dateTo);
  if (departmentId) activityQuery = activityQuery.eq("department_id", departmentId);
  if (type) activityQuery = activityQuery.eq("type", type);

  activityQuery = activityQuery.limit(500);

  const { data: activities, error: activityError } = await activityQuery;

  if (activityError) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // Get activity IDs for joining
  const activityIds = (activities ?? []).map((a) => a.id);
  const truncated = (activities ?? []).length >= 500;

  // --- Parallel fetch: project links, goal links, project filter, goal filter ---
  const projectLinksPromise = activityIds.length > 0
    ? supabase
        .from("project_activities")
        .select("activity_id, project_id, projects(name, department_id)")
        .in("activity_id", activityIds)
    : Promise.resolve({ data: null });

  const goalLinksPromise = activityIds.length > 0
    ? supabase
        .from("goal_activity_links")
        .select("activity_id, goals(title)")
        .in("activity_id", activityIds)
    : Promise.resolve({ data: null });

  const projectFilterPromise = projectId
    ? supabase
        .from("project_activities")
        .select("activity_id")
        .eq("project_id", projectId)
    : Promise.resolve({ data: null });

  const goalFilterPromise = goalId
    ? supabase
        .from("goal_activity_links")
        .select("activity_id")
        .eq("goal_id", goalId)
    : Promise.resolve({ data: null });

  const [paLinksResult, gaLinksResult, paForProjectResult, gaForGoalResult] =
    await Promise.all([
      projectLinksPromise,
      goalLinksPromise,
      projectFilterPromise,
      goalFilterPromise,
    ]);

  // --- Build project links map ---
  const projectLinks: Record<string, { project_id: string; project_name: string }> = {};
  if (paLinksResult.data) {
    for (const link of paLinksResult.data) {
      const proj = link.projects as unknown as { name: string; department_id: string | null } | null;
      projectLinks[link.activity_id] = {
        project_id: link.project_id,
        project_name: proj?.name ?? "Unknown",
      };
    }
  }

  // --- Filter by project if specified ---
  let filteredActivityIds = new Set(activityIds);
  if (projectId && paForProjectResult.data) {
    const projectActivityIds = new Set(
      paForProjectResult.data.map((pa) => pa.activity_id)
    );
    filteredActivityIds = new Set(
      activityIds.filter((id) => projectActivityIds.has(id))
    );
  }

  // --- Build goal links map ---
  const goalLinks: Record<string, string[]> = {};
  if (gaLinksResult.data) {
    for (const link of gaLinksResult.data) {
      const goal = link.goals as unknown as { title: string } | null;
      if (goal) {
        if (!goalLinks[link.activity_id]) {
          goalLinks[link.activity_id] = [];
        }
        goalLinks[link.activity_id].push(goal.title);
      }
    }
  }

  // --- Filter by goal if specified ---
  if (goalId && gaForGoalResult.data) {
    const goalActivityIds = new Set(
      gaForGoalResult.data.map((ga) => ga.activity_id)
    );
    filteredActivityIds = new Set(
      [...filteredActivityIds].filter((id) => goalActivityIds.has(id))
    );
  }

  // --- Build timeline items ---
  const items: TimelineItem[] = (activities ?? [])
    .filter((a) => filteredActivityIds.has(a.id))
    .map((a) => {
      const dept = a.departments as unknown as { name: string } | null;
      const proj = projectLinks[a.id];
      return {
        id: a.id,
        title: a.title,
        type: a.type,
        date: a.date,
        start_time: a.start_time,
        end_time: a.end_time,
        department_id: a.department_id,
        department_name: dept?.name ?? null,
        project_id: proj?.project_id ?? null,
        project_name: proj?.project_name ?? null,
        aligned_goals: goalLinks[a.id] ?? [],
        latitude: a.latitude,
        longitude: a.longitude,
        participant_count: a.participant_count,
      };
    });

  // --- Fetch milestones in date range ---
  // We need to filter milestones belonging to org projects
  const { data: orgProjects } = await supabase
    .from("projects")
    .select("id")
    .eq("org_id", orgId);

  const orgProjectIds = (orgProjects ?? []).map((p) => p.id);

  let milestones: TimelineMilestone[] = [];
  if (orgProjectIds.length > 0) {
    let msQuery = supabase
      .from("milestones")
      .select(
        `id, project_id, title, target_date, completed_at,
         projects(name, department_id, departments(name))`
      )
      .in("project_id", orgProjectIds)
      .not("target_date", "is", null)
      .order("target_date", { ascending: true });

    if (dateFrom) msQuery = msQuery.gte("target_date", dateFrom);
    if (dateTo) msQuery = msQuery.lte("target_date", dateTo);
    if (projectId) msQuery = msQuery.eq("project_id", projectId);

    const { data: msData } = await msQuery;

    milestones = (msData ?? []).map((m) => {
      const proj = m.projects as unknown as {
        name: string;
        department_id: string | null;
        departments: { name: string } | null;
      } | null;
      return {
        id: m.id,
        project_id: m.project_id,
        project_name: proj?.name ?? "Unknown",
        title: m.title,
        target_date: m.target_date,
        completed_at: m.completed_at,
        department_id: proj?.department_id ?? null,
        department_name: proj?.departments?.name ?? null,
      };
    });
  }

  // --- Compute density buckets ---
  const densityMap = new Map<string, number>();
  for (const item of items) {
    const existing = densityMap.get(item.date) ?? 0;
    densityMap.set(item.date, existing + 1);
  }

  const density: TimelineBucket[] = Array.from(densityMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    items,
    milestones,
    density,
    total_count: items.length,
    truncated,
  });
}
