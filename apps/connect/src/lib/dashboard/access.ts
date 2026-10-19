// Helper: check if a user has active dashboard access to a contributor profile.
// Returns: { isOwner, isAdminWithAccess, hasAccess, contributorId, teamRole }
//
// Ownership is sourced from `team_memberships.role='owner' AND status='active'`
// (Stage G.2). The legacy `user.id === contributor.id` check is retained as a
// defensive fallback for the rare case where migration 111's backfill missed a
// row — the trigger covers all new approvals so this should be unreachable in
// steady state.
//
// An active editor or viewer (migration 193) is granted access only when the
// listing is an approved contributor that is not hidden and not deleted.
// Pending, declined and removed memberships grant nothing. Hidden and deleted
// listings stay with the owner and with admins, as before.

import { createClient } from "@/lib/supabase/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { CONTRIBUTOR_ROLES } from "@/types/db";

export type TeamDashboardRole = "owner" | "editor" | "viewer";

export type DashboardAccessResult =
  | {
      hasAccess: true;
      isOwner: boolean;
      isAdminWithAccess: boolean;
      contributorId: string;
      /** 'owner' | 'editor' | 'viewer', or null when the only grant is an admin session. */
      teamRole: TeamDashboardRole | null;
    }
  | { hasAccess: false };

type ContributorRow = {
  id: string;
  role: string;
  contributor_status: string | null;
  contributor_hidden: boolean | null;
  deleted_at: string | null;
};

function listingIsOpen(contributor: ContributorRow): boolean {
  return (
    CONTRIBUTOR_ROLES.includes(contributor.role as (typeof CONTRIBUTOR_ROLES)[number]) &&
    contributor.contributor_status === "approved" &&
    contributor.contributor_hidden !== true &&
    !contributor.deleted_at
  );
}

export async function checkDashboardAccess(
  handle: string,
  request?: Request
): Promise<DashboardAccessResult> {
  // When the route hands us its Request we honour Bearer tokens too (the
  // cross-origin static frontend has no cookie); without it, behaviour is the
  // original cookie-only path so untouched callers are unaffected.
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string } | null;
  if (request) {
    const auth = await getRouteAuth(request);
    supabase = auth.supabase;
    user = auth.user;
  } else {
    supabase = await createClient();
    user = (await supabase.auth.getUser()).data.user;
  }
  if (!user) return { hasAccess: false };

  // Resolve handle → contributor profile. contributor_hidden and deleted_at
  // are public columns (mig 176); editors of a hidden or deleted listing get nothing.
  const { data: contributor } = await supabase
    .from("profiles")
    .select("id, role, contributor_status, contributor_hidden, deleted_at")
    .eq("contributor_slug", handle)
    .maybeSingle<ContributorRow>();

  if (!contributor) return { hasAccess: false };

  const open = listingIsOpen(contributor);
  if (!open) {
    // Admins can still access unapproved contributors (for review). A hidden
    // or deleted listing is not "unapproved": owners of those still pass the
    // membership check below, and editors do not.
    const blockedFromReview =
      !CONTRIBUTOR_ROLES.includes(contributor.role as (typeof CONTRIBUTOR_ROLES)[number]) ||
      contributor.contributor_status !== "approved";
    if (blockedFromReview) {
      const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: string }>();
      if (viewerProfile?.role !== "admin") return { hasAccess: false };
    }
  }

  // One active membership row per person (unique contributor_id, member_id).
  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("contributor_id", contributor.id)
    .eq("member_id", user.id)
    .eq("status", "active")
    .maybeSingle<{ role: string }>();

  const owner =
    membership?.role === "owner" || user.id === contributor.id;
  if (owner) {
    return {
      hasAccess: true,
      isOwner: true,
      isAdminWithAccess: false,
      contributorId: contributor.id,
      teamRole: "owner",
    };
  }

  if ((membership?.role === "editor" || membership?.role === "viewer") && open) {
    return {
      hasAccess: true,
      isOwner: false,
      isAdminWithAccess: false,
      contributorId: contributor.id,
      teamRole: membership.role === "editor" ? "editor" : "viewer",
    };
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
        teamRole: null,
      };
    }
  }

  return { hasAccess: false };
}
