import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

/** GET /api/contributor/[handle]/planning/ideas */
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
    .from("planning_ideas")
    .select("id, title, description, tags, linked_event_id, linked_place_id, visible_to_team, created_at, updated_at")
    .eq("contributor_id", contributorId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch ideas" }, { status: 500 });
  }

  return NextResponse.json({ ideas: data ?? [] });
}

/** POST /api/contributor/[handle]/planning/ideas */
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

  const rl = checkRateLimit(`ideas:${user.id}`, RATE_LIMITS.mutation);
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
    ? raw.description.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 3000)
    : null;

  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const tags = rawTags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 50))
    .filter((t) => t.length > 0)
    .slice(0, 10);

  const linked_event_id = isValidUUID(String(raw.linked_event_id ?? "")) ? raw.linked_event_id as string : null;
  const linked_place_id = isValidUUID(String(raw.linked_place_id ?? "")) ? raw.linked_place_id as string : null;
  const visible_to_team = raw.visible_to_team === true;

  const { data, error } = await supabase
    .from("planning_ideas")
    .insert({
      contributor_id: contributorId,
      title,
      description,
      tags,
      linked_event_id,
      linked_place_id,
      visible_to_team,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create idea" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

/** PATCH /api/contributor/[handle]/planning/ideas */
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

  const rl = checkRateLimit(`ideas:${user.id}`, RATE_LIMITS.mutation);
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
    return NextResponse.json({ error: "Invalid idea id" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof raw.title === "string") {
    patch.title = raw.title.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 200);
  }
  if (typeof raw.description === "string" || raw.description === null) {
    patch.description = raw.description
      ? (raw.description as string).replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 3000)
      : null;
  }
  if (Array.isArray(raw.tags)) {
    patch.tags = (raw.tags as unknown[])
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 50))
      .filter((t) => t.length > 0)
      .slice(0, 10);
  }
  if (typeof raw.visible_to_team === "boolean") {
    patch.visible_to_team = raw.visible_to_team;
  }

  const { error } = await supabase
    .from("planning_ideas")
    .update(patch)
    .eq("id", raw.id as string)
    .eq("contributor_id", contributorId);

  if (error) {
    return NextResponse.json({ error: "Failed to update idea" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** DELETE /api/contributor/[handle]/planning/ideas?id=uuid */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid idea id" }, { status: 400 });
  }

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();

  const { error } = await supabase
    .from("planning_ideas")
    .delete()
    .eq("id", id)
    .eq("contributor_id", contributorId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete idea" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
