// Edge Function: send-event-reminder
// Triggered by hourly cron (on the hour).
// Sends a "starting soon" reminder to RSVPed users for events whose start time
// is between now and ~1h 15m from now. The reminder body includes a friendly
// nudge to share the event.

import { serve } from "std/http";
import { sendNotifications } from "../_shared/push.ts";
import { createServiceClient } from "../_shared/client.ts";
import { filterUserIdsByPref } from "../_shared/prefs.ts";

serve(async () => {
  try {
    const supabase = createServiceClient();

    const now = new Date();
    const windowStart = now;
    // 1h 15m window — covers minor cron jitter without needing idempotency keys;
    // pairs with the daily send-rsvp-reminders job (which targets a 24h window)
    // so the two don't collide.
    const windowEnd = new Date(now.getTime() + 75 * 60 * 1000);

    const { data: events, error: eventsErr } = await supabase
      .from("events")
      .select("id, title, date, image_url, location")
      .eq("status", "published")
      .gte("date", windowStart.toISOString())
      .lte("date", windowEnd.toISOString());

    if (eventsErr) {
      console.error("send-event-reminder events query failed:", eventsErr);
      return new Response(
        JSON.stringify({ error: "events_query_failed" }),
        { status: 500 },
      );
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ reminders: 0 }), { status: 200 });
    }

    // Only attending users receive "starting soon" pushes; `considering`
    // users have not committed and the per-user `event_reminders` pref
    // must be honoured (matches send-rsvp-reminders behaviour).
    const eventIds = events.map((e) => e.id);
    const { data: allRsvps } = await supabase
      .from("rsvps")
      .select("user_id, event_id")
      .in("event_id", eventIds)
      .eq("status", "attending");

    const rsvpsByEvent = new Map<string, string[]>();
    for (const rsvp of allRsvps ?? []) {
      const list = rsvpsByEvent.get(rsvp.event_id) ?? [];
      list.push(rsvp.user_id);
      rsvpsByEvent.set(rsvp.event_id, list);
    }

    let totalReminders = 0;

    for (const event of events) {
      const rawUserIds = rsvpsByEvent.get(event.id) ?? [];
      if (rawUserIds.length === 0) continue;
      const userIds = await filterUserIdsByPref(
        supabase,
        rawUserIds,
        "event_reminders",
      );
      if (userIds.length === 0) continue;

      const eventDate = new Date(event.date);
      const timeStr = eventDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      await sendNotifications(supabase, {
        user_ids: userIds,
        title: `Starting soon: ${event.title}`,
        body: `${timeStr}${event.location ? ` · ${event.location}` : ""}. Know someone who'd love this? Share it.`,
        type: "event_reminder",
        image_url: event.image_url,
        data: { event_id: event.id, share_prompt: "true" },
      });

      totalReminders += userIds.length;
    }

    return new Response(JSON.stringify({ reminders: totalReminders }), {
      status: 200,
    });
  } catch (err) {
    console.error("send-event-reminder error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
