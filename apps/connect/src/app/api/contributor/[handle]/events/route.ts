import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import { canEditListingContent } from "@/lib/dashboard/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const TITLE_MAX = 200;

/**
 * POST /api/contributor/[handle]/events
 * Creates an event owned by the contributor (created_by is the listing).
 * An editor cannot set created_by to themselves.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const access = await checkDashboardAccess(handle, request);
  if (!access.hasAccess || !canEditListingContent(access)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`events:${user.id}`, RATE_LIMITS.mutation);
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
  const title = typeof raw.title === "string" ? raw.title.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, TITLE_MAX) : "";
  const date = typeof raw.date === "string" ? raw.date : "";
  if (!title || !date || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: "Title and a valid date are required" }, { status: 400 });
  }
  const description = typeof raw.description === "string" ? raw.description.slice(0, 5000) : "";

  const { data, error } = await supabase
    .from("events")
    .insert({
      title,
      description,
      date: new Date(date).toISOString(),
      created_by: access.contributorId,
      status: "published",
      category: typeof raw.category === "string" ? raw.category.slice(0, 80) : "church-services",
    })
    .select("id, title, date, created_by, status")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }

  if (access.teamRole !== "editor") {
    await recordContributorMutation(supabase, {
      handle,
      access,
      actorId: user.id,
      action: "event_created",
      entityType: "event",
      entityId: data.id,
    });
  }

  return NextResponse.json(data, { status: 201 });
}

/** PATCH /api/contributor/[handle]/events — cancel or restore. Body: { id, status } */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const access = await checkDashboardAccess(handle, request);
  if (!access.hasAccess || !canEditListingContent(access)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : "";
  const status = raw.status === "cancelled" || raw.status === "published" ? raw.status : "";
  if (!isValidUUID(id) || !status) {
    return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("events")
    .update({ status })
    .eq("id", id)
    .eq("created_by", access.contributorId);
  if (error) return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  return NextResponse.json({ success: true, status });
}
