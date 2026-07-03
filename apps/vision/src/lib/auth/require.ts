import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { requireOrgRole, type OrgRole } from "@/lib/supabase/rbac";

/**
 * Phase 14b auth consolidation helpers.
 *
 * Before Phase 14b every API route repeated:
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user) return NextResponse.json({ error: "Unauthorized" }, 401);
 *   // then maybe an org membership check
 *   // then maybe a role check
 *
 * The scatter made it impossible to add cross-cutting concerns (audit
 * logging, rate limiting, structured errors) in one place, and made
 * it easy to introduce a route that forgot to check org membership.
 *
 * These helpers centralise that flow. API routes now look like:
 *
 *   const ctx = await requireOrgMember(orgId);
 *   if (!ctx.ok) return ctx.response;
 *   const { supabase, user } = ctx;
 *
 * or for role-gated mutations:
 *
 *   const ctx = await requireOrgRoleForRequest(orgId, ["org_admin"]);
 *   if (!ctx.ok) return ctx.response;
 */

export type AuthSuccess = {
  ok: true;
  supabase: SupabaseClient;
  user: User;
};

export type AuthSuccessWithRole = AuthSuccess & {
  role: OrgRole;
};

export type AuthFailure = {
  ok: false;
  response: NextResponse;
};

/**
 * Authenticated user context only. Returns 401 if no user session.
 *
 * Use this for routes that operate on data the user owns
 * independent of any organisation scope (e.g. listing the user's
 * own memberships).
 */
export async function requireUser(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, supabase, user };
}

/**
 * Validates that the request supplies a non-empty, syntactically
 * valid UUID for `orgId`. Centralises the "Valid org_id is required"
 * 400 response that was copy-pasted across every org-scoped route.
 *
 * Returns the orgId when valid, or a ready-to-return NextResponse
 * on failure.
 */
export function validateOrgId(
  orgId: string | null | undefined,
): { ok: true; orgId: string } | AuthFailure {
  if (!orgId || !isValidUUID(orgId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Valid org_id is required" },
        { status: 400 },
      ),
    };
  }
  return { ok: true, orgId };
}

/**
 * Authenticated user who is a member of `orgId` in any role.
 *
 * Failure modes:
 *   - 400 if orgId is missing/invalid
 *   - 401 if no user session
 *   - 403 if the user has no membership row for this org
 */
export async function requireOrgMember(
  orgId: string | null | undefined,
): Promise<AuthSuccessWithRole | AuthFailure> {
  const validOrg = validateOrgId(orgId);
  if (!validOrg.ok) return validOrg;

  const authed = await requireUser();
  if (!authed.ok) return authed;

  const { supabase, user } = authed;
  const authz = await requireOrgRole(supabase, user.id, validOrg.orgId, [
    "platform_admin",
    "org_admin",
    "org_manager",
    "org_member",
    "org_viewer",
  ]);
  if (!authz.ok) return authz;

  return { ok: true, supabase, user, role: authz.membership.role };
}

/**
 * Authenticated user who is a member of `orgId` AND holds one of
 * the supplied roles. Thin wrapper around {@link requireOrgRole}
 * that also handles the 401 and 400 (invalid org_id) cases so the
 * caller has a single result to branch on.
 */
export async function requireOrgRoleForRequest(
  orgId: string | null | undefined,
  allowedRoles: readonly OrgRole[],
): Promise<AuthSuccessWithRole | AuthFailure> {
  const validOrg = validateOrgId(orgId);
  if (!validOrg.ok) return validOrg;

  const authed = await requireUser();
  if (!authed.ok) return authed;

  const { supabase, user } = authed;
  const authz = await requireOrgRole(
    supabase,
    user.id,
    validOrg.orgId,
    allowedRoles,
  );
  if (!authz.ok) return authz;

  return { ok: true, supabase, user, role: authz.membership.role };
}
