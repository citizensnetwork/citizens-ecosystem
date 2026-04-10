import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { linkProjectGoalSchema } from "@/lib/schemas/project";
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
    .from("project_goal_links")
    .select("*, goals(id, title, status)")
    .eq("project_id", id);

  if (error) {
    console.error("[API project goals GET]", error);
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

  const parsed = linkProjectGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("project_goal_links")
    .insert({
      project_id: id,
      goal_id: parsed.data.goal_id,
    })
    .select("*, goals(id, title, status)")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Goal already linked to this project" },
        { status: 409 }
      );
    }
    console.error("[API project goals POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data }, { status: 201 });
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

  const goalId = request.nextUrl.searchParams.get("goal_id");

  if (!goalId || !isValidUUID(goalId)) {
    return NextResponse.json(
      { error: "Valid goal_id query parameter is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("project_goal_links")
    .delete()
    .eq("project_id", id)
    .eq("goal_id", goalId);

  if (error) {
    console.error("[API project goals DELETE]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
