/**
 * Interest percentage engine.
 *
 * Pure function that converts user preference signals into a per-category
 * interest score in 0..100.  Called server-side on every
 * `/api/preferences` write and cached in `preferences.percentages` so the
 * map / filter code can read without recomputing.
 *
 * Signal weights:
 *   - WYR answer points to categories  →  +10 per hit
 *   - Easter-egg tag whose value matches a category  →  +15 (specific)
 *   - Demographic alignment (gender + mens/womens)  →  +20
 *   - user_interests join (future — caller passes pre-joined slugs)  →  +30
 *
 * Clamping:
 *   - Values are clamped to [0, 100].
 *   - If the max score is below 60 we rebucket via a softmax-style stretch
 *     so the "For me in this area" filter (>=60 threshold) always has a
 *     non-empty match pool — otherwise new users with no signals would see
 *     an empty map.
 */

import { WYR_POOL } from "@/lib/easterEggs/wyr";
import type { EventCategory, PlaceCategory, Preferences } from "@/types/db";

export type CategorySlug = EventCategory | PlaceCategory;

export type PercentageInput = {
  /** Demographic slice from `profiles`. */
  gender?: string | null;
  age_range?: string | null;
  relationship_status?: string | null;
  stage_of_life?: string | null;
  energy_level?: string | null;
  /** Pre-joined category slugs from `user_interests` (optional). */
  interestCategories?: CategorySlug[];
  /** The preferences bag (wyr + tags). */
  preferences?: Pick<Preferences, "wyr" | "tags">;
};

export type Percentages = Partial<Record<CategorySlug, number>>;

const WYR_WEIGHT = 10;
const TAG_WEIGHT = 15;
const DEMOGRAPHIC_WEIGHT = 20;
const INTEREST_WEIGHT = 30;

/** Tag slug → category slugs whose score should bump when the tag value is truthy/matching. */
const TAG_CATEGORY_MAP: Record<string, (value: unknown) => CategorySlug[]> = {
  relationship_stance: (v) =>
    v === "married" || v === "calculating" ? ["marriage-family"] : [],
  love_language: (v) => {
    if (v === "service") return ["community-upliftment", "outreach-missions"];
    if (v === "time") return ["social-gatherings"];
    if (v === "words") return ["education-equipping"];
    if (v === "gifts") return ["care-recovery"];
    if (v === "touch") return ["care-recovery", "social-gatherings"];
    return [];
  },
  stage_of_life: (v) => {
    if (v === "seeking") return ["church-services", "education-equipping"];
    if (v === "growing") return ["education-equipping"];
    if (v === "serving") return ["outreach-missions", "community-upliftment"];
    if (v === "leading") return ["education-equipping"];
    return [];
  },
  time_availability: (v) => {
    // S3: weekend is now a derived UI tag (see `src/lib/weekendTag.ts`),
    // not a category. The `weekends` time_availability signal therefore
    // boosts no category here — it would only express itself through the
    // EventsView "Weekend only" filter chip, which is a hard filter, not
    // a personalisation score. Returning an empty list keeps every other
    // signal in this pipeline intact while making the stopgap explicit.
    void v;
    return [];
  },
};

/** Add `weight` to the score for each category slug in `cats`. */
function bump(scores: Map<CategorySlug, number>, cats: readonly CategorySlug[], weight: number) {
  for (const c of cats) {
    scores.set(c, (scores.get(c) ?? 0) + weight);
  }
}

export function computeInterestPercentages(input: PercentageInput): Percentages {
  const scores = new Map<CategorySlug, number>();

  // --- user_interests ----------------------------------------------------
  if (input.interestCategories?.length) {
    bump(scores, input.interestCategories, INTEREST_WEIGHT);
  }

  // --- WYR answers --------------------------------------------------------
  const wyr = input.preferences?.wyr ?? {};
  for (const q of WYR_POOL) {
    const ans = wyr[q.id];
    if (ans === "left" && q.left.categories?.length) {
      bump(scores, q.left.categories, WYR_WEIGHT);
    } else if (ans === "right" && q.right.categories?.length) {
      bump(scores, q.right.categories, WYR_WEIGHT);
    }
  }

  // --- Easter-egg tags ----------------------------------------------------
  const tags = input.preferences?.tags ?? {};
  for (const [key, tag] of Object.entries(tags)) {
    const mapper = TAG_CATEGORY_MAP[key];
    if (!mapper) continue;
    const cats = mapper(tag?.value);
    if (cats.length) bump(scores, cats, TAG_WEIGHT);
  }

  // --- Demographic alignment ---------------------------------------------
  if (input.gender === "male") bump(scores, ["mens-community"], DEMOGRAPHIC_WEIGHT);
  if (input.gender === "female") bump(scores, ["womens-community"], DEMOGRAPHIC_WEIGHT);
  if (input.stage_of_life === "seeking") bump(scores, ["church-services"], DEMOGRAPHIC_WEIGHT / 2);
  if (input.relationship_status === "married" || input.relationship_status === "engaged") {
    bump(scores, ["marriage-family"], DEMOGRAPHIC_WEIGHT);
  }

  // --- Clamp + rebucket ---------------------------------------------------
  if (scores.size === 0) return {};

  // Clamp to [0, 100]
  for (const [k, v] of scores) {
    scores.set(k, Math.max(0, Math.min(100, v)));
  }

  // If the max is below 60, stretch so the top entry sits at 75 and the
  // relative distribution is preserved.  This guarantees the "For me"
  // filter (>=60) has >=1 match even for users with only a few signals.
  const max = Math.max(...scores.values());
  if (max > 0 && max < 60) {
    const factor = 75 / max;
    for (const [k, v] of scores) {
      scores.set(k, Math.round(Math.max(0, Math.min(100, v * factor))));
    }
  } else {
    for (const [k, v] of scores) scores.set(k, Math.round(v));
  }

  const out: Percentages = {};
  for (const [k, v] of scores) out[k] = v;
  return out;
}
