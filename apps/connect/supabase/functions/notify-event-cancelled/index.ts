// Edge Function: notify-event-cancelled
// Triggered by DB webhook on events UPDATE WHERE status changed to 'cancelled'
// Notifies all users who RSVPed to the event

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendNotifications } from "../_shared/push.ts";

serve(async (req) => {
  try {
    const { record, old_record } = await req.json();

    // Only trigger when status changes TO cancelled
    if (record.status !== "cancelled" || old_record?.status === "cancelled") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all RSVPed users
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("user_id")
      .eq("event_id", record.id);

    const userIds = (rsvps ?? []).map((r) => r.user_id);

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ notified: 0 }), { status: 200 });
    }

    const eventDate = new Date(record.date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    await sendNotifications(supabase, {
      user_ids: userIds,
      title: `Event Cancelled: ${record.title}`,
      body: `The event on ${eventDate} has been cancelled by the organiser.`,
      type: "event_cancelled",
      image_url: record.image_url,
      data: { event_id: record.id },
    });

    return new Response(JSON.stringify({ notified: userIds.length }), { status: 200 });
  } catch (err) {
    console.error("notify-event-cancelled error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
