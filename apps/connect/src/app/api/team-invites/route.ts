// /api/team-invites
//   GET  → list the authenticated user's pending team_memberships rows
//   POST → accept or decline a single invite (delegates to RPC)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("team_memberships")
    .select(
      "id, role, status, created_at, contributor_id, " +
        "contributor:profiles!team_memberships_contributor_id_fkey(full_name, avatar_url, contributor_slug)"
    )
    .eq("member_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load invites" }, { status: 500 });
  }

  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`team-invites:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const membershipId = raw.membership_id as string;
  const action = raw.action as string;

  if (!isValidUUID(membershipId)) {
    return NextResponse.json({ error: "Invalid membership_id" }, { status: 400 });
  }
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // SECURITY DEFINER RPC validates auth.uid()=member_id + status='pending'
  // server-side, writes the notification back to the contributor, and
  // appends an activity_log entry.
  const { data, error } = await supabase.rpc("respond_team_invite", {
    p_membership_id: membershipId,
    p_action: action,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("invite_not_found")) {
      return NextResponse.json({ error: "Invite not found or already responded" }, { status: 404 });
    }
    if (msg.includes("not_invitee")) {
      return NextResponse.json({ error: "Not your invite" }, { status: 403 });
    }
    if (msg.includes("invalid_action")) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    console.error("[team-invites] respond_team_invite failed", error);
    return NextResponse.json({ error: "Failed to respond to invite" }, { status: 500 });
  }

  return NextResponse.json({ status: data });
}
