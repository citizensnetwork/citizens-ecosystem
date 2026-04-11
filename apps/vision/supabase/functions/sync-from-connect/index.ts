// supabase/functions/sync-from-connect/index.ts
// Scheduled via pg_cron every 15 minutes.
// Connects to Citizens Connect Supabase (READ-ONLY) and upserts mirror tables.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CV_URL = Deno.env.get("SUPABASE_URL")!;
const CV_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CC_URL = Deno.env.get("CC_SUPABASE_URL")!;
const CC_KEY = Deno.env.get("CC_SUPABASE_ANON_KEY")!;

Deno.serve(async () => {
  const cv = createClient(CV_URL, CV_SERVICE_KEY);
  const cc = createClient(CC_URL, CC_KEY);

  // Determine last sync time
  const { data: lastSync } = await cv
    .from("cc_sync_log")
    .select("completed_at")
    .eq("sync_type", "full")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  const since = lastSync?.completed_at ?? new Date(0).toISOString();
  const startedAt = new Date().toISOString();
  let totalSynced = 0;
  const errors: string[] = [];

  // --- Sync events ---
  try {
    const { data: events, error } = await cc
      .from("events")
      .select("*")
      .gte("updated_at", since)
      .order("updated_at", { ascending: true })
      .limit(1000);

    if (error) throw error;

    if (events && events.length > 0) {
      const rows = events.map((e: Record<string, unknown>) => ({
        cc_event_id: e.id,
        title: e.title,
        description: e.description,
        date: e.start_date,
        end_time: e.end_date,
        location: e.location_name,
        latitude: e.latitude,
        longitude: e.longitude,
        category: e.category,
        organiser_cc_user_id: e.created_by,
        rsvp_count: e.rsvp_count ?? 0,
        avg_rating: e.avg_rating,
        synced_at: new Date().toISOString(),
      }));

      const { error: upsertErr } = await cv
        .from("cc_events_mirror")
        .upsert(rows, { onConflict: "cc_event_id" });

      if (upsertErr) throw upsertErr;
      totalSynced += rows.length;
    }
  } catch (err) {
    errors.push(`events: ${(err as Error).message}`);
  }

  // --- Sync places ---
  try {
    const { data: places, error } = await cc
      .from("places")
      .select("*")
      .gte("updated_at", since)
      .order("updated_at", { ascending: true })
      .limit(1000);

    if (error) throw error;

    if (places && places.length > 0) {
      const rows = places.map((p: Record<string, unknown>) => ({
        cc_place_id: p.id,
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        category: p.category,
        verified: p.verified ?? false,
        avg_rating: p.avg_rating,
        synced_at: new Date().toISOString(),
      }));

      const { error: upsertErr } = await cv
        .from("cc_places_mirror")
        .upsert(rows, { onConflict: "cc_place_id" });

      if (upsertErr) throw upsertErr;
      totalSynced += rows.length;
    }
  } catch (err) {
    errors.push(`places: ${(err as Error).message}`);
  }

  // --- Sync profiles ---
  try {
    const { data: profiles, error } = await cc
      .from("profiles")
      .select("id, email, full_name, avatar_url, updated_at")
      .gte("updated_at", since)
      .order("updated_at", { ascending: true })
      .limit(1000);

    if (error) throw error;

    if (profiles && profiles.length > 0) {
      const rows = profiles.map((p: Record<string, unknown>) => ({
        cc_user_id: p.id,
        email: p.email,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        synced_at: new Date().toISOString(),
      }));

      const { error: upsertErr } = await cv
        .from("cc_profiles_mirror")
        .upsert(rows, { onConflict: "cc_user_id" });

      if (upsertErr) throw upsertErr;
      totalSynced += rows.length;
    }
  } catch (err) {
    errors.push(`profiles: ${(err as Error).message}`);
  }

  // --- Log sync result ---
  await cv.from("cc_sync_log").insert({
    sync_type: "full",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    records_synced: totalSynced,
    errors: errors.length > 0 ? errors : null,
  });

  return new Response(
    JSON.stringify({
      ok: errors.length === 0,
      records_synced: totalSynced,
      errors,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
