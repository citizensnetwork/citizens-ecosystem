// /api/team-invites
//   GET  → list the authenticated user's pending team_memberships rows AND
//          pending team_owner_transfers rows targeted at them.
//   POST → accept or decline a single invite OR ownership transfer
//          (delegates to the matching SECURITY DEFINER RPC).

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

  // Run invite + transfer queries in parallel. Both filter to the viewer's
  // own pending rows server-side; RLS additionally enforces this.
  const [invitesResult, transfersResult] = await Promise.all([
    supabase
      .from("team_memberships")
      .select(
        "id, role, status, created_at, contributor_id, " +
          "contributor:profiles!team_memberships_contributor_id_fkey(full_name, avatar_url, contributor_slug)"
      )
      .eq("member_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("team_owner_transfers")
      .select(
        "id, status, created_at, contributor_id, proposed_by, " +
          "contributor:profiles!team_owner_transfers_contributor_id_fkey(full_name, avatar_url, contributor_slug)"
      )
      .eq("proposed_owner_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  if (invitesResult.error) {
    console.error("[team-invites] invites query failed", invitesResult.error);
    return NextResponse.json({ error: "Failed to load invites" }, { status: 500 });
  }
  if (transfersResult.error) {
    console.error("[team-invites] transfers query failed", transfersResult.error);
    return NextResponse.json({ error: "Failed to load transfers" }, { status: 500 });
  }

  return NextResponse.json({
    invites: invitesResult.data ?? [],
    owner_transfers: transfersResult.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`team-invites:${user.id}`, RATE_LIMITS.mutation);
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
  const kind = (raw.kind as string | undefined) ?? "invite";
  const action = raw.action as string;

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // ── Owner transfer accept / decline ───────────────────────────
  if (kind === "owner_transfer") {
    const transferId = raw.transfer_id as string;
    if (!isValidUUID(transferId)) {
      return NextResponse.json({ error: "Invalid transfer_id" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("respond_team_owner_transfer", {
      p_transfer_id: transferId,
      p_action: action,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("transfer_not_found")) {
        return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
      }
      if (msg.includes("transfer_already_resolved")) {
        return NextResponse.json({ error: "Transfer already responded" }, { status: 409 });
      }
      if (msg.includes("not_proposed_owner")) {
        return NextResponse.json({ error: "Not the proposed owner" }, { status: 403 });
      }
      if (msg.includes("no_current_owner")) {
        return NextResponse.json(
          { error: "Cannot transfer — no current owner found" },
          { status: 409 }
        );
      }
      if (msg.includes("invalid_action")) {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      }
      console.error("[team-invites] respond_team_owner_transfer failed", error);
      return NextResponse.json(
        { error: "Failed to respond to transfer" },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: data });
  }

  // ── Standard invite accept / decline ──────────────────────────
  const membershipId = raw.membership_id as string;
  if (!isValidUUID(membershipId)) {
    return NextResponse.json({ error: "Invalid membership_id" }, { status: 400 });
  }

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
