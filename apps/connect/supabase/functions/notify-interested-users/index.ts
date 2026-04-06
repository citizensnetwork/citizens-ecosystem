// Edge Function: notify-interested-users
// Triggered by DB webhook on events INSERT WHERE status = 'published'
// Matches event interest tags against user interests + location radius

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendNotifications } from "../_shared/push.ts";
import { haversineKm } from "../_shared/geo.ts";

serve(async (req) => {
  try {
    const { record } = await req.json();

    // Only notify for published events
    if (record.status !== "published") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const eventId = record.id;
    const eventLat = record.latitude;
    const eventLng = record.longitude;

    // 1. Get event's interest tags
    const { data: tags } = await supabase
      .from("event_interest_tags")
      .select("interest_id")
      .eq("event_id", eventId);

    const tagIds = (tags ?? []).map((t) => t.interest_id);

    // 2. Find users who share at least one interest
    let matchedUserIds: string[] = [];
    if (tagIds.length > 0) {
      const { data: matches } = await supabase
        .from("user_interests")
        .select("user_id")
        .in("interest_id", tagIds);

      matchedUserIds = [...new Set((matches ?? []).map((m) => m.user_id))];
    }

    // If no interest tags on event, skip interest matching — don't spam everyone
    if (matchedUserIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "no_interest_matches" }), { status: 200 });
    }

    // 3. Filter by location radius (haversine approximation)
    let filteredUserIds = matchedUserIds;
    if (eventLat != null && eventLng != null) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, home_latitude, home_longitude, notification_radius_km")
        .in("id", matchedUserIds)
        .not("home_latitude", "is", null)
        .not("home_longitude", "is", null)
        .neq("notification_digest", "off");

      if (profiles && profiles.length > 0) {
        filteredUserIds = profiles
          .filter((p) => {
            const dist = haversineKm(p.home_latitude!, p.home_longitude!, eventLat, eventLng);
            return dist <= (p.notification_radius_km ?? 50);
          })
          .map((p) => p.id);
      }
    }

    // Exclude the event creator
    filteredUserIds = filteredUserIds.filter((id) => id !== record.created_by);

    if (filteredUserIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "no_users_in_radius" }), { status: 200 });
    }

    // 4. Get RSVP social proof (friends attending)
    // For each user, count how many of their friends have RSVPed
    // (Simplified: just send the notification without friend count for now)

    await sendNotifications(supabase, {
      user_ids: filteredUserIds,
      title: `New event: ${record.title}`,
      body: record.description?.substring(0, 150) || "A new event matching your interests was posted!",
      type: "new_event_match",
      image_url: record.image_url,
      data: { event_id: eventId },
    });

    return new Response(JSON.stringify({ notified: filteredUserIds.length }), { status: 200 });
  } catch (err) {
    console.error("notify-interested-users error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
