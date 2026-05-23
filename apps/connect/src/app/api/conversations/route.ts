import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/** GET — list current user's conversations with preview */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`conv-list:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  // Get all conversations the user is part of
  const { data: participations, error: partError } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", user.id);

  if (partError) {
    console.error("[API conversations GET]", partError);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }

  if (!participations || participations.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const convIds = participations.map((p) => p.conversation_id);
  const lastReadMap = Object.fromEntries(
    participations.map((p) => [p.conversation_id, p.last_read_at])
  );

  // Parallelize independent queries
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

  const [convResult, partResult, msgResult, unreadResult] = await Promise.all([
    supabase.from("conversations").select("id, updated_at").in("id", convIds).order("updated_at", { ascending: false }),
    supabase.from("conversation_participants").select("conversation_id, user_id, profiles(id, full_name, avatar_url)").in("conversation_id", convIds).neq("user_id", user.id),
    supabase.from("messages").select("conversation_id, body, sender_id, created_at").in("conversation_id", convIds).order("created_at", { ascending: false }),
    unreadQuery,
  ]);

  if (convResult.error) { console.error("[API conversations GET] convResult", convResult.error); return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 }); }
  if (partResult.error) { console.error("[API conversations GET] partResult", partResult.error); return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 }); }
  if (msgResult.error) { console.error("[API conversations GET] msgResult", msgResult.error); return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 }); }
  if (unreadResult.error) { console.error("[API conversations GET] unreadResult", unreadResult.error); return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 }); }

  const conversations = convResult.data;
  const allParticipants = partResult.data;
  const latestMessages = msgResult.data;
  const allMessages = unreadResult.data;

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

  const rl = checkRateLimit(`conv:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Check recipient exists
  const { data: recipient } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", recipient_id)
    .maybeSingle();

  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }

  // Atomically find or create conversation (prevents TOCTOU race)
  const { data: convId, error: rpcError } = await supabase.rpc("find_or_create_conversation", {
    user_a: user.id,
    user_b: recipient_id,
  });

  if (rpcError || !convId) {
    console.error("[API conversations POST]", rpcError);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }

  return NextResponse.json({ conversation_id: convId }, { status: 201 });
}
