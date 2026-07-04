import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Organisation, Department, UserOrgRole } from "@/types/db";

/**
 * Phase 14b domain query layer — organisations.
 *
 * Before this layer existed, org-by-slug resolution was re-implemented
 * in layout.tsx, the members settings page, the departments settings
 * page, and a handful of other server pages. Each copy used a slightly
 * different select() projection, and the client pages duplicated the
 * resolution via `/api/orgs` which returned a user's memberships
 * (not arbitrary org lookup by slug).
 *
 * All server-side org queries now route through this module so:
 *   - the select shape is consistent (and one place to change)
 *   - membership checks are co-located with the fetch
 *   - future caching via Next.js tags is additive rather than a
 *     scatter-refactor
 *
 * These functions expect an authenticated SupabaseClient passed in
 * by the caller (usually from requireUser/requireOrgMember). They do
 * NOT perform auth themselves — that belongs in the auth layer.
 */

export async function getOrgBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<Organisation | null> {
  const { data } = await supabase
    .from("organisations")
    .select("*")
    .eq("slug", slug)
    .single();
  return (data as Organisation | null) ?? null;
}

export async function getUserMembership(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<UserOrgRole | null> {
  const { data } = await supabase
    .from("user_org_roles")
    .select("*")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();
  return (data as UserOrgRole | null) ?? null;
}

export async function listOrgMembers(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Array<UserOrgRole & { departments?: { name: string } | null }>> {
  const { data } = await supabase
    .from("user_org_roles")
    .select("*, departments(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Array<
    UserOrgRole & { departments?: { name: string } | null }
  >;
}

export async function listOrgDepartments(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Department[]> {
  const { data } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", orgId)
    .order("name");
  return (data ?? []) as Department[];
}

/**
 * Composite fetch used by the settings pages — resolves the org,
 * validates membership, and returns everything the page needs in
 * one round trip's worth of parallel queries.
 *
 * Returns `null` for the whole result if the org does not exist or
 * the user is not a member; callers can then `redirect("/")`.
 */
export async function getOrgSettingsBundle(
  supabase: SupabaseClient,
  userId: string,
  orgSlug: string,
): Promise<{
  org: Organisation;
  membership: UserOrgRole;
  members: Array<UserOrgRole & { departments?: { name: string } | null }>;
  departments: Department[];
} | null> {
  const org = await getOrgBySlug(supabase, orgSlug);
  if (!org) return null;

  const membership = await getUserMembership(supabase, userId, org.id);
  if (!membership) return null;

  const [members, departments] = await Promise.all([
    listOrgMembers(supabase, org.id),
    listOrgDepartments(supabase, org.id),
  ]);

  return { org, membership, members, departments };
}
