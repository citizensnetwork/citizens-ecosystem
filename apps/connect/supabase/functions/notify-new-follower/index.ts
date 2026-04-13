// Edge Function: notify-new-follower
// Triggered by DB webhook on follows INSERT
// Notifies the followee that someone started following them

import { serve } from "std/http";
import { sendNotifications } from "../_shared/push.ts";
import { createServiceClient } from "../_shared/client.ts";

serve(async (req) => {
  try {
    const { record } = await req.json();

    const supabase = createServiceClient();

    // Get follower's profile name
    const { data: follower } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", record.follower_id)
      .single();

    const followerName = follower?.full_name || "Someone";

    await sendNotifications(supabase, {
      user_ids: [record.followee_id],
      title: "New follower",
      body: `${followerName} started following you`,
      type: "new_follower",
      image_url: follower?.avatar_url,
      data: { user_id: record.follower_id },
    });

    return new Response(JSON.stringify({ notified: 1 }), { status: 200 });
  } catch (err) {
    console.error("notify-new-follower error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
