import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createMilestoneSchema, updateMilestoneSchema } from "@/lib/schemas/project";
import { isValidUUID } from "@/lib/validation";

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

  const { data, error } = await supabase
    .from("milestones")
    .select("*")
    .eq("project_id", id)
    .order("sort_order");

  if (error) {
    console.error("[API milestones GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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

  const parsed = createMilestoneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Default sort_order to next available if not provided
  if (parsed.data.sort_order === 0) {
    const { count } = await supabase
      .from("milestones")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id);
    parsed.data.sort_order = (count ?? 0);
  }

  const { data, error } = await supabase
    .from("milestones")
    .insert({
      ...parsed.data,
      project_id: id,
    })
    .select()
    .single();

  if (error) {
    console.error("[API milestones POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data }, { status: 201 });
}

// PATCH & DELETE for individual milestones
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(projectId)) {
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

  const { milestone_id, ...updateData } = body as Record<string, unknown>;

  if (!milestone_id || !isValidUUID(milestone_id as string)) {
    return NextResponse.json(
      { error: "Valid milestone_id is required" },
      { status: 400 }
    );
  }

  const parsed = updateMilestoneSchema.safeParse(updateData);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("milestones")
    .update(parsed.data)
    .eq("id", milestone_id as string)
    .eq("project_id", projectId)
    .select()
    .single();

  if (error) {
    console.error("[API milestones PATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(projectId)) {
    return NextResponse.json(
      { error: "Invalid project ID" },
      { status: 400 }
    );
  }

  const milestoneId = request.nextUrl.searchParams.get("milestone_id");

  if (!milestoneId || !isValidUUID(milestoneId)) {
    return NextResponse.json(
      { error: "Valid milestone_id query parameter is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("milestones")
    .delete()
    .eq("id", milestoneId)
    .eq("project_id", projectId);

  if (error) {
    console.error("[API milestones DELETE]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
