// Edge Function: send-contributor-digest
//
// Runs weekly as a contributor analytics summary.
// pg_cron schedule: "0 6 * * 1" (Monday 08:00 SAST).
//
// Delivers an in-app activity summary to each approved Contributor showing
// what happened across their events/places in the previous 7 days. Only
// delivers if there is actual activity to report.
//
// Summary includes:
//   - New connects (attending RSVPs) and considers on their events
//   - New RSVP cancellations where available
//   - New place follows
//   - New volunteer applications
//   - New direct messages received
//   - New comments on their events

import { serve } from "std/http";
import { createServiceClient } from "../_shared/client.ts";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

serve(async (req) => {
  // Defense in depth: pg_cron passes the Supabase anon key as a Bearer token
  // (see migration 108). Reject anything without an Authorization header so
  // the function isn't trivially invokable from outside the platform.
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

    // Get all approved contributors (excluding soft-deleted accounts)
    const { data: contributors, error: contribErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "contributor")
      .eq("contributor_status", "approved")
      .is("deleted_at", null);

    if (contribErr || !contributors || contributors.length === 0) {
      return new Response(JSON.stringify({ digests: 0, reason: "no_contributors" }), {
        status: 200,
      });
    }

    let digestsSent = 0;

    for (const contributor of contributors) {
      const cid = contributor.id as string;

      // Get this contributor's event + place IDs
      const [eventsRes, placesRes] = await Promise.all([
        supabase.from("events").select("id").eq("created_by", cid).eq("status", "published"),
        supabase.from("places").select("id").eq("created_by", cid),
      ]);

      const eventIds = (eventsRes.data ?? []).map((e: { id: string }) => e.id);
      const placeIds = (placesRes.data ?? []).map((p: { id: string }) => p.id);

      // Pre-fetch conversation IDs for the DM count.
      // Supabase JS .in() requires an array — nested subqueries silently return 0.
      const { data: convs } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", cid);
      const convIds = (convs ?? []).map((c: { conversation_id: string }) => c.conversation_id);

      // Count activity since the weekly digest window opened.
      const [
        connectRes,
        considerRes,
        cancellationRes,
        followerRes,
        placeFollowRes,
        volunteerRes,
        dmRes,
        commentRes,
      ] = await Promise.all([
        eventIds.length > 0
          ? supabase
              .from("rsvps")
              .select("id", { count: "exact", head: true })
              .in("event_id", eventIds)
              .eq("status", "attending")
              .gte("created_at", since)
          : Promise.resolve({ count: 0 }),
        eventIds.length > 0
          ? supabase
              .from("rsvps")
              .select("id", { count: "exact", head: true })
              .in("event_id", eventIds)
              .eq("status", "considering")
              .gte("created_at", since)
          : Promise.resolve({ count: 0 }),
        eventIds.length > 0
          ? supabase
              .from("rsvp_cancellations")
              .select("id", { count: "exact", head: true })
              .in("event_id", eventIds)
              .gte("cancelled_at", since)
          : Promise.resolve({ count: 0 }),
        supabase
          .from("follows")
          .select("id", { count: "exact", head: true })
          .eq("followee_id", cid)
          .gte("created_at", since),
        placeIds.length > 0
          ? supabase
              .from("place_follows")
              .select("id", { count: "exact", head: true })
              .in("place_id", placeIds)
              .gte("created_at", since)
          : Promise.resolve({ count: 0 }),
        supabase
          .from("volunteer_applications")
          .select("id", { count: "exact", head: true })
          .eq("contributor_id", cid)
          .gte("created_at", since),
        convIds.length > 0
          ? supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .neq("sender_id", cid)
              .gte("created_at", since)
              .in("conversation_id", convIds)
          : Promise.resolve({ count: 0 }),
        eventIds.length > 0
          ? supabase
              .from("comments")
              .select("id", { count: "exact", head: true })
              .in("event_id", eventIds)
              .gte("created_at", since)
          : Promise.resolve({ count: 0 }),
      ]);

      const newConnects = connectRes.count ?? 0;
      const newConsiders = considerRes.count ?? 0;
      const newCancellations = cancellationRes.count ?? 0;
      const newFollowers = followerRes.count ?? 0;
      const newPlaceFollows = placeFollowRes.count ?? 0;
      const newVolunteers = volunteerRes.count ?? 0;
      const newDms = dmRes.count ?? 0;
      const newComments = commentRes.count ?? 0;

      const total =
        newConnects +
        newConsiders +
        newCancellations +
        newFollowers +
        newPlaceFollows +
        newVolunteers +
        newDms +
        newComments;

      // Skip if nothing to report
      if (total === 0) continue;

      // Build summary lines
      const lines: string[] = [];
      if (newConnects > 0) lines.push(`${newConnects} new connect${newConnects !== 1 ? "s" : ""}`);
      if (newConsiders > 0) lines.push(`${newConsiders} new consider${newConsiders !== 1 ? "s" : ""}`);
      if (newCancellations > 0) lines.push(`${newCancellations} cancellation${newCancellations !== 1 ? "s" : ""}`);
      if (newFollowers > 0) lines.push(`${newFollowers} new follower${newFollowers !== 1 ? "s" : ""}`);
      if (newPlaceFollows > 0) lines.push(`${newPlaceFollows} new place follow${newPlaceFollows !== 1 ? "s" : ""}`);
      if (newVolunteers > 0) lines.push(`${newVolunteers} volunteer application${newVolunteers !== 1 ? "s" : ""}`);
      if (newDms > 0) lines.push(`${newDms} new message${newDms !== 1 ? "s" : ""}`);
      if (newComments > 0) lines.push(`${newComments} comment${newComments !== 1 ? "s" : ""}`);

      const summaryBody = lines.join(" · ");

      // Insert in-app notification
      await supabase.from("notifications").insert({
        user_id: cid,
        type: "event_update",
        title: "Your weekly contributor update",
        body: summaryBody,
        data: {
          digest: true,
          period: "weekly",
          window_days: 7,
          new_connects: newConnects,
          new_considers: newConsiders,
          new_cancellations: newCancellations,
          new_followers: newFollowers,
          new_place_follows: newPlaceFollows,
          new_volunteers: newVolunteers,
          new_dms: newDms,
          new_comments: newComments,
          summary: summaryBody,
        },
        read: false,
      });

      digestsSent++;
    }

    return new Response(JSON.stringify({ digests: digestsSent }), { status: 200 });
  } catch (err) {
    console.error("send-contributor-digest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
