// Edge Function: notify-event-update
// Triggered by DB webhook on event_updates INSERT.
// Notifies every user who is RSVPed (attending) OR considering the event.

import { serve } from "std/http";
import { sendNotifications } from "../_shared/push.ts";
import { createServiceClient } from "../_shared/client.ts";
import { filterUserIdsByPref } from "../_shared/prefs.ts";

serve(async (req) => {
  try {
    const { record } = await req.json();
    const eventId: string | undefined = record?.event_id;
    const authorId: string | undefined = record?.author_id;
    const body: string | undefined = record?.body;

    if (!eventId || !body) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "missing_fields" }),
        { status: 200 },
      );
    }

    const supabase = createServiceClient();

    // Fetch the event (title + image) — the notification body needs context.
    const { data: event } = await supabase
      .from("events")
      .select("id, title, image_url")
      .eq("id", eventId)
      .single();

    if (!event) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "event_not_found" }),
        { status: 200 },
      );
    }

    // Gather all RSVP user_ids (attending + considering both live in the
    // same `rsvps` table, differentiated by the `status` column).
    const { data: rsvpRows } = await supabase
      .from("rsvps")
      .select("user_id")
      .eq("event_id", eventId);

    const rawUserIds = [...new Set((rsvpRows ?? []).map((r) => r.user_id))]
      .filter((id) => id !== authorId); // author shouldn't ping themselves

    // Honour per-user contributor_updates toggle (migration 049).
    const userIds = await filterUserIdsByPref(
      supabase,
      rawUserIds,
      "contributor_updates",
    );

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0 }), { status: 200 });
    }

    // Truncate long updates in the push body (clients render ~120 chars nicely).
    const trimmed = body.length > 140 ? body.slice(0, 137) + "…" : body;

    await sendNotifications(supabase, {
      user_ids: userIds,
      title: `Update: ${event.title}`,
      body: trimmed,
      type: "event_update",
      image_url: event.image_url,
      data: { event_id: event.id, update_id: record.id ?? "" },
    });

    return new Response(JSON.stringify({ notified: userIds.length }), {
      status: 200,
    });
  } catch (err) {
    console.error("notify-event-update error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
