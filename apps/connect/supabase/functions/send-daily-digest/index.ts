// Edge Function: send-daily-digest
// Triggered by daily cron (7 AM)
// Sends batched notification summary to users with digest = 'daily'

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendNotifications } from "../_shared/push.ts";
import { haversineKm } from "../_shared/geo.ts";

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get users with daily digest preference
    const { data: dailyUsers } = await supabase
      .from("profiles")
      .select("id, home_latitude, home_longitude, notification_radius_km")
      .eq("notification_digest", "daily");

    if (!dailyUsers || dailyUsers.length === 0) {
      return new Response(JSON.stringify({ digests: 0 }), { status: 200 });
    }

    // Get events published in the last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: newEvents } = await supabase
      .from("events")
      .select("id, title, latitude, longitude, image_url")
      .eq("status", "published")
      .gte("created_at", yesterday);

    if (!newEvents || newEvents.length === 0) {
      return new Response(JSON.stringify({ digests: 0, reason: "no_new_events" }), { status: 200 });
    }

    // Batch-fetch all user interests for daily users in a single query
    const dailyUserIds = dailyUsers.map((u) => u.id);
    const { data: allUserInterests } = await supabase
      .from("user_interests")
      .select("user_id, interest_id")
      .in("user_id", dailyUserIds);

    // Group interests by user_id
    const interestsByUser = new Map<string, string[]>();
    for (const ui of allUserInterests ?? []) {
      const list = interestsByUser.get(ui.user_id) ?? [];
      list.push(ui.interest_id);
      interestsByUser.set(ui.user_id, list);
    }

    // Batch-fetch all event interest tags for new events in a single query
    const newEventIds = newEvents.map((e) => e.id);
    const { data: allEventTags } = await supabase
      .from("event_interest_tags")
      .select("event_id, interest_id")
      .in("event_id", newEventIds);

    // Group tags by event_id
    const tagsByEvent = new Map<string, Set<string>>();
    for (const tag of allEventTags ?? []) {
      const set = tagsByEvent.get(tag.event_id) ?? new Set();
      set.add(tag.interest_id);
      tagsByEvent.set(tag.event_id, set);
    }

    let digestsSent = 0;

    for (const user of dailyUsers) {
      const userInterestIds = interestsByUser.get(user.id) ?? [];

      // Filter events by interest match
      let matchingEvents = newEvents;
      if (userInterestIds.length > 0) {
        const userInterestSet = new Set(userInterestIds);
        matchingEvents = newEvents.filter((e) => {
          const eventTags = tagsByEvent.get(e.id);
          if (!eventTags) return false;
          for (const tag of eventTags) {
            if (userInterestSet.has(tag)) return true;
          }
          return false;
        });
      }

      // Filter by location radius
      if (user.home_latitude != null && user.home_longitude != null) {
        matchingEvents = matchingEvents.filter((e) => {
          if (e.latitude == null || e.longitude == null) return true;
          const dist = haversineKm(user.home_latitude!, user.home_longitude!, e.latitude, e.longitude);
          return dist <= (user.notification_radius_km ?? 50);
        });
      }

      if (matchingEvents.length === 0) continue;

      await sendNotifications(supabase, {
        user_ids: [user.id],
        title: `${matchingEvents.length} new event${matchingEvents.length > 1 ? "s" : ""} near you`,
        body: matchingEvents.slice(0, 3).map((e) => e.title).join(", ") +
          (matchingEvents.length > 3 ? ` and ${matchingEvents.length - 3} more` : ""),
        type: "new_event_match",
        image_url: matchingEvents[0]?.image_url,
        data: {},
      });

      digestsSent++;
    }

    return new Response(JSON.stringify({ digests: digestsSent }), { status: 200 });
  } catch (err) {
    console.error("send-daily-digest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
