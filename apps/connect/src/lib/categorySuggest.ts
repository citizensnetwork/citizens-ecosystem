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
  // Healing, counseling, helps ministries, recovery, restorative events.
  // Merged from old `care` + `recovery` buckets.
  "care-recovery": [
    "counseling", "counselling", "therapy", "therapist", "trauma",
    "mental health", "depression", "anxiety", "grief", "bereavement",
    "support group", "healing", "restoration", "restorative", "helps",
    "soul care", "pastoral care", "sabbatical", "rest",
    "wellbeing", "well-being", "wholeness", "burnout", "self-care",
    "recovery", "addiction", "rehab", "rehabilitation", "sobriety",
    "celebrate recovery", "aa ", "na ", "twelve step", "12 step",
    "12-step", "accountability",
  ],
  "worship-prayer": [
    "worship night", "worship encounter", "prayer night", "prayer meeting",
    "prayer room", "prayer watch", "intercession", "intercessory",
    "prophetic prayer", "warfare prayer", "soaking", "soaking worship",
    "harp and bowl", "all night prayer", "all-night prayer", "vigil",
    "house of prayer", "boiler room", "outpouring", "anointing",
    "presence", "global day of prayer", "fasting", "solemn assembly",
  ],
  "arts-culture": [
    "concert", "gig", "festival", "show", "performance", "theatre",
    "theater", "comedy", "open mic", "dance", "band", "dj", "film",
    "movie", "screening", "art", "exhibition", "gallery night",
    "creative arts", "culture night",
  ],
  "sport-recreation": [
    "soccer", "football", "rugby", "cricket", "basketball", "netball",
    "tennis", "hike", "run", "marathon", "5k", "10k", "cycle", "cycling",
    "swim", "tournament", "match", "sport", "gym", "fitness", "parkrun",
    "recreation",
  ],
  "social-gatherings": [
    "braai", "potluck", "picnic", "meal", "dinner", "lunch", "breakfast",
    "coffee", "hangout", "mixer", "games night", "party", "social",
    "meet and greet", "meet-up", "meetup", "fellowship meal",
  ],
  "community-upliftment": [
    "outreach", "feeding scheme", "soup kitchen", "food drive", "clothing drive",
    "cleanup", "clean-up", "community service", "charity", "volunteer",
    "shelter", "orphan", "upliftment", "mission trip",
  ],
  // Merged from old `education` + `equip`.
  "education-equipping": [
    "bible study", "class", "course", "workshop", "seminar", "lecture",
    "training", "masterclass", "learn", "study group",
    "talk", "reading", "book club",
    "equip", "equipping", "leadership", "training day", "bootcamp",
    "boot camp", "intensive", "skills", "certification", "impartation",
    "activation", "workshop series",
  ],
  "church-services": [
    "service", "sunday service", "mass", "liturgy", "worship service",
    "communion", "sermon", "church",
    "congregation", "parish", "chapel", "cathedral",
  ],
  "outreach-missions": [
    "mission", "missions", "evangelism", "evangelistic", "street ministry",
    "gospel outreach", "crusade", "church plant", "planting",
    "discipleship on mission", "kingdom",
  ],
  "markets-expos": [
    "market", "farmers market", "flea market", "craft market",
    "weekend market", "night market", "kingdom market", "kingdom expo",
    "expo", "exposition", "trade show", "trade fair", "showcase",
    "vendor showcase", "pop up", "pop-up", "bazaar", "fair", "fete",
    "harvest market", "small business fair", "christian business expo",
  ],
  "marriage-family": [
    "marriage", "couples", "couple", "date night", "engagement",
    "pre-marital", "premarital", "wedding prep", "husband and wife",
    "marriage retreat", "family", "parenting", "family night",
  ],
  "mens-community": [
    "men's", "mens", "brothers", "guys night", "father", "dads", "dad",
    "brotherhood", "iron sharpens", "man up",
  ],
  "womens-community": [
    "women's", "womens", "sisters", "girls night", "mothers", "moms",
    "mom", "ladies", "sisterhood",
  ],
  "youth-students": [
    "youth", "teen", "teens", "teenager", "tween", "young adults",
    "campus", "varsity", "university", "students", "student night",
    "student group", "college students", "next gen", "youth group",
    "youth night", "youth camp", "youth conference", "high school",
  ],
  kids: [
    "kids", "kid's", "children", "child",
    "sunday school", "vbs", "vacation bible", "playgroup", "family fun",
  ],
  "conferences-summits": [
    "conference", "convention", "congress", "summit", "kingdom summit",
    "leaders conference", "leaders summit", "leadership conference",
    "weekend away", "camp", "camping", "getaway", "conference weekend",
    "away day", "overnight", "encounter weekend", "vision conference",
    "pastors conference", "pastors summit", "national conference",
    "denomination conference", "global summit", "convocation",
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
