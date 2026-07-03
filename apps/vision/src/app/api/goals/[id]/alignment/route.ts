import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { createGoalLinkSchema } from "@/lib/schemas/goal";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(goalId)) {
    return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
  }

  // Fetch goal to verify it exists and get org context
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, org_id, title, priority_weight, status, deadline, vision_id, vision_statements(title)")
    .eq("id", goalId)
    .single();

  if (goalError) {
    if (goalError.code === "PGRST116") {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }
    console.error("[API alignment GET]", goalError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Get linked activities with details
  const { data: links, error: linksError } = await supabase
    .from("goal_activity_links")
    .select("*, activities(id, title, type, date, department_id, participant_count)")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false });

  if (linksError) {
    console.error("[API alignment GET links]", linksError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Compute alignment score via SQL function
  const { data: scoreData, error: scoreError } = await supabase.rpc(
    "compute_alignment_score",
    { p_goal_id: goalId }
  );

  if (scoreError) {
    console.error("[API alignment GET score]", scoreError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Department breakdown for heatmap data
  const { data: deptBreakdown } = await supabase
    .from("goal_activity_links")
    .select("activities(department_id, departments(name))")
    .eq("goal_id", goalId);

  const departmentCounts: Record<
    string,
    { department_id: string; department_name: string; count: number }
  > = {};

  if (deptBreakdown) {
    for (const link of deptBreakdown) {
      const activity = link.activities as unknown as {
        department_id: string | null;
        departments: { name: string } | null;
      };
      if (activity?.department_id) {
        const key = activity.department_id;
        if (!departmentCounts[key]) {
          departmentCounts[key] = {
            department_id: key,
            department_name: activity.departments?.name ?? "Unknown",
            count: 0,
          };
        }
        departmentCounts[key].count++;
      }
    }
  }

  return NextResponse.json({
    goal,
    links: links ?? [],
    alignment: scoreData,
    department_breakdown: Object.values(departmentCounts),
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(goalId)) {
    return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsed = createGoalLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("goal_activity_links")
    .insert({
      goal_id: goalId,
      ...parsed.data,
    })
    .select("*, activities(id, title, type, date)")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Activity already linked to this goal" },
        { status: 409 }
      );
    }
    console.error("[API alignment POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(goalId)) {
    return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const patchBodySchema = z.object({
    link_id: z.string().uuid(),
    approved: z.boolean().optional(),
    confidence: z.number().min(0).max(1).optional(),
  });

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { link_id, ...updateFields } = parsed.data;

  const { data, error } = await supabase
    .from("goal_activity_links")
    .update(updateFields)
    .eq("id", link_id)
    .eq("goal_id", goalId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    console.error("[API alignment PATCH]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(goalId)) {
    return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });
  }

  const linkId = request.nextUrl.searchParams.get("link_id");

  if (!linkId || !isValidUUID(linkId)) {
    return NextResponse.json(
      { error: "Valid link_id query parameter is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("goal_activity_links")
    .delete()
    .eq("id", linkId)
    .eq("goal_id", goalId);

  if (error) {
    console.error("[API alignment DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
