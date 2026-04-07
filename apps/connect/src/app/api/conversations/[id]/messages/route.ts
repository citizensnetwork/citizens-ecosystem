import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/** GET — fetch messages in a conversation (paginated) */
export async function GET(request: NextRequest, { params }: RouteParams) {
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

  // Verify user is a participant
  const { data: participant } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .single();

  if (!participant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  // Get cursor for pagination
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

  let query = supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at, profiles:sender_id(full_name, avatar_url)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before && isValidUUID(before)) {
    // Get the timestamp of the cursor message
    const { data: cursorMsg } = await supabase
      .from("messages")
      .select("created_at")
      .eq("id", before)
      .single();

    if (cursorMsg) {
      query = query.lt("created_at", cursorMsg.created_at);
    }
  }

  const { data: messages, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get other participant info
  const { data: otherParticipant } = await supabase
    .from("conversation_participants")
    .select("user_id, profiles:user_id(id, full_name, avatar_url)")
    .eq("conversation_id", conversationId)
    .neq("user_id", user.id)
    .single();

  return NextResponse.json({
    messages: (messages || []).reverse(),
    other_user: otherParticipant?.profiles || null,
    has_more: (messages || []).length === limit,
  });
}

/** POST — send a message */
export async function POST(request: NextRequest, { params }: RouteParams) {
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const messageBody = typeof body.body === "string" ? body.body.trim() : "";

  if (!messageBody || messageBody.length > 2000) {
    return NextResponse.json(
      { error: "Message must be 1-2000 characters" },
      { status: 400 }
    );
  }

  // Verify user is a participant
  const { data: participant } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .single();

  if (!participant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  // Insert message
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: messageBody,
    })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update sender's last_read_at to now
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  return NextResponse.json({ message }, { status: 201 });
}
