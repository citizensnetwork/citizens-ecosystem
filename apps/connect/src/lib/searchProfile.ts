/**
 * Citizens Connect — AI Search Taxonomy (Phase 1)
 * --------------------------------------------------
 * A structured description layer applied to `events` and `places` so that
 * natural-language searches like "Homecells in my area", "I need counselling",
 * or "Good coffee places nearby" can be resolved into concrete map results.
 *
 * The taxonomy is intentionally small, curated, and stable. Each tag is a
 * slug that maps to a human label and a list of synonyms / related keywords.
 *
 * The same taxonomy powers:
 *  - the organiser "Discovery tags" pickers on Event / Place forms
 *  - the NLP query parser used by /api/ai-search
 *  - the scoring engine in src/lib/aiSearch.ts
 *
 * Phase 2 (future) can layer OpenAI embeddings + pgvector on top without
 * changing this file — the deterministic tag match is used as a fallback
 * and as the primary signal when embeddings are unavailable.
 */

export type TagSlug = string;

/** A curated taxonomy tag with human label + search synonyms. */
export type TagDef = {
  /** Stable slug stored in DB jsonb. */
  slug: TagSlug;
  /** Human-facing label for the tag picker. */
  label: string;
  /** Synonyms / keywords that should route a user query to this tag. */
  synonyms: string[];
};

/** Who the event / place is primarily for. */
export const AUDIENCES: readonly TagDef[] = [
  { slug: "youth",          label: "Youth",                synonyms: ["youth", "teen", "teens", "teenager", "teenagers", "young people"] },
  { slug: "kids",           label: "Kids & Families",      synonyms: ["kid", "kids", "children", "child", "family", "families", "parents"] },
  { slug: "students",       label: "Students",             synonyms: ["student", "students", "university", "varsity", "college", "school"] },
  { slug: "young-adults",   label: "Young adults",         synonyms: ["young adult", "young adults", "20s", "twenties", "gen z", "gen-z"] },
  { slug: "couples",        label: "Couples & Marriage",   synonyms: ["couple", "couples", "marriage", "married", "spouse", "husband", "wife", "dating"] },
  { slug: "men",            label: "Men",                  synonyms: ["men", "man", "mens", "men's", "brothers"] },
  { slug: "women",          label: "Women",                synonyms: ["women", "woman", "ladies", "girls", "sisters"] },
  { slug: "singles",        label: "Singles",              synonyms: ["single", "singles", "new friends", "meet people", "friends"] },
  { slug: "seniors",        label: "Seniors",              synonyms: ["senior", "seniors", "elderly", "older"] },
  { slug: "entrepreneurs",  label: "Entrepreneurs",        synonyms: ["entrepreneur", "entrepreneurs", "business owner", "founder", "startup", "small business"] },
  { slug: "professionals",  label: "Professionals",        synonyms: ["professional", "professionals", "workplace", "career"] },
  { slug: "seekers",        label: "Seekers / New to faith", synonyms: ["seeker", "seekers", "new to faith", "curious", "atheist", "non-christian", "non believer"] },
  { slug: "hurting",        label: "Hurting / In crisis",  synonyms: ["hurting", "broken", "crisis", "struggling", "depressed", "depression", "anxious", "anxiety", "grief", "grieving", "addiction", "suicidal"] },
  { slug: "lonely",         label: "Lonely",               synonyms: ["lonely", "alone", "isolation", "isolated"] },
] as const;

/** What need / outcome the event or place meets. */
export const NEEDS: readonly TagDef[] = [
  { slug: "community",       label: "Community / Belonging",  synonyms: ["community", "belong", "belonging", "connection", "connect", "friends", "fellowship", "homecell", "homecells", "home cell", "home cells", "lifegroup", "life group", "small group", "cell group"] },
  { slug: "worship",         label: "Worship",                synonyms: ["worship", "worship night", "praise", "singing"] },
  { slug: "prayer",          label: "Prayer",                 synonyms: ["prayer", "pray", "intercession"] },
  { slug: "bible-study",     label: "Bible study",            synonyms: ["bible", "bible study", "scripture", "word", "teaching", "discipleship"] },
  { slug: "counselling",     label: "Counselling",            synonyms: ["counselling", "counseling", "counsellor", "counselor", "therapy", "therapist", "talk to someone", "mental health"] },
  { slug: "healing",         label: "Healing",                synonyms: ["healing", "heal", "healed", "restoration", "deliverance"] },
  { slug: "marriage-advice", label: "Marriage advice",        synonyms: ["marriage advice", "marriage help", "marriage counselling", "marriage counseling", "premarital", "pre-marital"] },
  { slug: "mentorship",      label: "Mentorship",             synonyms: ["mentor", "mentorship", "mentoring", "coaching", "discipleship", "guidance"] },
  { slug: "service",         label: "Serving / Volunteering", synonyms: ["serve", "serving", "volunteer", "volunteering", "outreach", "mission", "missional"] },
  { slug: "fun",             label: "Fun & Social",           synonyms: ["fun", "social", "hangout", "party", "games", "entertainment", "music", "concert"] },
  { slug: "fitness",         label: "Fitness & Sport",        synonyms: ["fitness", "sport", "sports", "gym", "workout", "run", "running", "hike", "hiking", "cycle", "cycling", "exercise"] },
  { slug: "food-coffee",     label: "Food & Coffee",          synonyms: ["coffee", "cafe", "café", "food", "restaurant", "eat", "brunch", "lunch", "dinner", "bakery"] },
  { slug: "shopping",        label: "Shopping & Markets",     synonyms: ["market", "markets", "shop", "shopping", "store", "boutique"] },
  { slug: "business",        label: "Kingdom business",       synonyms: ["business", "businesses", "marketplace", "kingdom business", "christian business"] },
  { slug: "learning",        label: "Learning / Equip",       synonyms: ["learn", "learning", "course", "class", "workshop", "equip", "training", "seminar", "conference"] },
  { slug: "recovery",        label: "Recovery",               synonyms: ["recovery", "recover", "addiction", "sober", "rehab", "12 step", "twelve step"] },
  { slug: "finance-advice",  label: "Finance & Stewardship",  synonyms: ["finance", "finances", "money", "stewardship", "budget", "debt"] },
  { slug: "career",          label: "Career & Work",          synonyms: ["career", "job", "jobs", "work", "employment", "opportunity", "opportunities"] },
  { slug: "creative",        label: "Arts & Creative",        synonyms: ["art", "arts", "creative", "music", "dance", "theatre", "theater", "design", "photography"] },
  { slug: "care",            label: "Care & Support",         synonyms: ["care", "support", "help", "helps", "ministry", "restorative"] },
] as const;

/** Overall vibe / feel. */
export const VIBES: readonly TagDef[] = [
  { slug: "quiet",          label: "Quiet / Reflective",   synonyms: ["quiet", "reflective", "still", "contemplative", "retreat"] },
  { slug: "energetic",      label: "Energetic",            synonyms: ["energetic", "energy", "high energy", "lively", "hype"] },
  { slug: "intimate",       label: "Intimate",             synonyms: ["intimate", "small", "personal"] },
  { slug: "family-friendly", label: "Family-friendly",     synonyms: ["family friendly", "family-friendly", "kid friendly", "kid-friendly"] },
  { slug: "charismatic",    label: "Charismatic / Spirit-led", synonyms: ["charismatic", "spirit", "spirit-led", "pentecostal", "prophetic"] },
  { slug: "traditional",    label: "Traditional",          synonyms: ["traditional", "liturgical", "reformed"] },
  { slug: "casual",         label: "Casual",               synonyms: ["casual", "informal", "chill", "laid back", "laid-back"] },
  { slug: "outdoor",        label: "Outdoor",              synonyms: ["outdoor", "outdoors", "outside", "park", "beach", "mountain"] },
] as const;

/** Combined flat taxonomy (useful for lookups + validation). */
export const ALL_TAGS: readonly TagDef[] = [
  ...AUDIENCES,
  ...NEEDS,
  ...VIBES,
] as const;

/** All valid tag slugs (a Set for fast validation of incoming JSON). */
export const ALL_TAG_SLUGS: ReadonlySet<string> = new Set(ALL_TAGS.map((t) => t.slug));

/** The structured discovery profile attached to an event or place. */
export type SearchProfile = {
  audience?: TagSlug[];
  needs?: TagSlug[];
  vibe?: TagSlug[];
  /** Optional short free-text summary that augments title/description for matching. */
  summary?: string;
};

/** Sanitise a raw jsonb value into a typed `SearchProfile` (unknown tags dropped). */
export function normaliseSearchProfile(raw: unknown): SearchProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pickTags = (v: unknown): TagSlug[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const valid = v.filter((s): s is string => typeof s === "string" && ALL_TAG_SLUGS.has(s));
    return valid.length ? valid : undefined;
  };
  const audience = pickTags(r.audience);
  const needs = pickTags(r.needs);
  const vibe = pickTags(r.vibe);
  const summary = typeof r.summary === "string" && r.summary.trim() ? r.summary.trim().slice(0, 500) : undefined;
  if (!audience && !needs && !vibe && !summary) return null;
  return { audience, needs, vibe, summary };
}

/** Parsed intent extracted from a natural-language query. */
export type QueryIntent = {
  /** Lower-cased, whitespace-normalised query. */
  raw: string;
  /** Tokens (words ≥ 2 chars, lower-cased, punctuation stripped). */
  tokens: string[];
  audience: Set<TagSlug>;
  needs: Set<TagSlug>;
  vibe: Set<TagSlug>;
  /** True if the user is asking for "near me" / "in my area". */
  nearMe: boolean;
  /** True if the query mentions any tag at all — i.e. we have a signal. */
  hasSignal: boolean;
};

/** Locational phrases that indicate "near me" / "in my area". */
const NEAR_ME_PHRASES = [
  "near me",
  "nearby",
  "in my area",
  "close to me",
  "around me",
  "close by",
  "around here",
] as const;

/** Low-value stop words skipped when falling back to token overlap. */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at",
  "is", "are", "am", "be", "i", "me", "my", "we", "our", "you", "your",
  "any", "some", "please", "looking", "need", "want", "find",
  "have", "has", "can", "could", "would", "good", "best", "nice",
  "near", "nearby", "around", "close", "area", "here", "there",
]);

/**
 * Parse a free-text query into a structured intent.
 *
 * Deterministic and dependency-free — runs fine in the browser or in a
 * Next.js route handler without any LLM call. Phase 2 can optionally add
 * an LLM pre-pass that returns the same shape.
 */
export function parseQuery(query: string): QueryIntent {
  const raw = (query ?? "").toLowerCase().trim();
  const normalised = raw.replace(/\s+/g, " ");

  const nearMe = NEAR_ME_PHRASES.some((p) => normalised.includes(p));

  const audience = new Set<TagSlug>();
  const needs = new Set<TagSlug>();
  const vibe = new Set<TagSlug>();

  // Longest-match synonym scan on the full string (catches multi-word phrases).
  const scan = (defs: readonly TagDef[], target: Set<TagSlug>) => {
    for (const def of defs) {
      for (const syn of def.synonyms) {
        // Use word-boundary-ish matching for single words; substring for multi-word phrases.
        if (syn.includes(" ")) {
          if (normalised.includes(syn)) { target.add(def.slug); break; }
        } else {
          const re = new RegExp(`(^|[^a-z])${escapeRe(syn)}($|[^a-z])`);
          if (re.test(normalised)) { target.add(def.slug); break; }
        }
      }
    }
  };

  scan(AUDIENCES, audience);
  scan(NEEDS, needs);
  scan(VIBES, vibe);

  const tokens = normalised
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  return {
    raw: normalised,
    tokens,
    audience,
    needs,
    vibe,
    nearMe,
    hasSignal: audience.size + needs.size + vibe.size > 0,
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pretty-print the intent tags into a "Why this matched" chip. */
export function describeIntent(intent: QueryIntent): string {
  const all = [...intent.needs, ...intent.audience, ...intent.vibe];
  if (all.length === 0) return "";
  const labels = all
    .map((slug) => ALL_TAGS.find((t) => t.slug === slug)?.label ?? slug)
    .slice(0, 3);
  return labels.join(" · ");
}
