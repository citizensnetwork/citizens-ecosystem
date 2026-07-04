/**
 * Single source of truth for all "what kind of event is this?" decisions.
 *
 * Import from this module instead of writing inline string comparisons
 * like `event.status === "cancelled"`.  When the logic changes, it changes
 * here and every surface picks it up.
 *
 * Predicates accept minimal shapes so callers can pass a full Event,
 * a partial DB select result, or a ManagedEvent local type without casting.
 */

import type { EventStatus, EventVisibility } from "@/types/db";

// Minimal shapes accepted by each predicate group.
type WithStatus = { status: EventStatus | string };
type WithVisibility = { visibility: EventVisibility | string };
type WithCommunity = {
  community_contributor?: boolean | null;
  creator?: { role?: string | null } | null;
};
type WithCreatedBy = { created_by: string };

// ── Status predicates ─────────────────────────────────────────────────────────

export function isCancelledEvent(event: WithStatus): boolean {
  return event.status === "cancelled";
}

export function isDraftEvent(event: WithStatus): boolean {
  return event.status === "draft";
}

export function isPublishedEvent(event: WithStatus): boolean {
  return event.status === "published";
}

// ── Visibility predicates ─────────────────────────────────────────────────────

export function isPrivateEvent(event: WithVisibility): boolean {
  return event.visibility === "private";
}

// ── Community / contributor predicates ───────────────────────────────────────

/**
 * Returns true when the event was flagged as community-organised (posted by
 * a Citizen) AND the embedded creator is not an approved Contributor.
 *
 * Used to show the "★ Community" chip on map popups, cards, and detail panels.
 * Pass `creator: organiser` when using the EventOrganiser prop shape.
 */
export function isCommunityEvent(event: WithCommunity): boolean {
  return (
    !!event.community_contributor && event.creator?.role !== "contributor"
  );
}

// ── Ownership / editing predicates ───────────────────────────────────────────

/**
 * Returns true when the given user is allowed to edit this event:
 * either they created it, or they are an admin.
 */
export function canEditEvent(
  event: WithCreatedBy,
  userId: string | null | undefined,
  profile?: { role?: string | null } | null,
): boolean {
  if (!userId) return false;
  return event.created_by === userId || profile?.role === "admin";
}
