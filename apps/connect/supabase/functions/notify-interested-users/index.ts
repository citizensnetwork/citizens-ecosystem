// Edge Function: notify-interested-users
// Triggered by DB webhook on events INSERT WHERE status = 'published'
// Matches event category against user interests + location radius

import { serve } from "std/http";
import { sendNotifications } from "../_shared/push.ts";
import { haversineKm } from "../_shared/geo.ts";
import { CATEGORY_INTEREST_MAP } from "../_shared/category-interests.ts";
import { createServiceClient, DEFAULT_NOTIFICATION_RADIUS_KM } from "../_shared/client.ts";

serve(async (req) => {
  try {
    const { record } = await req.json();

    // Only notify for published events
    if (record.status !== "published") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = createServiceClient();

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
      return new Response(JSON.stringify({ error: "interest_lookup_failed" }), { status: 500 });
    }

    const interestIds = (interests ?? []).map((i) => i.id);

    if (interestIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "no_matching_interests" }), { status: 200 });
    }

    // 3. Find users who share at least one matched interest (batched for scale)
    const matchedUserIdSet = new Set<string>();
    for (let i = 0; i < interestIds.length; i += 500) {
      const batch = interestIds.slice(i, i + 500);
      const { data: matches } = await supabase
        .from("user_interests")
        .select("user_id")
        .in("interest_id", batch);
      for (const m of matches ?? []) matchedUserIdSet.add(m.user_id);
    }

    if (matchedUserIdSet.size === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "no_interest_matches" }), { status: 200 });
    }

    // 4. Fetch profiles — only 'instant' users (daily users get batched by send-daily-digest)
    //    Batched in chunks of 500 to avoid PostgREST URL limits
    const matchedUserIds = [...matchedUserIdSet];
    const profiles: Array<{
      id: string;
      home_latitude: number | null;
      home_longitude: number | null;
      notification_radius_km: number | null;
    }> = [];

    for (let i = 0; i < matchedUserIds.length; i += 500) {
      const batch = matchedUserIds.slice(i, i + 500);
      const { data } = await supabase
        .from("profiles")
        .select("id, home_latitude, home_longitude, notification_radius_km")
        .in("id", batch)
        .eq("notification_digest", "instant");
      if (data) profiles.push(...data);
    }

    if (profiles.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "all_users_opted_out" }), { status: 200 });
    }

    // 5. Filter by location radius — users without home location always pass
    let filteredUserIds: string[];
    if (eventLat != null && eventLng != null) {
      filteredUserIds = profiles
        .filter((p) => {
          if (p.home_latitude == null || p.home_longitude == null) return true;
          const dist = haversineKm(p.home_latitude, p.home_longitude, eventLat, eventLng);
          return dist <= (p.notification_radius_km ?? DEFAULT_NOTIFICATION_RADIUS_KM);
        })
        .map((p) => p.id);
    } else {
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
