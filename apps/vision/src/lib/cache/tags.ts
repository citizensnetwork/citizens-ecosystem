import { revalidateTag } from "next/cache";

/**
 * Phase 14b cache-tag vocabulary.
 *
 * Defines the canonical cache tags used across the app so server
 * queries and revalidation calls stay in agreement. Tags are org-
 * scoped: when data in one tenant changes we must never invalidate
 * another tenant's cache.
 *
 * These helpers are intentionally light. We are NOT wiring every
 * fetch through `fetch(..., { next: { tags } })` in this phase —
 * that would be a large, risky change. Instead this module gives
 * the vocabulary and a single `invalidateOrg()` entry point so
 * future phases can opt specific queries into caching without
 * renaming tag strings across the codebase.
 */

export const orgTags = {
  /** Every org-scoped resource belongs to this wildcard tag. */
  all(orgId: string): string {
    return `org:${orgId}`;
  },
  activities(orgId: string): string {
    return `org:${orgId}:activities`;
  },
  projects(orgId: string): string {
    return `org:${orgId}:projects`;
  },
  goals(orgId: string): string {
    return `org:${orgId}:goals`;
  },
  members(orgId: string): string {
    return `org:${orgId}:members`;
  },
  departments(orgId: string): string {
    return `org:${orgId}:departments`;
  },
  metrics(orgId: string): string {
    return `org:${orgId}:metrics`;
  },
  vision(orgId: string): string {
    return `org:${orgId}:vision`;
  },
};

/**
 * Invalidate every cache entry tagged for this org. Use from server
 * actions and API mutations after a successful write. Cheap no-op
 * today because no fetch calls are tagged yet; wiring them in is a
 * later-phase concern.
 *
 * The `"default"` second argument is Next 16's cache-profile selector.
 * We pass the built-in default profile because the app does not yet
 * define custom profiles; future phases can introduce short-lived
 * profiles for metrics rollups without changing this call site.
 */
export function invalidateOrg(orgId: string): void {
  revalidateTag(orgTags.all(orgId), "default");
}

/** Narrower invalidation for a single resource class within an org. */
export function invalidateOrgResource(
  orgId: string,
  resource: Exclude<keyof typeof orgTags, "all">,
): void {
  revalidateTag(orgTags[resource](orgId), "default");
}
