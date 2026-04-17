import type { EventCategory } from "@/types/db";

/**
 * Auto-category assessment — keyword-based scoring that suggests the best
 * EventCategory for an event based on its title + description (and
 * optionally its location/place name). This is a lightweight local
 * heuristic; organisers always retain control of the final category.
 *
 * Returns `null` when no category scores meaningfully above zero.
 */

type CategoryKeywords = Record<EventCategory, string[]>;

/** Keyword buckets, in priority order. More specific words should appear
 *  first within each bucket so they win ties for categories with overlap
 *  (e.g. "prayer" belongs to church, not care). */
const KEYWORDS: CategoryKeywords = {
  // Healing, counseling, helps ministries, restorative events
  care: [
    "counseling", "counselling", "therapy", "therapist", "trauma",
    "mental health", "depression", "anxiety", "grief", "bereavement",
    "support group", "healing", "restoration", "restorative", "helps",
    "soul care", "pastoral care", "retreat", "sabbatical", "rest",
    "wellbeing", "well-being", "wholeness", "burnout", "self-care",
  ],
  entertainment: [
    "concert", "gig", "festival", "show", "performance", "theatre",
    "theater", "comedy", "open mic", "dance", "band", "dj", "film",
    "movie", "screening", "art",
  ],
  "sport-fun": [
    "soccer", "football", "rugby", "cricket", "basketball", "netball",
    "tennis", "hike", "run", "marathon", "5k", "10k", "cycle", "cycling",
    "swim", "tournament", "match", "sport", "gym", "fitness", "parkrun",
  ],
  "social-fun": [
    "braai", "potluck", "picnic", "meal", "dinner", "lunch", "breakfast",
    "coffee", "hangout", "mixer", "games night", "party", "social",
    "meet and greet", "meet-up", "meetup", "fellowship meal",
  ],
  "community-upliftment": [
    "outreach", "feeding scheme", "soup kitchen", "food drive", "clothing drive",
    "cleanup", "clean-up", "community service", "charity", "volunteer",
    "shelter", "orphan", "upliftment", "mission trip",
  ],
  education: [
    "bible study", "class", "course", "workshop", "seminar", "lecture",
    "training", "masterclass", "learn", "study group", "conference",
    "talk", "reading", "book club",
  ],
  church: [
    "service", "sunday service", "mass", "liturgy", "worship service",
    "prayer meeting", "prayer", "communion", "sermon", "church",
    "congregation", "parish", "chapel", "cathedral",
  ],
  missional: [
    "mission", "missions", "evangelism", "evangelistic", "street ministry",
    "gospel outreach", "crusade", "church plant", "planting",
    "discipleship on mission", "kingdom",
  ],
  "marriage-and-couples": [
    "marriage", "couples", "couple", "date night", "engagement",
    "pre-marital", "premarital", "wedding prep", "husband and wife",
    "marriage retreat",
  ],
  mens: [
    "men's", "mens", "brothers", "guys night", "father", "dads", "dad",
    "brotherhood", "iron sharpens", "man up",
  ],
  womens: [
    "women's", "womens", "sisters", "girls night", "mothers", "moms",
    "mom", "ladies", "sisterhood",
  ],
  kids: [
    "kids", "kid's", "children", "child", "youth", "teen", "teens",
    "sunday school", "vbs", "vacation bible", "playgroup", "family fun",
  ],
  recovery: [
    "recovery", "addiction", "rehab", "rehabilitation", "sobriety",
    "celebrate recovery", "aa ", "na ", "twelve step", "12 step",
    "12-step", "accountability",
  ],
  equip: [
    "equip", "equipping", "leadership", "training day", "bootcamp",
    "boot camp", "intensive", "skills", "certification", "impartation",
    "activation", "workshop series",
  ],
  weekend: [
    "weekend away", "camp", "camping", "getaway", "conference weekend",
    "away day", "overnight",
  ],
  "members-only": [
    "members only", "members-only", "member meeting", "agm",
    "board meeting", "staff meeting", "invite only", "invitation only",
    "private gathering",
  ],
};

/** Weighting divisor for keyword length: longer needles win ties because
 *  they're more discriminating (e.g. "marriage retreat" > "party"). The
 *  value was tuned empirically: divide by 4 so a typical 12-character
 *  phrase scores ~3× a 4-character one. */
const KEYWORD_LENGTH_WEIGHT_DIVISOR = 4;

/**
 * Suggest a category from free-text. Returns the best-scoring slug, or
 * `null` if nothing matches. Case-insensitive; longer keywords are weighted
 * more to avoid "party" beating "marriage retreat".
 */
export function suggestCategory(...parts: Array<string | null | undefined>): EventCategory | null {
  const haystack = parts.filter(Boolean).join(" \n ").toLowerCase();
  if (!haystack.trim()) return null;

  let best: { category: EventCategory; score: number } | null = null;

  for (const [category, words] of Object.entries(KEYWORDS) as [EventCategory, string[]][]) {
    let score = 0;
    for (const word of words) {
      const needle = word.toLowerCase();
      if (haystack.includes(needle)) {
        // Longer keywords are more discriminating — weight by length.
        score += Math.max(1, needle.length / KEYWORD_LENGTH_WEIGHT_DIVISOR);
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { category, score };
    }
  }

  return best?.category ?? null;
}
