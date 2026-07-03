/**
 * Event tag assignments API — organiser/admin attaches + detaches tags
 * on events they own.  Maximum of 5 tags per event is enforced at the
 * DB layer (trigger in migration 056); we surface a friendly error if
 * that trigger raises.
 *
 * POST   /api/events/[id]/tags      body: { tag_id }
 * DELETE /api/events/[id]/tags?tagId=<uuid>
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin as profileIsAdmin } from "@/lib/profiles/capabilities";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { EVENT_TAG_LIMIT } from "@/types/db";

type Params = { params: Promise<{ id: string }> };

async function requireOwnerOrAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  eventId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: event } = await supabase
    .from("events")
    .select("created_by")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return { ok: false, status: 404, error: "Event not found" };
  }
  if (event.created_by === userId) {
    return { ok: true };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileIsAdmin(profile)) return { ok: true };
  return { ok: false, status: 403, error: "Forbidden" };
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const rl = await checkRateLimit(`event-tags:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      }
    );
  }

  let body: { tag_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isValidUUID(body.tag_id)) {
    return NextResponse.json({ error: "Invalid tag id" }, { status: 400 });
  }
  const tagId = body.tag_id as string;

  const auth = await requireOwnerOrAdmin(supabase, user.id, eventId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Verify the tag exists and is not hidden before we create the join
  // row — hidden tags must not be reassignable from the UI.
  const { data: tag } = await supabase
    .from("event_tags")
    .select("id, is_hidden")
    .eq("id", tagId)
    .maybeSingle();
  if (!tag) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }
  if (tag.is_hidden) {
    return NextResponse.json(
      { error: "Tag is not available" },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("event_tag_assignments")
    .insert({
      event_id: eventId,
      tag_id: tagId,
      created_by: user.id,
    });

  if (error) {
    if (error.code === "23505") {
      // Already assigned — treat as success (idempotent).
      return NextResponse.json({ success: true });
    }
    if (error.message.includes("event_tag_cap_reached")) {
      return NextResponse.json(
        { error: `An event can have at most ${EVENT_TAG_LIMIT} tags` },
        { status: 409 }
      );
    }
    console.error("[API event-tags POST]", error);
    return NextResponse.json(
      { error: "Failed to assign tag" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const tagId = url.searchParams.get("tagId");
  if (!isValidUUID(tagId)) {
    return NextResponse.json({ error: "Invalid tag id" }, { status: 400 });
  }

  const rl = await checkRateLimit(`event-tags:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      }
    );
  }

  const auth = await requireOwnerOrAdmin(supabase, user.id, eventId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { error } = await supabase
    .from("event_tag_assignments")
    .delete()
    .eq("event_id", eventId)
    .eq("tag_id", tagId);

  if (error) {
    console.error("[API event-tags DELETE]", error);
    return NextResponse.json(
      { error: "Failed to remove tag" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
