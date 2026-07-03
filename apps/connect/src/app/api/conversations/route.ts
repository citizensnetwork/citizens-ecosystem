import { getRouteAuth } from "@/lib/supabase/route";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/** GET — list current user's conversations with preview */
export async function GET(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`conv-list:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  // Get all conversations the user is part of
  const { data: participations, error: partError } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at, muted_at")
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
  const mutedMap = Object.fromEntries(
    participations.map((p) => [p.conversation_id, p.muted_at])
  );

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
    supabase
      .from("conversations")
      .select("id, updated_at, status")
      .in("id", convIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("conversation_participants")
      .select("conversation_id, user_id, profiles(id, full_name, avatar_url, deleted_at, contributor_status)")
      .in("conversation_id", convIds)
      .neq("user_id", user.id),
    supabase
      .from("messages")
      .select("conversation_id, body, sender_id, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false }),
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

  const participantMap = new Map<string, { id: string; full_name: string; avatar_url: string | null; deleted_at: string | null; is_contributor: boolean }>();
  for (const p of allParticipants || []) {
    const profile = p.profiles as unknown as { id: string; full_name: string; avatar_url: string | null; deleted_at: string | null; contributor_status?: string | null };
    if (profile) {
      participantMap.set(p.conversation_id, {
        ...profile,
        is_contributor: profile.contributor_status === "approved",
      });
    }
  }

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
      status: conv.status,
      muted: !!mutedMap[conv.id],
      other_user: participantMap.get(conv.id) || { id: "", full_name: "Unknown", avatar_url: null, deleted_at: null, is_contributor: false },
      last_message: latestMessageMap.get(conv.id) || null,
      unread_count: unreadMap.get(conv.id) || 0,
    }))
    .filter((p) => p.other_user.id !== "");

  return NextResponse.json({ conversations: previews });
}

/** POST — start or retrieve a conversation with another user */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);

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

  const rl = await checkRateLimit(`conv:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Check if a conversation already exists — if so, return it without re-checking permissions
  const { data: existingConvId } = await supabase.rpc("find_conversation", {
    user_a: user.id,
    user_b: recipient_id,
  });

  if (existingConvId) {
    return NextResponse.json({ conversation_id: existingConvId }, { status: 200 });
  }

  // Fetch sender + recipient profiles in parallel
  const [senderResult, recipientResult] = await Promise.all([
    supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("id, role").eq("id", recipient_id).maybeSingle(),
  ]);

  if (!recipientResult.data) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }

  const senderRole = senderResult.data?.role ?? "citizen";
  const recipientRole = recipientResult.data.role;

  // Check bilateral block
  const { data: blocked } = await supabase.rpc("is_blocked", {
    user_a: user.id,
    user_b: recipient_id,
  });

  if (blocked) {
    return NextResponse.json({ error: "Cannot message this user" }, { status: 400 });
  }

  // Determine conversation status based on permission rules:
  //   Contributor → Citizen: only allowed if citizen has prior interaction; starts as 'pending'
  //   All other combinations: 'active'
  let convStatus: "pending" | "active" = "active";

  if (senderRole === "contributor" && recipientRole === "citizen") {
    // Fetch events + places owned by this contributor so we can check citizen interactions
    const [eventsResult, placesResult] = await Promise.all([
      supabase.from("events").select("id").eq("created_by", user.id),
      supabase.from("places").select("id").eq("created_by", user.id),
    ]);

    const eventIds = (eventsResult.data ?? []).map((e) => e.id);
    const placeIds = (placesResult.data ?? []).map((p) => p.id);

    // Check if citizen has RSVP'd any of this contributor's events, directly follows them,
    // or follows any of their places
    const [rsvpResult, followResult, placeFollowResult] = await Promise.all([
      eventIds.length > 0
        ? supabase
            .from("rsvps")
            .select("event_id", { count: "exact", head: true })
            .eq("user_id", recipient_id)
            .in("event_id", eventIds)
        : Promise.resolve({ count: 0, error: null }),
      supabase
        .from("follows")
        .select("followee_id", { count: "exact", head: true })
        .eq("follower_id", recipient_id)
        .eq("followee_id", user.id),
      placeIds.length > 0
        ? supabase
            .from("place_follows")
            .select("place_id", { count: "exact", head: true })
            .eq("user_id", recipient_id)
            .in("place_id", placeIds)
        : Promise.resolve({ count: 0, error: null }),
    ]);

    const hasInteracted =
      (rsvpResult.count ?? 0) > 0 ||
      (followResult.count ?? 0) > 0 ||
      (placeFollowResult.count ?? 0) > 0;

    if (!hasInteracted) {
      return NextResponse.json(
        { error: "You can only message citizens who have interacted with your events or places" },
        { status: 403 },
      );
    }

    convStatus = "pending";
  }

  // Create the conversation with the determined status
  const { data: convId, error: rpcError } = await supabase.rpc("find_or_create_conversation", {
    user_a: user.id,
    user_b: recipient_id,
    p_status: convStatus,
  });

  if (rpcError || !convId) {
    console.error("[API conversations POST]", rpcError);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }

  return NextResponse.json({ conversation_id: convId }, { status: 201 });
}
