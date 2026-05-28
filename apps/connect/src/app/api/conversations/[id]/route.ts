import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/conversations/[id]
 * Actions: accept | reject (message requests) | mute | unmute
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: conversationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isValidUUID(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  const rl = checkRateLimit(`conv-action:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { action: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { action } = body;
  if (!["accept", "reject", "mute", "unmute"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Verify the user is a participant
  const { data: participation } = await supabase
    .from("conversation_participants")
    .select("conversation_id, muted_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!participation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (action === "mute") {
    const { error } = await supabase
      .from("conversation_participants")
      .update({ muted_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[conversations PATCH mute]", error);
      return NextResponse.json({ error: "Failed to mute" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (action === "unmute") {
    const { error } = await supabase
      .from("conversation_participants")
      .update({ muted_at: null })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[conversations PATCH unmute]", error);
      return NextResponse.json({ error: "Failed to unmute" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // accept / reject — only applies to pending conversations
  const { data: conv } = await supabase
    .from("conversations")
    .select("status")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv || conv.status !== "pending") {
    return NextResponse.json({ error: "No pending request on this conversation" }, { status: 400 });
  }

  // Only the recipient may accept or reject. In a pending conversation the
  // initiator is the only one who has sent messages; require ≥1 total message
  // so an initiator with no messages sent can't auto-approve their own request.
  const [totalRes, userRes] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("sender_id", user.id),
  ]);

  if ((totalRes.count ?? 0) === 0 || (userRes.count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Only the recipient can respond to a message request" },
      { status: 403 },
    );
  }

  if (action === "accept") {
    const { error } = await supabase
      .from("conversations")
      .update({ status: "active" })
      .eq("id", conversationId);

    if (error) {
      console.error("[conversations PATCH accept]", error);
      return NextResponse.json({ error: "Failed to accept request" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (action === "reject") {
    // Deny: delete the whole conversation (both participants lose it)
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (error) {
      console.error("[conversations PATCH reject]", error);
      return NextResponse.json({ error: "Failed to reject request" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
}

/**
 * DELETE /api/conversations/[id]
 * Soft-remove this user from the conversation (they stop seeing it).
 * The conversation remains for the other participant.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id: conversationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isValidUUID(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  const rl = checkRateLimit(`conv-action:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { error } = await supabase
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[conversations DELETE]", error);
    return NextResponse.json({ error: "Failed to delete conversation" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
