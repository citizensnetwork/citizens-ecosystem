import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * RBAC roles recognised by Citizens Vision.
 *
 * Mirrors the CHECK constraint on `user_org_roles.role` in
 * `supabase/migrations/001_foundation.sql`.
 */
export type OrgRole =
  | "platform_admin"
  | "org_admin"
  | "org_manager"
  | "org_member"
  | "org_viewer";

export interface OrgMembership {
  role: OrgRole;
}

/**
 * Discriminated result returned by {@link requireOrgRole}.
 *
 * API routes use this shape so role gating is a single line:
 *
 * ```ts
 * const auth = await requireOrgRole(supabase, user.id, orgId, [
 *   "org_admin",
 *   "org_manager",
 * ]);
 * if (!auth.ok) return auth.response;
 * const role = auth.membership.role;
 * ```
 */
export type RequireOrgRoleResult =
  | { ok: true; membership: OrgMembership }
  | { ok: false; response: NextResponse };

/**
 * Verifies that `userId` is a member of `orgId` and holds one of
 * `allowedRoles`. Returns the membership on success, otherwise a
 * ready-to-return 403 {@link NextResponse}.
 *
 * Centralises the `["org_admin", "org_manager"].includes(membership.role)`
 * pattern that was previously copy-pasted across API routes.
 */
export async function requireOrgRole(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  allowedRoles: readonly OrgRole[],
): Promise<RequireOrgRoleResult> {
  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      ),
    };
  }

  const role = membership.role as OrgRole;
  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, membership: { role } };
}
