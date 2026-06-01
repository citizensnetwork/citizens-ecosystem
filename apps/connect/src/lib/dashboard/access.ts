// Helper: check if a user has active dashboard access to a contributor profile
// Returns: { isOwner, isAdminWithAccess, hasAccess, contributorId }
//
// Ownership is sourced from `team_memberships.role='owner' AND status='active'`
// (Stage G.2). The legacy `user.id === contributor.id` check is retained as a
// defensive fallback for the rare case where migration 111's backfill missed a
// row — the trigger covers all new approvals so this should be unreachable in
// steady state.

import { createClient } from "@/lib/supabase/server";
import { CONTRIBUTOR_ROLES } from "@/types/db";

export type DashboardAccessResult =
  | { hasAccess: true; isOwner: boolean; isAdminWithAccess: boolean; contributorId: string }
  | { hasAccess: false };

export async function checkDashboardAccess(
  handle: string
): Promise<DashboardAccessResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { hasAccess: false };

  // Resolve handle → contributor profile
  const { data: contributor } = await supabase
    .from("profiles")
    .select("id, role, contributor_status")
    .eq("contributor_slug", handle)
    .maybeSingle<{ id: string; role: string; contributor_status: string | null }>();

  if (!contributor) return { hasAccess: false };
  if (
    !CONTRIBUTOR_ROLES.includes(contributor.role as (typeof CONTRIBUTOR_ROLES)[number]) ||
    contributor.contributor_status !== "approved"
  ) {
    // Admins can still access unapproved contributors (for review)
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string }>();
    if (viewerProfile?.role !== "admin") return { hasAccess: false };
  }

  // Owner check — team_memberships is the source of truth post Stage G.2.
  const { data: ownerRow } = await supabase
    .from("team_memberships")
    .select("id")
    .eq("contributor_id", contributor.id)
    .eq("member_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle<{ id: string }>();

  if (ownerRow) {
    return { hasAccess: true, isOwner: true, isAdminWithAccess: false, contributorId: contributor.id };
  }

  // Defensive fallback for contributors created before migration 111's backfill
  // or where the trigger hasn't fired yet. Same self-id check as before.
  if (user.id === contributor.id) {
    return { hasAccess: true, isOwner: true, isAdminWithAccess: false, contributorId: contributor.id };
  }

  // Admin with granted access check
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  if (viewerProfile?.role === "admin") {
    const { data: accessRow } = await supabase
      .from("contributor_access_requests")
      .select("id, expires_at, revoked_at")
      .eq("contributor_id", contributor.id)
      .eq("admin_id", user.id)
      .eq("status", "approved")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<{ id: string; expires_at: string; revoked_at: string | null }>();

    if (accessRow) {
      return {
        hasAccess: true,
        isOwner: false,
        isAdminWithAccess: true,
        contributorId: contributor.id,
      };
    }
  }

  return { hasAccess: false };
}
