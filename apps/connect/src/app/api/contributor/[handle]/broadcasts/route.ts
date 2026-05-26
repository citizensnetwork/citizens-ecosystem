import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const BROADCAST_MAX = 500;

/**
 * GET /api/contributor/[handle]/broadcasts?entity_type=event|place&entity_id=uuid
 */
export async function GET(
  request: NextRequest
) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");

  if (!entityType || !["event", "place"].includes(entityType)) {
    return NextResponse.json({ error: "entity_type must be event or place" }, { status: 400 });
  }
  if (!entityId || !isValidUUID(entityId)) {
    return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
  }

  const supabase = await createClient();

  // Public read: anyone can view non-deleted broadcasts
  const { data, error } = await supabase
    .from("broadcast_messages")
    .select("id, body, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch broadcasts" }, { status: 500 });
  }

  return NextResponse.json({ broadcasts: data ?? [] });
}

/**
 * POST /api/contributor/[handle]/broadcasts — send a broadcast.
 * Requires dashboard access (owner or admin with active session).
 */
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

  const rl = checkRateLimit(`broadcasts:send:${user.id}`, RATE_LIMITS.mutation);
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
  const entityType = raw.entity_type as string;
  const entityId = raw.entity_id as string;
  const text = typeof raw.body === "string"
    ? raw.body.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, BROADCAST_MAX)
    : "";

  if (!["event", "place"].includes(entityType)) {
    return NextResponse.json({ error: "Invalid entity_type" }, { status: 400 });
  }
  if (!isValidUUID(entityId)) {
    return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
  }
  if (text.length < 1) {
    return NextResponse.json({ error: "Broadcast body required" }, { status: 400 });
  }

  // Verify ownership of the entity
  if (entityType === "event") {
    const { data: event } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", entityId)
      .maybeSingle<{ created_by: string }>();
    if (!event || event.created_by !== contributorId) {
      return NextResponse.json({ error: "Entity not owned by this contributor" }, { status: 403 });
    }
  } else {
    const { data: place } = await supabase
      .from("places")
      .select("created_by")
      .eq("id", entityId)
      .maybeSingle<{ created_by: string }>();
    if (!place || place.created_by !== contributorId) {
      return NextResponse.json({ error: "Entity not owned by this contributor" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("broadcast_messages")
    .insert({
      contributor_id: contributorId,
      entity_type: entityType,
      entity_id: entityId,
      body: text,
    })
    .select("id, body, created_at")
    .single();

  if (error) {
    console.error("[API broadcasts POST]", error);
    return NextResponse.json({ error: "Failed to send broadcast" }, { status: 500 });
  }

  // Log activity (owner → contributor; admin-on-behalf → admin attribution + notify contributor)
  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: "broadcast_sent",
    entityType,
    entityId,
    metadata: { broadcast_id: data.id },
  });

  // Notify recipients
  const notifyPromise = entityType === "event"
    ? supabase
        .from("rsvps")
        .select("user_id")
        .eq("event_id", entityId)
        .eq("status", "attending")
    : supabase
        .from("follows")
        .select("follower_id")
        .eq("followee_id", contributorId);

  const { data: recipients } = await notifyPromise;
  if (recipients && recipients.length > 0) {
    const notifications = recipients.map((r: Record<string, string>) => ({
      user_id: "user_id" in r ? r.user_id : r.follower_id,
      type: "event_update" as const,
      title: "Broadcast from organiser",
      body: text.length > 100 ? text.slice(0, 97) + "…" : text,
      image_url: null,
      data: {
        broadcast_id: data.id,
        entity_type: entityType,
        entity_id: entityId,
      },
    }));
    // Batch insert in chunks to avoid Supabase payload limits
    for (let i = 0; i < notifications.length; i += 100) {
      await supabase.from("notifications").insert(notifications.slice(i, i + 100));
    }
  }

  return NextResponse.json(data, { status: 201 });
}

/**
 * DELETE /api/contributor/[handle]/broadcasts/[broadcastId] — soft-delete.
 * Requires dashboard access.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const { searchParams } = new URL(request.url);
  const broadcastId = searchParams.get("id");

  if (!broadcastId || !isValidUUID(broadcastId)) {
    return NextResponse.json({ error: "Invalid broadcast id" }, { status: 400 });
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
    .from("broadcast_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", broadcastId)
    .eq("contributor_id", contributorId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete broadcast" }, { status: 500 });
  }

  // Log deletion
  await recordContributorMutation(supabase, {
    handle,
    access,
    actorId: user.id,
    action: "broadcast_deleted",
    entityType: "broadcast",
    entityId: broadcastId,
  });

  return NextResponse.json({ success: true });
}
