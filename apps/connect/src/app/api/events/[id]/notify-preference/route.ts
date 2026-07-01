import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH — toggle the caller's per-event notification opt-in.
 *
 * Body: { notify_updates: boolean }
 *
 * When notify_updates is false, the user is excluded from event-update and
 * organiser-broadcast fan-out for this single event while remaining
 * RSVPed/considering. Mutation is delegated to the SECURITY DEFINER RPC
 * `set_rsvp_notify_updates` (migration 126) which only touches the caller's
 * own rsvps row's notify_updates column.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`event-notify-pref:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const notify = (body as { notify_updates?: unknown })?.notify_updates;
  if (typeof notify !== "boolean") {
    return NextResponse.json(
      { error: "notify_updates must be a boolean" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("set_rsvp_notify_updates", {
    p_event_id: id,
    p_notify: notify,
  });

  if (error) {
    console.error("[API event notify-preference PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update notification preference" },
      { status: 500 },
    );
  }

  // RPC returns false when the caller has no RSVP row for this event.
  if (data === false) {
    return NextResponse.json(
      { error: "You must RSVP or consider this event first" },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true, notify_updates: notify });
}
