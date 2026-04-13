// Edge Function: notify-interested-users
// Triggered by DB webhook on events INSERT WHERE status = 'published'
// Matches event category against user interests + location radius

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendNotifications } from "../_shared/push.ts";
import { haversineKm } from "../_shared/geo.ts";
import { CATEGORY_INTEREST_MAP } from "../_shared/category-interests.ts";

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
    const category = record.category as string | null;

    // 1. Get interest slugs for this event's category
    const interestSlugs = category ? (CATEGORY_INTEREST_MAP[category] ?? []) : [];

    if (interestSlugs.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "no_category_interest_map" }), { status: 200 });
    }

    // 2. Get interest IDs from slugs
    const { data: interests, error: interestErr } = await supabase
      .from("interests")
      .select("id")
      .in("slug", interestSlugs);

    if (interestErr) {
      console.error("Failed to fetch interests:", interestErr);
      return new Response(JSON.stringify({ notified: 0, reason: "interest_lookup_failed" }), { status: 200 });
    }

    const interestIds = (interests ?? []).map((i) => i.id);

    if (interestIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "no_matching_interests" }), { status: 200 });
    }

    // 3. Find users who share at least one matched interest
    const { data: matches } = await supabase
      .from("user_interests")
      .select("user_id")
      .in("interest_id", interestIds);

    let matchedUserIds = [...new Set((matches ?? []).map((m) => m.user_id))];

    if (matchedUserIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "no_interest_matches" }), { status: 200 });
    }

    // 4. Fetch profiles to filter by digest preference and location
    //    - Only notify 'instant' users (daily users get batched by send-daily-digest)
    //    - Include users without home coordinates (don't silently drop them)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, home_latitude, home_longitude, notification_radius_km, notification_digest")
      .in("id", matchedUserIds)
      .eq("notification_digest", "instant");

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "all_users_opted_out" }), { status: 200 });
    }

    // Filter by location radius only for users who have set a home location
    let filteredUserIds: string[];
    if (eventLat != null && eventLng != null) {
      filteredUserIds = profiles
        .filter((p) => {
          // Users without home location always pass (don't drop them)
          if (p.home_latitude == null || p.home_longitude == null) return true;
          const dist = haversineKm(p.home_latitude, p.home_longitude, eventLat, eventLng);
          return dist <= (p.notification_radius_km ?? 50);
        })
        .map((p) => p.id);
    } else {
      // Event has no coordinates — notify all matched users
      filteredUserIds = profiles.map((p) => p.id);
    }

    // Exclude the event creator
    filteredUserIds = filteredUserIds.filter((id) => id !== record.created_by);

    if (filteredUserIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "no_users_in_radius" }), { status: 200 });
    }

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
