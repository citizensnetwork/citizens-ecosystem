// Edge Function: send-daily-digest
// Triggered by daily cron (7 AM)
// Sends batched notification summary to users with digest = 'daily'
// Matches events by category → interest mapping + location radius

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendNotifications } from "../_shared/push.ts";
import { haversineKm } from "../_shared/geo.ts";
import { CATEGORY_INTEREST_MAP } from "../_shared/category-interests.ts";

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
      .select("id, title, category, latitude, longitude, image_url")
      .eq("status", "published")
      .gte("created_at", yesterday);

    if (!newEvents || newEvents.length === 0) {
      return new Response(JSON.stringify({ digests: 0, reason: "no_new_events" }), { status: 200 });
    }

    // Batch-fetch all user interests for daily users
    const dailyUserIds = dailyUsers.map((u) => u.id);
    const { data: allUserInterests } = await supabase
      .from("user_interests")
      .select("user_id, interest_id")
      .in("user_id", dailyUserIds);

    // Group interest IDs by user
    const interestIdsByUser = new Map<string, Set<string>>();
    for (const ui of allUserInterests ?? []) {
      const set = interestIdsByUser.get(ui.user_id) ?? new Set();
      set.add(ui.interest_id);
      interestIdsByUser.set(ui.user_id, set);
    }

    // Build a set of all interest slugs needed across all categories
    const allSlugs = new Set<string>();
    for (const slugs of Object.values(CATEGORY_INTEREST_MAP)) {
      for (const s of slugs) allSlugs.add(s);
    }

    // Single query to resolve slugs → IDs
    const { data: interestRows, error: slugErr } = await supabase
      .from("interests")
      .select("id, slug")
      .in("slug", [...allSlugs]);

    if (slugErr) {
      console.error("Failed to resolve interest slugs:", slugErr);
      return new Response(JSON.stringify({ digests: 0, reason: "slug_lookup_failed" }), { status: 200 });
    }

    const slugToId = new Map<string, string>();
    for (const row of interestRows ?? []) {
      slugToId.set(row.slug, row.id);
    }

    // Pre-compute interest ID sets per category
    const categoryInterestIds = new Map<string, Set<string>>();
    for (const [cat, slugs] of Object.entries(CATEGORY_INTEREST_MAP)) {
      const ids = new Set<string>();
      for (const s of slugs) {
        const id = slugToId.get(s);
        if (id) ids.add(id);
      }
      categoryInterestIds.set(cat, ids);
    }

    let digestsSent = 0;

    for (const user of dailyUsers) {
      const userInterestIds = interestIdsByUser.get(user.id);

      // Users without interests — skip (don't spam)
      if (!userInterestIds || userInterestIds.size === 0) continue;

      // Filter events by category-to-interest match
      let matchingEvents = newEvents.filter((e) => {
        if (!e.category) return false;
        const catInterests = categoryInterestIds.get(e.category);
        if (!catInterests) return false;
        for (const id of catInterests) {
          if (userInterestIds.has(id)) return true;
        }
        return false;
      });

      // Filter by location radius (users without home location pass through)
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
        data: { event_id: matchingEvents[0]?.id },
      });

      digestsSent++;
    }

    return new Response(JSON.stringify({ digests: digestsSent }), { status: 200 });
  } catch (err) {
    console.error("send-daily-digest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
