// Helper: check if a user has active dashboard access to a contributor profile
// Returns: { isOwner, isAdminWithAccess, hasAccess }

import { createClient } from "@/lib/supabase/server";

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
    contributor.role !== "contributor" ||
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

  // Owner check
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
