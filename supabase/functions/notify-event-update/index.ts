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
    // Material updates (date/time/location/volunteer openings, or cancellation)
    // are push-worthy for considering RSVPs too. Non-material posts reach
    // considering users in-app only. (migration 127)
    const isMaterial: boolean = record?.is_material === true;

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
    // Per-event opt-out (migration 126): exclude rows with notify_updates=false.
    const { data: rsvpRows } = await supabase
      .from("rsvps")
      .select("user_id, status, notify_updates")
      .eq("event_id", eventId)
      .neq("notify_updates", false);

    // De-duplicate per user and drop the author (no self-ping). Track which
    // users are attending — they always get push; considering users only get
    // push on material updates.
    const attendingSet = new Set<string>();
    const allSet = new Set<string>();
    for (const r of rsvpRows ?? []) {
      if (!r.user_id || r.user_id === authorId) continue;
      allSet.add(r.user_id);
      if (r.status === "attending") attendingSet.add(r.user_id);
    }

    // Honour per-user contributor_updates toggle (migration 049).
    const allowedIds = await filterUserIdsByPref(
      supabase,
      [...allSet],
      "contributor_updates",
    );

    if (allowedIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0 }), { status: 200 });
    }

    // Push recipients: everyone on a material update, attending-only otherwise.
    const allowedSet = new Set(allowedIds);
    const pushIds = isMaterial
      ? allowedIds
      : [...attendingSet].filter((id) => allowedSet.has(id));

    // Truncate long updates in the push body (clients render ~120 chars nicely).
    const trimmed = body.length > 140 ? body.slice(0, 137) + "…" : body;

    const basePayload = {
      title: `Update: ${event.title}`,
      body: trimmed,
      type: "event_update" as const,
      image_url: event.image_url,
      data: { event_id: event.id, update_id: record.id ?? "" },
    };

    // 1. In-app bell for every allowed recipient (no push here).
    await sendNotifications(supabase, {
      ...basePayload,
      user_ids: allowedIds,
      skipPush: true,
    });

    // 2. Push only to the eligible subset (in-app already inserted above).
    if (pushIds.length > 0) {
      await sendNotifications(supabase, {
        ...basePayload,
        user_ids: pushIds,
        skipInApp: true,
      });
    }

    return new Response(
      JSON.stringify({ notified: allowedIds.length, pushed: pushIds.length }),
      { status: 200 },
    );
  } catch (err) {
    console.error("notify-event-update error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
