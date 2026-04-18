/**
 * Easter-egg registry.
 *
 * Declarative list of the personalization prompts that may surface inside
 * the map / events experience.  The orchestrator walks this list in order
 * and fires the first egg whose trigger predicate returns true — only one
 * at a time, never stacked.
 *
 * Philosophy (per plan Phase D):
 *   - Prompts feel earned, not scripted.  Triggers reference concrete user
 *     intent (tapping a category marker, trying to create something, etc.).
 *   - Every prompt is skippable via a 24h soft-expiry so we never nag in a
 *     single session.
 *   - Persistence is delegated to {@link useEasterEgg} — the registry just
 *     declares *what* to ask and *when*.
 */

import type { PreferenceTag } from "@/types/db";

/** Ambient per-session state the orchestrator pipes into trigger predicates. */
export type EasterEggContext = {
  /** How many times the user has landed on `/events` this session. */
  mapEntryCount: number;
  /** Event categories the user has tapped so far this session. */
  tappedEventCategories: Set<string>;
  /** Whether the user has the leadership-tease unlocked yet. */
  hasLeadershipInterest: boolean;
  /** Whether the current user has ever attempted a contributor action. */
  contributorActionAttempted: boolean;
  /** Current ISO timestamp (for expiry checks). */
  nowIso: string;
  /** Account-creation ISO timestamp (may be empty for brand-new accounts). */
  accountCreatedAtIso: string;
};

export type EasterEggDefinition = {
  /** Stable id — used in analytics and for de-dup. */
  id: string;
  /** Persistence key under `preferences.tags`. */
  tagKey: string;
  /** Expiry applied when the user answers.  `null` = lifetime tag. */
  expiryDays: number | null;
  /** Does this egg want to fire right now? */
  shouldFire: (ctx: EasterEggContext, existing: PreferenceTag | undefined) => boolean;
};

/**
 * Default "has this tag expired?" predicate.  Used by most eggs.
 *
 * Returns true when the tag has no entry OR when its `expires_at` is in the
 * past.  `expires_at === null` is a lifetime tag — never re-ask.
 */
function needsAnswer(tag: PreferenceTag | undefined, nowIso: string): boolean {
  if (!tag) return true;
  if (tag.expires_at === null) return false;
  return tag.expires_at < nowIso;
}

/**
 * Registered eggs, ordered by priority.  The first egg whose `shouldFire`
 * returns true is the one that renders.
 *
 * NOTE: we only declare triggers + persistence contracts here.  UI copy /
 * option lists live alongside the `EasterEggPrompt` usage per egg so the
 * orchestrator can stay generic.
 */
export const EASTER_EGGS: EasterEggDefinition[] = [
  {
    // ── 1. Rotating WYR pool ───────────────────────────────────
    // Fires on map entry #1 for a brand-new user (per user decision
    // April 18 — "Yes, A is perfect").  Afterwards, re-surfaces every
    // second map entry until the user has answered 6+ in a 30-day window.
    id: "wyr_pool",
    tagKey: "wyr_progress",
    expiryDays: 30,
    shouldFire: (ctx, existing) => {
      // First ever map entry: ALWAYS surface (new-account path).
      if (ctx.mapEntryCount === 1 && !existing) return true;
      // Subsequent entries: show every 2nd entry until satisfied.
      if (ctx.mapEntryCount >= 2 && ctx.mapEntryCount % 2 === 0) {
        return needsAnswer(existing, ctx.nowIso);
      }
      return false;
    },
  },
  {
    // ── 2. Couples / marriage ──────────────────────────────────
    id: "relationship_stance",
    tagKey: "relationship_stance",
    expiryDays: 365,
    shouldFire: (ctx, existing) =>
      ctx.tappedEventCategories.has("marriage-and-couples") &&
      needsAnswer(existing, ctx.nowIso),
  },
  {
    // ── 3. Gender pill ─────────────────────────────────────────
    id: "gender",
    tagKey: "gender",
    expiryDays: null, // lifetime
    shouldFire: (ctx, existing) =>
      (ctx.tappedEventCategories.has("mens") ||
        ctx.tappedEventCategories.has("womens")) &&
      needsAnswer(existing, ctx.nowIso),
  },
  {
    // ── 4. Leadership invite ───────────────────────────────────
    id: "leadership_interest",
    tagKey: "leadership_interest",
    expiryDays: 365,
    shouldFire: (ctx, existing) =>
      ctx.contributorActionAttempted &&
      !ctx.hasLeadershipInterest &&
      needsAnswer(existing, ctx.nowIso),
  },
  {
    // ── 5. Love language ───────────────────────────────────────
    id: "love_language",
    tagKey: "love_language",
    expiryDays: 365,
    shouldFire: (ctx, existing) =>
      ctx.mapEntryCount >= 4 && needsAnswer(existing, ctx.nowIso),
  },
  {
    // ── 6. Season / stage of life ──────────────────────────────
    id: "stage_of_life",
    tagKey: "stage_of_life",
    expiryDays: 365,
    shouldFire: (ctx, existing) =>
      ctx.mapEntryCount >= 3 && needsAnswer(existing, ctx.nowIso),
  },
  {
    // ── 7. Time availability ───────────────────────────────────
    id: "time_availability",
    tagKey: "time_availability",
    expiryDays: 180,
    shouldFire: (ctx, existing) =>
      ctx.mapEntryCount >= 5 && needsAnswer(existing, ctx.nowIso),
  },
];
