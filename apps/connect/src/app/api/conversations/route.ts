import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

/** GET — list current user's conversations with preview */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all conversations the user is part of
  const { data: participations, error: partError } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", user.id);

  if (partError) {
    return NextResponse.json({ error: partError.message }, { status: 500 });
  }

  if (!participations || participations.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const convIds = participations.map((p) => p.conversation_id);
  const lastReadMap = Object.fromEntries(
    participations.map((p) => [p.conversation_id, p.last_read_at])
  );

  // Get conversation details
  const { data: conversations, error: convError } = await supabase
    .from("conversations")
    .select("id, updated_at")
    .in("id", convIds)
    .order("updated_at", { ascending: false });

  if (convError) {
    return NextResponse.json({ error: convError.message }, { status: 500 });
  }

  // Get other participants
  const { data: allParticipants, error: apError } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id, profiles(id, full_name, avatar_url)")
    .in("conversation_id", convIds)
    .neq("user_id", user.id);

  if (apError) {
    return NextResponse.json({ error: apError.message }, { status: 500 });
  }

  // Get latest message per conversation
  const { data: latestMessages, error: msgError } = await supabase
    .from("messages")
    .select("conversation_id, body, sender_id, created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false });

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Get unread counts — only fetch messages newer than the oldest last_read_at
  const lastReadValues = Object.values(lastReadMap).filter(Boolean) as string[];
  const minLastRead = lastReadValues.length > 0
    ? lastReadValues.reduce((min, lr) => (lr < min ? lr : min))
    : null;

  let unreadQuery = supabase
    .from("messages")
    .select("conversation_id, created_at")
    .in("conversation_id", convIds)
    .neq("sender_id", user.id);

  if (minLastRead) {
    unreadQuery = unreadQuery.gt("created_at", minLastRead);
  }

  const { data: allMessages, error: allMsgError } = await unreadQuery;

  if (allMsgError) {
    return NextResponse.json({ error: allMsgError.message }, { status: 500 });
  }

  // Build the preview list
  const participantMap = new Map<string, { id: string; full_name: string; avatar_url: string | null }>();
  for (const p of allParticipants || []) {
    const profile = p.profiles as unknown as { id: string; full_name: string; avatar_url: string | null };
    if (profile) {
      participantMap.set(p.conversation_id, profile);
    }
  }

  // Deduplicate latest messages (first occurrence per conversation_id)
  const latestMessageMap = new Map<string, { body: string; sender_id: string | null; created_at: string }>();
  for (const msg of latestMessages || []) {
    if (!latestMessageMap.has(msg.conversation_id)) {
      latestMessageMap.set(msg.conversation_id, {
        body: msg.body,
        sender_id: msg.sender_id,
        created_at: msg.created_at,
      });
    }
  }

  // Count unread per conversation
  const unreadMap = new Map<string, number>();
  for (const msg of allMessages || []) {
    const lastRead = lastReadMap[msg.conversation_id];
    if (lastRead && new Date(msg.created_at) > new Date(lastRead)) {
      unreadMap.set(msg.conversation_id, (unreadMap.get(msg.conversation_id) || 0) + 1);
    }
  }

  const previews = (conversations || [])
    .map((conv) => ({
      id: conv.id,
      updated_at: conv.updated_at,
      other_user: participantMap.get(conv.id) || { id: "", full_name: "Unknown", avatar_url: null },
      last_message: latestMessageMap.get(conv.id) || null,
      unread_count: unreadMap.get(conv.id) || 0,
    }))
    .filter((p) => p.other_user.id !== "");

  return NextResponse.json({ conversations: previews });
}

/** POST — start or retrieve a conversation with another user */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { recipient_id } = body;

  if (!isValidUUID(recipient_id)) {
    return NextResponse.json({ error: "Invalid recipient ID" }, { status: 400 });
  }

  if (recipient_id === user.id) {
    return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
  }

  // Check recipient exists
  const { data: recipient } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", recipient_id)
    .single();

  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }

  // Check if conversation already exists
  const { data: existingConvId } = await supabase.rpc("find_conversation", {
    user_a: user.id,
    user_b: recipient_id,
  });

  if (existingConvId) {
    return NextResponse.json({ conversation_id: existingConvId });
  }

  // Create new conversation
  // NOTE: TOCTOU race — concurrent requests could create duplicate conversations.
  // A DB-level unique constraint on participant pairs would prevent this.
  const { data: newConv, error: createError } = await supabase
    .from("conversations")
    .insert({})
    .select("id")
    .single();

  if (createError || !newConv) {
    return NextResponse.json({ error: createError?.message || "Failed to create conversation" }, { status: 500 });
  }

  // Add both participants
  const { error: partError } = await supabase
    .from("conversation_participants")
    .insert([
      { conversation_id: newConv.id, user_id: user.id },
      { conversation_id: newConv.id, user_id: recipient_id },
    ]);

  if (partError) {
    return NextResponse.json({ error: partError.message }, { status: 500 });
  }

  return NextResponse.json({ conversation_id: newConv.id }, { status: 201 });
}
