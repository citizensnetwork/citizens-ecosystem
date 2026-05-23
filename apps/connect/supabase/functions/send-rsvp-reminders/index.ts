// Edge Function: send-rsvp-reminders
// Triggered by daily cron (8 AM)
// Sends reminders to users RSVPed to events within the next 24 hours

import { serve } from "std/http";
import { sendNotifications } from "../_shared/push.ts";
import { createServiceClient } from "../_shared/client.ts";
import { filterUserIdsByPref } from "../_shared/prefs.ts";

serve(async () => {
  try {
    const supabase = createServiceClient();

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find events happening within the next 24 hours
    const { data: events } = await supabase
      .from("events")
      .select("id, title, date, image_url, location")
      .eq("status", "published")
      .gte("date", now.toISOString())
      .lte("date", tomorrow.toISOString());

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ reminders: 0 }), { status: 200 });
    }

    // Batch-fetch attending RSVPs only — `considering` users have not
    // committed and should not receive "happening today" reminders.
    const eventIds = events.map((e) => e.id);
    const { data: allRsvps } = await supabase
      .from("rsvps")
      .select("user_id, event_id")
      .in("event_id", eventIds)
      .eq("status", "attending");

    // Group RSVPs by event_id
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

      // Honour per-user event_reminders toggle (migration 049).
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
        title: `Reminder: ${event.title}`,
        body: `Happening today at ${timeStr}${event.location ? ` — ${event.location}` : ""}`,
        type: "event_reminder",
        image_url: event.image_url,
        data: { event_id: event.id },
      });

      totalReminders += userIds.length;
    }

    return new Response(JSON.stringify({ reminders: totalReminders }), { status: 200 });
  } catch (err) {
    console.error("send-rsvp-reminders error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
