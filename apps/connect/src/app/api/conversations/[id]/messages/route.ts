import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

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
    .maybeSingle();

  if (!participant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  // Get cursor for pagination
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
  const safeLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;
  const limit = Math.min(safeLimit, 100);

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
      .maybeSingle();

    if (cursorMsg) {
      query = query.lt("created_at", cursorMsg.created_at);
    }
  }

  const { data: messages, error } = await query;

  if (error) {
    console.error("[API messages GET]", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }

  // Get other participant info (include deleted_at so ChatView can show strikethrough)
  const { data: otherParticipant } = await supabase
    .from("conversation_participants")
    .select("user_id, profiles:user_id(id, full_name, avatar_url, deleted_at)")
    .eq("conversation_id", conversationId)
    .neq("user_id", user.id)
    .maybeSingle();

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
    .maybeSingle();

  if (!participant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const rl = checkRateLimit(`msg:${user.id}`, RATE_LIMITS.message);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many messages" }, { status: 429 });
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
    console.error("[API messages POST]", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }

  // Update sender's last_read_at to now
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  // Spam detection: flag if sender has sent ≥5 messages in the last 60s.
  // We do this after a successful insert so the message is never blocked —
  // only flagged for admin review.
  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", user.id)
    .gte("created_at", sixtySecondsAgo);

  if ((recentCount ?? 0) >= 5) {
    // Fire-and-forget: auto-file a spam report visible in the admin reports dashboard.
    // The upsert uses ignoreDuplicates so repeat offenses within the same conversation
    // don't create a new row (the unique_open partial index prevents it).
    supabase
      .from("reports")
      .upsert(
        {
          reporter_id: user.id,
          target_type: "conversation",
          target_id: conversationId,
          reason: "spam",
          body: `Auto-flagged: ${recentCount} messages in 60 seconds`,
          status: "open",
        },
        { onConflict: "reporter_id,target_type,target_id", ignoreDuplicates: true }
      )
      .then(null, (err: unknown) => console.error("[spam-flag]", err));
  }

  return NextResponse.json({ message }, { status: 201 });
}
