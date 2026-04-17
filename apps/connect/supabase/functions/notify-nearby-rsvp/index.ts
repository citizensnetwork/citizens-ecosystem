// Edge Function: notify-nearby-rsvp
// Triggered by DB webhook on `rsvps` INSERT.
// When a user RSVPs to an event, notify other users who:
//   1. Live within their `notification_radius_km` of the event location, AND
//   2. Do NOT already have an RSVP on the event, AND
//   3. Have `notification_digest = 'instant'` (daily users get the digest batch)
//
// The goal: events gathering momentum surface for nearby citizens organically,
// without spamming users who are already attending or are far away.

import { serve } from "std/http";
import { sendNotifications } from "../_shared/push.ts";
import { haversineKm } from "../_shared/geo.ts";
import {
  createServiceClient,
  DEFAULT_NOTIFICATION_RADIUS_KM,
} from "../_shared/client.ts";

serve(async (req) => {
  try {
    const { record } = await req.json();
    const eventId: string | undefined = record?.event_id;
    if (!eventId) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_event_id" }), {
        status: 200,
      });
    }

    const supabase = createServiceClient();

    // 1. Fetch event (must be published + geocoded)
    const { data: event } = await supabase
      .from("events")
      .select("id, title, date, image_url, location, latitude, longitude, status")
      .eq("id", eventId)
      .single();

    if (!event || event.status !== "published") {
      return new Response(
        JSON.stringify({ skipped: true, reason: "event_missing_or_unpublished" }),
        { status: 200 },
      );
    }
    if (event.latitude == null || event.longitude == null) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "event_no_coords" }),
        { status: 200 },
      );
    }

    // 2. Count RSVPs — only notify once a small crowd is forming. This
    //    prevents a single RSVP from paging every nearby user instantly.
    const { count: rsvpCount } = await supabase
      .from("rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId);

    const MIN_RSVPS_TO_NOTIFY = 3;
    if ((rsvpCount ?? 0) !== MIN_RSVPS_TO_NOTIFY) {
      // Only fire exactly once — when the N-th RSVP comes in.
      return new Response(
        JSON.stringify({ skipped: true, rsvp_count: rsvpCount ?? 0 }),
        { status: 200 },
      );
    }

    // 3. Fetch candidate profiles — instant digest, with a home location set.
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, home_latitude, home_longitude, notification_radius_km, notification_digest")
      .eq("notification_digest", "instant")
      .not("home_latitude", "is", null)
      .not("home_longitude", "is", null);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ notified: 0 }), { status: 200 });
    }

    // 4. Exclude users who already RSVPed.
    const { data: existingRsvps } = await supabase
      .from("rsvps")
      .select("user_id")
      .eq("event_id", eventId);
    const rsvpedSet = new Set((existingRsvps ?? []).map((r) => r.user_id));

    // 5. Geofence: user must live within their own radius of the event.
    const matchedUserIds: string[] = [];
    for (const p of profiles) {
      if (rsvpedSet.has(p.id)) continue;
      const radius = p.notification_radius_km ?? DEFAULT_NOTIFICATION_RADIUS_KM;
      const dist = haversineKm(
        p.home_latitude as number,
        p.home_longitude as number,
        event.latitude as number,
        event.longitude as number,
      );
      if (dist <= radius) matchedUserIds.push(p.id);
    }

    if (matchedUserIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0 }), { status: 200 });
    }

    const eventDate = new Date(event.date);
    const dateStr = eventDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    await sendNotifications(supabase, {
      user_ids: matchedUserIds,
      title: `Gaining traction nearby: ${event.title}`,
      body: `${dateStr}${event.location ? ` · ${event.location}` : ""}. A few Citizens near you just RSVPed.`,
      type: "new_event_match",
      image_url: event.image_url,
      data: { event_id: event.id, reason: "nearby_rsvp" },
    });

    return new Response(
      JSON.stringify({ notified: matchedUserIds.length }),
      { status: 200 },
    );
  } catch (err) {
    console.error("notify-nearby-rsvp error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
