import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { updateProjectSchema } from "@/lib/schemas/project";
import { isValidUUID } from "@/lib/validation";
import { PROJECT_STATUS_TRANSITIONS } from "@/lib/constants";
import { requireOrgRole } from "@/lib/supabase/rbac";
import { invalidateOrgResource } from "@/lib/cache/tags";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Invalid project ID" },
      { status: 400 }
    );
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("*, departments(name)")
    .eq("id", id)
    .single();

  if (error || !project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  // Fetch milestones, linked activities count, linked goals count
  const [milestonesResult, activitiesResult, goalsResult] = await Promise.all([
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", id)
      .order("sort_order"),
    supabase
      .from("project_activities")
      .select("activity_id", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("project_goal_links")
      .select("goal_id", { count: "exact", head: true })
      .eq("project_id", id),
  ]);

  return NextResponse.json({
    data: {
      ...project,
      milestones: milestonesResult.data ?? [],
      activity_count: activitiesResult.count ?? 0,
      goal_count: goalsResult.count ?? 0,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Invalid project ID" },
      { status: 400 }
    );
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

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Explicit authorization before mutation (defense in depth over RLS).
  const { data: current, error: fetchErr } = await supabase
    .from("projects")
    .select("status, org_id")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const auth = await requireOrgRole(supabase, user.id, current.org_id, [
    "org_admin",
    "org_manager",
    "org_member",
    "platform_admin",
  ]);
  if (!auth.ok) return auth.response;

  const isAdmin =
    auth.membership.role === "org_admin" ||
    auth.membership.role === "platform_admin";

  // If status is being changed, validate transition.
  if (parsed.data.status) {
    // Non-admins can only move forward
    if (!isAdmin) {
      const allowed = PROJECT_STATUS_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(parsed.data.status)) {
        return NextResponse.json(
          {
            error: `Cannot transition from ${current.status} to ${parsed.data.status}`,
          },
          { status: 400 }
        );
      }
    }
  }

  // Validate date ordering if both provided
  if (parsed.data.start_date && parsed.data.end_date) {
    if (parsed.data.end_date < parsed.data.start_date) {
      return NextResponse.json(
        { error: "End date must be on or after start date" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", id)
    .select("*, departments(name)")
    .single();

  if (error) {
    console.error("[API projects PATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  invalidateOrgResource(current.org_id, "projects");

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Invalid project ID" },
      { status: 400 }
    );
  }

  // Explicit admin-only check before DELETE.
  const { data: existing, error: fetchErr } = await supabase
    .from("projects")
    .select("org_id")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const auth = await requireOrgRole(supabase, user.id, existing.org_id, [
    "org_admin",
    "platform_admin",
  ]);
  if (!auth.ok) return auth.response;

  const { error } = await supabase.from("projects").delete().eq("id", id);

  if (error) {
    console.error("[API projects DELETE]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  invalidateOrgResource(existing.org_id, "projects");

  return NextResponse.json({ success: true });
}
