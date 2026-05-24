/**
 * Single source of truth for all "can this profile do X?" decisions.
 *
 * Import from this module instead of writing inline string comparisons
 * like `profile.role === "admin"`.  When the logic changes, it changes
 * here and every surface picks it up.
 *
 * All predicates accept a minimal shape so callers can pass a full
 * Profile, a partial DB select result, or the creator sub-object
 * embedded on Event / Place without needing to cast.
 */

import type { UserRole } from "@/types/db";

/**
 * Minimal profile shape accepted by all predicates.
 *
 * `role` is widened to `UserRole | string | null` (rather than `UserRole | null`)
 * so callers can pass raw Supabase query results whose `.role` column is typed
 * as `string` by the client without needing a type assertion at every call site.
 * Correctness at runtime is unaffected — comparisons still use string literals.
 */
export type MinProfile = {
  role?: UserRole | string | null;
  contributor_status?: string | null;
};

// ── Role checks ───────────────────────────────────────────────────────────────

export function isAdmin(profile: MinProfile | null | undefined): boolean {
  return profile?.role === "admin";
}

export function isContributor(profile: MinProfile | null | undefined): boolean {
  return profile?.role === "contributor";
}

export function isCitizen(profile: MinProfile | null | undefined): boolean {
  return profile?.role === "citizen";
}

/**
 * True for any role that is allowed to create events or manage places.
 * Intentionally role-only — `role='contributor'` is only set upon admin
 * approval, so this check is equivalent to "approved contributor or admin".
 */
export function canCreateEvents(
  profile: MinProfile | null | undefined,
): boolean {
  return profile?.role === "contributor" || profile?.role === "admin";
}

// ── Contributor-status checks ─────────────────────────────────────────────────

/**
 * Returns true when the profile belongs to an approved Contributor.
 * This is the canonical implementation — `isVerifiedContributor` in
 * `VerifiedBadge.tsx` delegates here for backward compatibility.
 */
export function isApprovedContributor(
  profile: MinProfile | null | undefined,
): boolean {
  if (!profile) return false;
  return (
    profile.role === "contributor" &&
    profile.contributor_status === "approved"
  );
}

/**
 * Returns true when the profile has a pending contributor application.
 *
 * NOTE: No role guard is applied here.  Pending applicants still have
 * `role='citizen'` — their role is only upgraded to 'contributor' upon
 * admin approval.  Adding a role guard would break this predicate.
 */
export function isPendingContributor(
  profile: MinProfile | null | undefined,
): boolean {
  return profile?.contributor_status === "pending";
}

/**
 * Returns true when the profile's most recent contributor application was
 * rejected.  Like isPendingContributor, no role guard — rejected users
 * return to role='citizen' but retain the status for UI feedback.
 */
export function isRejectedContributor(
  profile: MinProfile | null | undefined,
): boolean {
  return profile?.contributor_status === "rejected";
}
