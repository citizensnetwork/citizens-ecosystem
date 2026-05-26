import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const VALID_STATUSES = ["pending", "in_progress", "completed"] as const;

/** GET /api/contributor/[handle]/planning/tasks */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("planning_tasks")
    .select("id, title, description, status, due_date, linked_event_id, linked_place_id, notes, visible_to_team, completed_at, sort_order, created_at, updated_at")
    .eq("contributor_id", contributorId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }

  return NextResponse.json({ tasks: data ?? [] });
}

/** POST /api/contributor/[handle]/planning/tasks — create a task. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

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

  const rl = checkRateLimit(`tasks:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const title = typeof raw.title === "string"
    ? raw.title.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 200)
    : "";
  if (title.length < 1) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const description = typeof raw.description === "string"
    ? raw.description.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 2000)
    : null;
  const notes = typeof raw.notes === "string"
    ? raw.notes.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 5000)
    : null;
  const due_date = typeof raw.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date)
    ? raw.due_date
    : null;
  const linked_event_id = isValidUUID(String(raw.linked_event_id ?? "")) ? raw.linked_event_id as string : null;
  const linked_place_id = isValidUUID(String(raw.linked_place_id ?? "")) ? raw.linked_place_id as string : null;
  const visible_to_team = raw.visible_to_team === true;

  const { data, error } = await supabase
    .from("planning_tasks")
    .insert({
      contributor_id: contributorId,
      title,
      description,
      notes,
      due_date,
      linked_event_id,
      linked_place_id,
      visible_to_team,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }

  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: "task_created",
    entityType: "planning_task",
    entityId: data.id,
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}

/** PATCH /api/contributor/[handle]/planning/tasks — update or complete a task. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

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

  const rl = checkRateLimit(`tasks:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  if (!isValidUUID(String(raw.id ?? ""))) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof raw.title === "string") {
    patch.title = raw.title.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 200);
  }
  if (typeof raw.description === "string" || raw.description === null) {
    patch.description = raw.description
      ? (raw.description as string).replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 2000)
      : null;
  }
  if (typeof raw.notes === "string" || raw.notes === null) {
    patch.notes = raw.notes
      ? (raw.notes as string).replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 5000)
      : null;
  }
  if (typeof raw.status === "string" && VALID_STATUSES.includes(raw.status as (typeof VALID_STATUSES)[number])) {
    patch.status = raw.status;
    if (raw.status === "completed") {
      patch.completed_at = new Date().toISOString();
    } else {
      patch.completed_at = null;
    }
  }
  if (typeof raw.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date)) {
    patch.due_date = raw.due_date;
  } else if (raw.due_date === null) {
    patch.due_date = null;
  }
  if (typeof raw.visible_to_team === "boolean") {
    patch.visible_to_team = raw.visible_to_team;
  }
  if (typeof raw.sort_order === "number" && Number.isInteger(raw.sort_order)) {
    patch.sort_order = raw.sort_order;
  }

  const { error } = await supabase
    .from("planning_tasks")
    .update(patch)
    .eq("id", raw.id as string)
    .eq("contributor_id", contributorId);

  if (error) {
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }

  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: patch.status === "completed" ? "task_completed" : "task_updated",
    entityType: "planning_task",
    entityId: raw.id as string,
  });

  return NextResponse.json({ success: true });
}

/** DELETE /api/contributor/[handle]/planning/tasks?id=uuid */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

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

  const { error } = await supabase
    .from("planning_tasks")
    .delete()
    .eq("id", id)
    .eq("contributor_id", contributorId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }

  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: "task_deleted",
    entityType: "planning_task",
    entityId: id,
  });

  return NextResponse.json({ success: true });
}
