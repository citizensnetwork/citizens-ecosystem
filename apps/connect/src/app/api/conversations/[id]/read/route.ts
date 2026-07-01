import { getRouteAuth } from "@/lib/supabase/route";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

/** PATCH — mark conversation as read (update last_read_at) */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: conversationId } = await params;
  const { supabase, user } = await getRouteAuth(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  const rl = await checkRateLimit(`conv-read:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() },
      }
    );
  }

  const { error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[API conversations read PATCH]", error);
    return NextResponse.json({ error: "Failed to mark conversation as read" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
