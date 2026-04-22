// Edge Function: send-daily-digest
// Triggered by daily cron (7 AM)
// Sends batched notification summary to users with digest = 'daily'
// Matches events by category → interest mapping + location radius

import { serve } from "std/http";
import { sendNotifications } from "../_shared/push.ts";
import { haversineKm } from "../_shared/geo.ts";
import { CATEGORY_INTEREST_MAP } from "../_shared/category-interests.ts";
import { createServiceClient, DEFAULT_NOTIFICATION_RADIUS_KM } from "../_shared/client.ts";
import { prefEnabled } from "../_shared/prefs.ts";

serve(async () => {
  try {
    const supabase = createServiceClient();

    // Get users with daily digest preference (and weekly_digest toggle on).
    const { data: dailyUsersRaw } = await supabase
      .from("profiles")
      .select("id, home_latitude, home_longitude, notification_radius_km, notification_prefs")
      .eq("notification_digest", "daily");

    const dailyUsers = (dailyUsersRaw ?? []).filter((u) =>
      prefEnabled(u, "weekly_digest"),
    );

    if (dailyUsers.length === 0) {
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

    // Batch-fetch all user interests for daily users (chunked for scale)
    const dailyUserIds = dailyUsers.map((u) => u.id);
    const allUserInterests: Array<{ user_id: string; interest_id: string }> = [];
    for (let i = 0; i < dailyUserIds.length; i += 500) {
      const batch = dailyUserIds.slice(i, i + 500);
      const { data } = await supabase
        .from("user_interests")
        .select("user_id, interest_id")
        .in("user_id", batch);
      if (data) allUserInterests.push(...data);
    }

    // Group interest IDs by user
    const interestIdsByUser = new Map<string, Set<string>>();
    for (const ui of allUserInterests) {
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
      return new Response(JSON.stringify({ error: "slug_lookup_failed" }), { status: 500 });
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

    // Build digest payloads per user, then batch-send
    const digestPayloads: Array<{
      userId: string;
      title: string;
      body: string;
      image_url?: string;
      event_id?: string;
    }> = [];

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
          return dist <= (user.notification_radius_km ?? DEFAULT_NOTIFICATION_RADIUS_KM);
        });
      }

      if (matchingEvents.length === 0) continue;

      digestPayloads.push({
        userId: user.id,
        title: `${matchingEvents.length} new event${matchingEvents.length > 1 ? "s" : ""} near you`,
        body: matchingEvents.slice(0, 3).map((e) => e.title).join(", ") +
          (matchingEvents.length > 3 ? ` and ${matchingEvents.length - 3} more` : ""),
        image_url: matchingEvents[0]?.image_url,
        event_id: matchingEvents[0]?.id,
      });
    }

    // Send all digests in parallel (batches of 10 to avoid overwhelming)
    let digestsSent = 0;
    for (let i = 0; i < digestPayloads.length; i += 10) {
      const batch = digestPayloads.slice(i, i + 10);
      await Promise.allSettled(
        batch.map((d) =>
          sendNotifications(supabase, {
            user_ids: [d.userId],
            title: d.title,
            body: d.body,
            type: "new_event_match",
            image_url: d.image_url,
            data: d.event_id ? { event_id: d.event_id } : {},
          })
        )
      );
      digestsSent += batch.length;
    }

    return new Response(JSON.stringify({ digests: digestsSent }), { status: 200 });
  } catch (err) {
    console.error("send-daily-digest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
