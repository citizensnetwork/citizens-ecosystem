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

  const orgId = request.nextUrl.searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  // Compute org-wide alignment
  const { data: orgAlignment, error: orgError } = await supabase.rpc(
    "compute_org_alignment",
    { p_org_id: orgId }
  );

  if (orgError) {
    console.error("[API metrics alignment]", orgError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Per-goal alignment breakdown
  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("id, title, priority_weight, status, deadline, vision_id, vision_statements(title)")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("priority_weight", { ascending: false });

  if (goalsError) {
    console.error("[API metrics alignment goals]", goalsError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Compute individual scores for each active goal
  const goalScores = await Promise.all(
    (goals ?? []).map(async (goal) => {
      const { data: score } = await supabase.rpc("compute_alignment_score", {
        p_goal_id: goal.id,
      });
      return {
        goal_id: goal.id,
        goal_title: goal.title,
        vision_title: (goal.vision_statements as unknown as { title: string }[] | null)?.[0]?.title ?? null,
        priority_weight: goal.priority_weight,
        status: goal.status,
        deadline: goal.deadline,
        alignment_score: score?.score ?? 0,
        linked_activities: score?.linked_activities ?? 0,
      };
    })
  );

  // Department × goal heatmap
  const { data: heatmapData } = await supabase
    .from("goal_activity_links")
    .select("goal_id, activities(department_id, departments(name))")
    .in(
      "goal_id",
      (goals ?? []).map((g) => g.id)
    );

  const matrix: Record<string, { goal_id: string; department_id: string; department_name: string; count: number }> = {};

  if (heatmapData) {
    for (const link of heatmapData) {
      const activity = link.activities as unknown as {
        department_id: string | null;
        departments: { name: string } | null;
      };
      if (activity?.department_id) {
        const key = `${link.goal_id}:${activity.department_id}`;
        if (!matrix[key]) {
          matrix[key] = {
            goal_id: link.goal_id,
            department_id: activity.department_id,
            department_name: activity.departments?.name ?? "Unknown",
            count: 0,
          };
        }
        matrix[key].count++;
      }
    }
  }

  return NextResponse.json({
    org_alignment: orgAlignment,
    goal_scores: goalScores,
    alignment_matrix: Object.values(matrix),
  });
}
