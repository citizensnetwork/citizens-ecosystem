import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/** PATCH — mark conversation as read (update last_read_at) */
export async function PATCH(_request: NextRequest, { params }: RouteParams) {
  const { id: conversationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
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
