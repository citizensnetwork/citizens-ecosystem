import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const VALID_ROLES = ["editor", "viewer"] as const;

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
      .eq("status", "active")
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
 * POST /api/contributor/[handle]/team — add member by searching profiles.
 * Body: { action: "search" | "invite", query?: string, member_id?: string, role?: "editor"|"viewer" }
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

  // Search for users by name, user ID, or email
  if (action === "search") {
    const nameQuery = typeof raw.name === "string" ? raw.name.trim().slice(0, 100) : "";
    const idQuery = typeof raw.user_id === "string" ? raw.user_id.trim() : "";
    const emailQuery = typeof raw.email === "string" ? raw.email.trim().toLowerCase().slice(0, 200) : "";

    if (!nameQuery && !idQuery && !emailQuery) {
      return NextResponse.json({ error: "At least one search field required" }, { status: 400 });
    }

    let query = supabase
      .from("profiles")
      .select("id, full_name, avatar_url, email")
      .neq("id", contributorId)
      .limit(10);

    if (idQuery && isValidUUID(idQuery)) {
      query = query.eq("id", idQuery);
    } else if (emailQuery) {
      query = query.ilike("email", `%${emailQuery}%`);
    } else if (nameQuery) {
      query = query.ilike("full_name", `%${nameQuery}%`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    return NextResponse.json({ results: data ?? [] });
  }

  // Add a team member
  if (action === "invite") {
    const memberId = raw.member_id as string;
    const role = raw.role as string;

    if (!isValidUUID(memberId)) {
      return NextResponse.json({ error: "Invalid member_id" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Prevent adding owner as a member
    if (memberId === contributorId) {
      return NextResponse.json({ error: "Cannot add yourself as a team member" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("team_memberships")
      .upsert(
        {
          contributor_id: contributorId,
          member_id: memberId,
          role,
          status: "active",
          invited_by: user.id,
        },
        { onConflict: "contributor_id,member_id" }
      )
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to add team member" }, { status: 500 });
    }

    await recordContributorMutation(supabase, {
      handle,
      access,
      actorId: user.id,
      action: "team_member_added",
      entityType: "team_membership",
      entityId: data.id,
      metadata: { member_id: memberId, role },
    });

    return NextResponse.json({ id: data.id }, { status: 201 });
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
    if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
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
