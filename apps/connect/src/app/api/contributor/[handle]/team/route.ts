import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const VALID_ROLES = ["editor", "viewer"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ProfileSearchRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

/** GET /api/contributor/[handle]/team */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();

  const [membersResult, volunteersResult] = await Promise.all([
    supabase
      .from("team_memberships")
      .select(
        "id, member_id, role, status, created_at, member:profiles!team_memberships_member_id_fkey(full_name, avatar_url, email)"
      )
      .eq("contributor_id", contributorId)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: false }),

    supabase
      .from("volunteer_applications")
      .select(
        "id, applicant_id, entity_type, entity_id, message, status, response_message, created_at, applicant:profiles!volunteer_applications_applicant_id_fkey(full_name, avatar_url)"
      )
      .eq("contributor_id", contributorId)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    members: membersResult.data ?? [],
    volunteers: volunteersResult.data ?? [],
  });
}

/**
 * POST /api/contributor/[handle]/team
 * Body shape (one of):
 *   { action: "search", name?: string, email?: string, user_id?: string }
 *   { action: "invite", member_id: uuid, role: "editor"|"viewer" }
 *   { action: "propose_owner_transfer", member_id: uuid }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`team:${user.id}`, RATE_LIMITS.mutation);
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
  const action = raw.action as string;

  // ── search: combined name + email + user_id ─────────────────────
  if (action === "search") {
    const nameQuery = typeof raw.name === "string"
      ? sanitiseLike(raw.name).slice(0, 100)
      : "";
    const emailQuery = typeof raw.email === "string"
      ? sanitiseLike(raw.email.toLowerCase()).slice(0, 200)
      : "";
    const idQuery = typeof raw.user_id === "string" ? raw.user_id.trim() : "";

    if (!nameQuery && !emailQuery && !idQuery) {
      return NextResponse.json(
        { error: "At least one search field required" },
        { status: 400 }
      );
    }

    if (idQuery && !isValidUUID(idQuery)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    if (emailQuery && !EMAIL_RE.test(emailQuery) && emailQuery.length < 3) {
      // Allow short partial substrings (>=3 chars) but reject 1-2 char noise.
      return NextResponse.json({ error: "Email search too short" }, { status: 400 });
    }

    // Fire each scoped query in parallel; PostgREST `or()` here would force a
    // single ILIKE across multiple columns which is harder to reason about and
    // bypasses the per-column rate-of-results limit.
    const queries: PromiseLike<{ data: ProfileSearchRow[] | null }>[] = [];
    if (idQuery) {
      queries.push(
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, email")
          .eq("id", idQuery)
          .neq("id", contributorId)
          .limit(1)
          .returns<ProfileSearchRow[]>()
      );
    }
    if (emailQuery) {
      queries.push(
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, email")
          .ilike("email", `%${emailQuery}%`)
          .neq("id", contributorId)
          .limit(10)
          .returns<ProfileSearchRow[]>()
      );
    }
    if (nameQuery) {
      queries.push(
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, email")
          .ilike("full_name", `%${nameQuery}%`)
          .neq("id", contributorId)
          .limit(10)
          .returns<ProfileSearchRow[]>()
      );
    }

    const settled = await Promise.all(queries);
    const merged = new Map<string, ProfileSearchRow>();
    for (const res of settled) {
      for (const row of res.data ?? []) {
        if (!merged.has(row.id)) merged.set(row.id, row);
      }
    }

    return NextResponse.json({ results: Array.from(merged.values()).slice(0, 20) });
  }

  // ── invite: create a pending team_memberships row + notify ──────
  if (action === "invite") {
    const memberId = raw.member_id as string;
    const role = raw.role as string;

    if (!isValidUUID(memberId)) {
      return NextResponse.json({ error: "Invalid member_id" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role as ValidRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (memberId === contributorId) {
      return NextResponse.json(
        { error: "Cannot add yourself as a team member" },
        { status: 400 }
      );
    }

    // Block re-invite while a pending or active row exists. Upsert below would
    // silently overwrite which is confusing for the user.
    const { data: existing } = await supabase
      .from("team_memberships")
      .select("id, status")
      .eq("contributor_id", contributorId)
      .eq("member_id", memberId)
      .maybeSingle<{ id: string; status: string }>();

    if (existing && existing.status !== "declined" && existing.status !== "removed") {
      return NextResponse.json(
        { error: existing.status === "pending" ? "Invite already pending" : "Already on team" },
        { status: 409 }
      );
    }

    // Re-invite path: overwrite a prior declined/removed row.
    const upsertPayload = {
      contributor_id: contributorId,
      member_id: memberId,
      role,
      status: "pending",
      invited_by: user.id,
      responded_at: null,
    };

    const { data, error } = await supabase
      .from("team_memberships")
      .upsert(upsertPayload, { onConflict: "contributor_id,member_id" })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
    }

    // Fire-and-forget invitee notification. Uses service role because the
    // notifications RLS insert policy is admin-only and contributors are not
    // admins. Best-effort: log failure but don't fail the invite.
    await sendInviteNotification({
      inviteeId: memberId,
      contributorId,
      handle,
      role: role as ValidRole,
      membershipId: data.id,
    });

    await recordContributorMutation(supabase, {
      handle,
      access,
      actorId: user.id,
      action: "team_member_invited",
      entityType: "team_membership",
      entityId: data.id,
      metadata: { member_id: memberId, role },
    });

    return NextResponse.json({ id: data.id }, { status: 201 });
  }

  // ── propose_owner_transfer: atomic (writes team_owner_transfers row) ──
  // Stage G.2: delegates to the SECURITY DEFINER RPC which validates that the
  // caller is the active owner per team_memberships, that the transferee is
  // an active non-owner member, and inserts the proposal row idempotently
  // (cancelling any other pending proposal for this contributor).
  if (action === "propose_owner_transfer") {
    const memberId = raw.member_id as string;

    if (!isValidUUID(memberId)) {
      return NextResponse.json({ error: "Invalid member_id" }, { status: 400 });
    }
    if (memberId === contributorId) {
      return NextResponse.json(
        { error: "You are already the owner" },
        { status: 400 }
      );
    }
    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Only the current owner can propose an ownership transfer" },
        { status: 403 }
      );
    }

    const { data: transferId, error: rpcError } = await supabase.rpc(
      "propose_team_owner_transfer",
      {
        p_contributor_id: contributorId,
        p_proposed_owner_id: memberId,
      }
    );

    if (rpcError) {
      const msg = rpcError.message ?? "";
      if (msg.includes("not_owner")) {
        return NextResponse.json(
          { error: "Only the current owner can propose an ownership transfer" },
          { status: 403 }
        );
      }
      if (msg.includes("proposed_owner_not_active_member")) {
        return NextResponse.json(
          { error: "Proposed owner must be an active team member first" },
          { status: 400 }
        );
      }
      if (msg.includes("invalid_proposal")) {
        return NextResponse.json(
          { error: "Invalid proposal" },
          { status: 400 }
        );
      }
      console.error("[team] propose_team_owner_transfer failed", rpcError);
      return NextResponse.json(
        { error: "Failed to propose transfer" },
        { status: 500 }
      );
    }

    return NextResponse.json({ proposed: true, transfer_id: transferId }, { status: 202 });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/** PATCH /api/contributor/[handle]/team — update role or remove member. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`team:${user.id}`, RATE_LIMITS.mutation);
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

  if (!isValidUUID(membershipId)) {
    return NextResponse.json({ error: "Invalid membership_id" }, { status: 400 });
  }

  const action = raw.action as string;

  if (action === "remove") {
    const { error } = await supabase
      .from("team_memberships")
      .update({ status: "removed" })
      .eq("id", membershipId)
      .eq("contributor_id", contributorId);

    if (error) {
      return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
    }
    await recordContributorMutation(supabase, {
      handle,
      access,
      actorId: user.id,
      action: "team_member_removed",
      entityType: "team_membership",
      entityId: membershipId,
    });
    return NextResponse.json({ success: true });
  }

  if (action === "change_role") {
    const role = raw.role as string;
    if (!VALID_ROLES.includes(role as ValidRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const { error } = await supabase
      .from("team_memberships")
      .update({ role })
      .eq("id", membershipId)
      .eq("contributor_id", contributorId);

    if (error) {
      return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
    }
    await recordContributorMutation(supabase, {
      handle,
      access,
      actorId: user.id,
      action: "team_member_role_changed",
      entityType: "team_membership",
      entityId: membershipId,
      metadata: { role },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ─── helpers ─────────────────────────────────────────────────────

/** Strip Postgres LIKE wildcards from a user-supplied search string so they
 *  cannot bypass `%term%` framing or DoS the planner with leading `%`. */
function sanitiseLike(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, "") // control chars
    .replace(/[%_\\]/g, "")           // LIKE wildcards
    .trim();
}

interface SendInviteNotificationInput {
  inviteeId: string;
  contributorId: string;
  handle: string;
  role: ValidRole;
  membershipId: string;
}

async function sendInviteNotification(input: SendInviteNotificationInput): Promise<void> {
  const { inviteeId, contributorId, handle, role, membershipId } = input;

  try {
    const admin = createAdminClient();
    const { data: contributor } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", contributorId)
      .maybeSingle<{ full_name: string | null }>();

    const orgName = contributor?.full_name ?? "A contributor";

    await admin.from("notifications").insert({
      user_id: inviteeId,
      type: "team_invite",
      title: "You've been invited to a team",
      body: `${orgName} invited you to join as ${role}.`,
      data: {
        membership_id: membershipId,
        contributor_id: contributorId,
        contributor_handle: handle,
        role,
        url: "/account/team-invites",
      },
    });
  } catch (error) {
    console.error("[team] sendInviteNotification failed", error);
  }
}

