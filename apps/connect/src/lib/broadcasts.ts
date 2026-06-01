/**
 * Broadcast reaction constants.
 *
 * Anonymous broadcast reactions (docs/feature-clarity/notifications.md):
 *   "Broadcast cards in event view should support anonymous reactions. Use
 *    five fixed emoji options with visible counts beneath the lower edge of
 *    the broadcast card; store reaction counts without exposing reacting
 *    user identities in the UI."
 *
 * This is the single source of truth for the five allowed emoji. The same
 * list is enforced server-side by the `increment_broadcast_reaction` RPC
 * (migration 128) and the POST /api/broadcasts/[id]/react route, and rendered
 * by the BroadcastReactions client component. Do not hard-code the emoji
 * inline anywhere else.
 */
export const BROADCAST_REACTION_EMOJI = ["🙏", "❤️", "🎉", "🙌", "🔥"] as const;

export type BroadcastReactionEmoji = (typeof BROADCAST_REACTION_EMOJI)[number];

/** Map of emoji → aggregate count for a single broadcast. Identity-free. */
export type BroadcastReactionCounts = Partial<Record<BroadcastReactionEmoji, number>>;

export function isBroadcastReactionEmoji(
  value: unknown,
): value is BroadcastReactionEmoji {
  return (
    typeof value === "string" &&
    (BROADCAST_REACTION_EMOJI as readonly string[]).includes(value)
  );
}
