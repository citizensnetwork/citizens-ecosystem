// Edge Function: prompt-post-event-reviews
// Triggered by daily cron (12:00 UTC)
//
// Sends a single "How was ${event.title}?" push + in-app notification
// to each user who RSVPed as attending to an event that ended in the
// preceding ~24 hours. Users who already left a review are excluded,
// and the per-user `event_reminders` preference is honoured so the
// prompt counts as part of the reminders digest (not a separate
// channel the user can't opt out of).
//
// Idempotency: we only target events whose end (or start, if no
// end_time is set) falls within a single 24-hour window, and the
// exclusion by existing reviews means a user who rates the event
// before the cron fires won't get prompted twice.

import { serve } from "std/http";
import { sendNotifications } from "../_shared/push.ts";
import { createServiceClient } from "../_shared/client.ts";
import { filterUserIdsByPref } from "../_shared/prefs.ts";

type EventRow = {
  id: string;
  title: string;
  date: string;
  end_time: string | null;
  image_url: string | null;
};

serve(async () => {
  try {
    const supabase = createServiceClient();

    const now = new Date();
    // Window: events that ended between 25h and 1h ago.  Most events
    // don't set an end_time; for those we fall back to `date` and
    // add the conventional +2h typical-duration assumption by
    // clipping the start-based window tighter.
    const windowEnd = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const windowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000);

    // Pull candidates using `date` (always present); we'll filter on
    // `end_time` vs `date + 2h` in code so a single index-backed
    // query still does the heavy lifting.
    const { data: candidates } = await supabase
      .from("events")
      .select("id, title, date, end_time, image_url")
      .eq("status", "published")
      .gte("date", new Date(windowStart.getTime() - 12 * 60 * 60 * 1000).toISOString())
      .lte("date", windowEnd.toISOString())
      .returns<EventRow[]>();

    const events: EventRow[] = (candidates ?? []).filter((e) => {
      const end = e.end_time
        ? new Date(e.end_time)
        : new Date(new Date(e.date).getTime() + 2 * 60 * 60 * 1000);
      return end >= windowStart && end <= windowEnd;
    });

    if (events.length === 0) {
      return new Response(JSON.stringify({ prompts: 0 }), { status: 200 });
    }

    const eventIds = events.map((e) => e.id);

    // Batch-fetch attending RSVPs + existing reviews in parallel.
    const [{ data: rsvpRows }, { data: reviewRows }] = await Promise.all([
      supabase
        .from("rsvps")
        .select("user_id, event_id")
        .in("event_id", eventIds)
        .eq("status", "attending"),
      supabase
        .from("reviews")
        .select("user_id, event_id")
        .in("event_id", eventIds),
    ]);

    // Build an (event_id, user_id) set of already-reviewed pairs for
    // O(1) exclusion below.
    const reviewedPairs = new Set<string>();
    for (const r of reviewRows ?? []) {
      reviewedPairs.add(`${r.event_id}::${r.user_id}`);
    }

    // Group RSVPs by event, excluding anyone who already reviewed.
    const rsvpsByEvent = new Map<string, string[]>();
    for (const rsvp of rsvpRows ?? []) {
      if (reviewedPairs.has(`${rsvp.event_id}::${rsvp.user_id}`)) continue;
      const list = rsvpsByEvent.get(rsvp.event_id) ?? [];
      list.push(rsvp.user_id);
      rsvpsByEvent.set(rsvp.event_id, list);
    }

    let totalPrompts = 0;

    for (const event of events) {
      const rawUserIds = rsvpsByEvent.get(event.id) ?? [];
      if (rawUserIds.length === 0) continue;

      // Piggy-back on the `event_reminders` preference. If a user has
      // opted out of reminders, don't pester them for reviews either.
      const userIds = await filterUserIdsByPref(
        supabase,
        rawUserIds,
        "event_reminders",
      );
      if (userIds.length === 0) continue;

      await sendNotifications(supabase, {
        user_ids: userIds,
        title: `How was ${event.title}?`,
        body: "Tap to leave a quick rating and help others discover great events.",
        type: "review_prompt",
        image_url: event.image_url,
        data: { event_id: event.id, review: "1" },
      });

      totalPrompts += userIds.length;
    }

    return new Response(JSON.stringify({ prompts: totalPrompts }), { status: 200 });
  } catch (err) {
    console.error("prompt-post-event-reviews error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
