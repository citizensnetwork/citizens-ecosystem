// Edge Function: notify-broadcast
// Triggered by DB webhook on broadcast_messages INSERT.
//
// Fan-out rules (per contributor-dashboard.md A30–A31):
//   event broadcast → RSVPed users (status = 'attending' or 'considering')
//   place broadcast → followers of the place + followers of the contributor
//
// Delivery: push notification only.
// In-app notifications are already inserted synchronously by the API route
// that created the broadcast, so this function skips the in-app layer to
// avoid duplicate rows.

import { serve } from "std/http";
import { sendNotifications } from "../_shared/push.ts";
import { createServiceClient } from "../_shared/client.ts";
import { filterUserIdsByPref } from "../_shared/prefs.ts";

type MutedSource = {
  type?: unknown;
  id?: unknown;
};

function isMutedSource(
  mutedSourceIds: unknown,
  entityType: "event" | "place",
  entityId: string,
  contributorId: string,
): boolean {
  if (!Array.isArray(mutedSourceIds)) return false;
  return mutedSourceIds.some((raw: MutedSource) => {
    if (!raw || typeof raw !== "object") return false;
    if (entityType === "event") {
      return raw.type === "event" && raw.id === entityId;
    }
    return (
      (raw.type === "place" && raw.id === entityId) ||
      (raw.type === "org" && raw.id === contributorId)
    );
  });
}

async function filterUserIdsBySourceMute(
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[],
  entityType: "event" | "place",
  entityId: string,
  contributorId: string,
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const allowed = new Set(userIds);
  for (let i = 0; i < userIds.length; i += 500) {
    const batch = userIds.slice(i, i + 500);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, muted_source_ids")
      .in("id", batch);
    if (error) {
      console.error("[notify-broadcast] muted source lookup failed", error);
      continue;
    }
    for (const profile of data ?? []) {
      if (isMutedSource(profile.muted_source_ids, entityType, entityId, contributorId)) {
        allowed.delete(profile.id as string);
      }
    }
  }

  return [...allowed];
}

serve(async (req) => {
  try {
    const { record } = await req.json();

    const broadcastId: string | undefined = record?.id;
    const entityType: string | undefined = record?.entity_type;
    const entityId: string | undefined = record?.entity_id;
    const contributorId: string | undefined = record?.contributor_id;
    const body: string | undefined = record?.body;

    // Ignore deletes/soft-deletes forwarded to this function
    if (record?.deleted_at) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "deleted" }),
        { status: 200 },
      );
    }

    if (!broadcastId || !entityType || !entityId || !contributorId || !body) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "missing_fields" }),
        { status: 200 },
      );
    }

    if (!["event", "place"].includes(entityType)) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "unknown_entity_type" }),
        { status: 200 },
      );
    }

    const supabase = createServiceClient();

    // ── 1. Resolve recipients ──────────────────────────────────────
    let rawUserIds: string[] = [];

    if (entityType === "event") {
      // Event broadcast → users who RSVPed as attending or considering.
      const { data: rsvpRows } = await supabase
        .from("rsvps")
        .select("user_id")
        .eq("event_id", entityId)
        .in("status", ["attending", "considering"]);

      rawUserIds = (rsvpRows ?? []).map((r) => r.user_id as string);
    } else {
      // Place broadcast → followers of the place and of the contributor.
      const [{ data: placeFollowRows }, { data: contributorFollowRows }] = await Promise.all([
        supabase
          .from("place_follows")
          .select("user_id")
          .eq("place_id", entityId),
        supabase
          .from("follows")
          .select("follower_id")
          .eq("followee_id", contributorId),
      ]);

      rawUserIds = [
        ...(placeFollowRows ?? []).map((r) => r.user_id as string),
        ...(contributorFollowRows ?? []).map((r) => r.follower_id as string),
      ];
    }

    // Exclude the sender from their own broadcast
    rawUserIds = rawUserIds.filter((id) => id !== contributorId);

    if (rawUserIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0, reason: "no_recipients" }), {
        status: 200,
      });
    }

    // Deduplicate
    const dedupedIds = [...new Set(rawUserIds)];

    // ── 2. Honour contributor_updates notification preference ──────
    const prefFilteredIds = await filterUserIdsByPref(
      supabase,
      dedupedIds,
      "contributor_updates",
    );
    const filteredIds = await filterUserIdsBySourceMute(
      supabase,
      prefFilteredIds,
      entityType as "event" | "place",
      entityId,
      contributorId,
    );

    if (filteredIds.length === 0) {
      return new Response(
        JSON.stringify({ notified: 0, reason: "all_opted_out" }),
        { status: 200 },
      );
    }

    // ── 3. Resolve entity display name + image for notification ───
    let entityTitle = "Broadcast";
    let imageUrl: string | undefined;

    if (entityType === "event") {
      const { data: event } = await supabase
        .from("events")
        .select("title, image_url")
        .eq("id", entityId)
        .maybeSingle<{ title: string; image_url: string | null }>();
      if (event?.title) entityTitle = event.title;
      imageUrl = event?.image_url ?? undefined;
    } else {
      const { data: place } = await supabase
        .from("places")
        .select("name, image_url")
        .eq("id", entityId)
        .maybeSingle<{ name: string; image_url: string | null }>();
      if (place?.name) entityTitle = place.name;
      imageUrl = place?.image_url ?? undefined;
    }

    // ── 4. Flood detection: flag to admins if source exceeds 15 broadcasts/week ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: weeklyCount } = await supabase
      .from("broadcast_messages")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .gte("created_at", sevenDaysAgo)
      .is("deleted_at", null);

    if ((weeklyCount ?? 0) > 15) {
      // Find admin users and notify them
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        await sendNotifications(supabase, {
          user_ids: admins.map((admin: { id: string }) => admin.id),
          type: "broadcast_flood",
          title: "Broadcast flood detected",
          body: `${entityTitle} has sent ${weeklyCount ?? 0} broadcasts this week.`,
          data: {
            entity_type: entityType,
            entity_id: entityId,
            entity_title: entityTitle,
            contributor_id: contributorId,
            weekly_count: weeklyCount ?? 0,
            url: "/admin",
          },
        });
      }
    }

    // ── 5. Deliver push (in-app already handled by API route) ──────
    const trimmedBody =
      body.length > 140 ? body.slice(0, 137) + "…" : body;

    await sendNotifications(supabase, {
      user_ids: filteredIds,
      title: `Message from the organiser`,
      body: `${entityTitle}: ${trimmedBody}`,
      type: "broadcast_sent",
      image_url: imageUrl,
      data: {
        broadcast_id: broadcastId,
        entity_type: entityType,
        entity_id: entityId,
        url: entityType === "event" ? `/events/${entityId}` : `/places/${entityId}`,
      },
      skipInApp: true,
    });

    return new Response(
      JSON.stringify({ notified: filteredIds.length, flood_flagged: (weeklyCount ?? 0) > 15 }),
      { status: 200 },
    );
  } catch (err) {
    console.error("notify-broadcast error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
