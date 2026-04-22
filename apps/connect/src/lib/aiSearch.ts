/**
 * Citizens Connect — AI Search scoring engine (Phase 1)
 * ------------------------------------------------------
 * Given a parsed `QueryIntent` (see `src/lib/searchProfile.ts`), rank
 * events and places by how well they match. Deterministic, pure, and
 * fast enough to run in a serverless route handler on every keystroke.
 *
 * Ranking signals (in order of weight):
 *  1. Explicit tag overlap with `search_profile` (needs > audience > vibe).
 *  2. Token overlap with title / description / summary / location / category.
 *  3. Light proximity boost when intent has `nearMe` and user coords are known.
 *
 * Future phases can add cosine similarity from an embedding column as an
 * additional signal combined via a simple weighted sum in `combineScores`.
 */

import type { Event, Place, Profile } from "@/types/db";
import {
  type QueryIntent,
  type SearchProfile,
  ALL_TAGS,
  deriveSearchProfile,
  normaliseSearchProfile,
  parseQuery,
} from "./searchProfile";

export type RankedResult = {
  id: string;
  score: number;
  /** Human-readable explanation of why this result matched. */
  reason: string;
};

const W_NEEDS = 3.0;
const W_AUDIENCE = 2.2;
const W_VIBE = 1.4;
/** Derived (auto-tagged) profile hits count less than explicitly-set ones. */
const DERIVED_PENALTY = 0.6;
const W_TEXT = 1.0;
const W_CATEGORY = 0.8;
const W_PROXIMITY = 1.5; // max boost when within 2km
/** Small recency tie-break: events within the next 7 days get a tiny bonus. */
const W_RECENCY = 0.25;

/** Earth-radius haversine distance in km. */
function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h =
    s1 * s1 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Weighted tag overlap score in [0, W]. Uses Jaccard-like normalisation. */
function tagOverlap(
  profile: Set<string>,
  want: Set<string>,
  weight: number,
): number {
  if (want.size === 0 || profile.size === 0) return 0;
  let hits = 0;
  for (const w of want) if (profile.has(w)) hits += 1;
  if (hits === 0) return 0;
  // Normalise by how much of the *wanted* set was satisfied — this means
  // a document covering all the user's wants scores full weight even if
  // it has extra tags. Gently down-weight very broad profiles.
  const coverage = hits / want.size;
  const focus = 1 / Math.sqrt(1 + Math.max(0, profile.size - want.size));
  return weight * coverage * (0.7 + 0.3 * focus);
}

/** Token overlap against a piece of text, in [0, weight]. */
function textOverlap(text: string, tokens: string[], weight: number): number {
  if (!text || tokens.length === 0) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const t of tokens) if (lower.includes(t)) hits += 1;
  if (hits === 0) return 0;
  return weight * (hits / tokens.length);
}

/** Proximity boost in [0, W_PROXIMITY] — falls off over 25 km. */
function proximityBoost(
  itemLat: number | null | undefined,
  itemLng: number | null | undefined,
  userLat: number | undefined,
  userLng: number | undefined,
  nearMe: boolean,
): number {
  if (!nearMe || userLat == null || userLng == null) return 0;
  if (itemLat == null || itemLng == null) return 0;
  const km = distanceKm([userLat, userLng], [itemLat, itemLng]);
  if (km >= 25) return 0;
  // Linear falloff: 0 km → full, 25 km → 0
  return W_PROXIMITY * (1 - km / 25);
}

/** Collect the per-result match reason as "Label · Label" tokens. */
function explainMatch(
  matchedNeeds: string[],
  matchedAudience: string[],
  matchedVibe: string[],
  textHit: boolean,
): string {
  const labels = (slugs: string[]) =>
    slugs.map((s) => ALL_TAGS.find((t) => t.slug === s)?.label ?? s);
  const parts = [
    ...labels(matchedNeeds),
    ...labels(matchedAudience),
    ...labels(matchedVibe),
  ];
  if (parts.length === 0 && textHit) return "Text match";
  return parts.slice(0, 3).join(" · ");
}

type UserLocation = { lat: number; lng: number } | null;

export type SearchInput = {
  query: string;
  userLocation?: UserLocation;
};

export type SearchResults = {
  intent: QueryIntent;
  events: RankedResult[];
  places: RankedResult[];
  /** Approved contributors matching the query. Empty when the caller
   *  did not pass a contributor list to `rankResults`. */
  contributors: RankedResult[];
};

/** Small bonus for events in the next week; 0 otherwise. Expects ISO string. */
function recencyBoost(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return 0;
  const days = (t - Date.now()) / (1000 * 60 * 60 * 24);
  if (days < 0 || days > 7) return 0;
  return W_RECENCY * (1 - days / 7);
}

/** Score a single event against the parsed intent. Returns null if no match. */
export function scoreEvent(
  event: Event,
  intent: QueryIntent,
  userLocation?: UserLocation,
): RankedResult | null {
  // Safely coerce the jsonb search_profile column. Events saved before the
  // AI search phase have no profile — fall back to an auto-derived profile
  // from the title + description so they still participate in tag scoring.
  const stored = normaliseSearchProfile(
    (event as unknown as { search_profile?: unknown }).search_profile,
  );
  const profile: SearchProfile =
    stored ?? deriveSearchProfile(event.title, event.description, event.location) ?? {};
  const isDerived = !stored;

  const pNeeds = new Set(profile.needs ?? []);
  const pAudience = new Set(profile.audience ?? []);
  const pVibe = new Set(profile.vibe ?? []);

  const matchedNeeds = [...pNeeds].filter((s) => intent.needs.has(s));
  const matchedAudience = [...pAudience].filter((s) => intent.audience.has(s));
  const matchedVibe = [...pVibe].filter((s) => intent.vibe.has(s));

  const tagPenalty = isDerived ? DERIVED_PENALTY : 1;

  let score = 0;
  score += tagOverlap(pNeeds, intent.needs, W_NEEDS) * tagPenalty;
  score += tagOverlap(pAudience, intent.audience, W_AUDIENCE) * tagPenalty;
  score += tagOverlap(pVibe, intent.vibe, W_VIBE) * tagPenalty;

  const haystack = `${event.title} ${event.description} ${event.location}`;
  const textScore = textOverlap(haystack, intent.tokens, W_TEXT);
  score += textScore;

  // Category field is a controlled slug — if any intent tag's label overlaps, boost.
  if (event.category && intent.tokens.some((t) => event.category!.toLowerCase().includes(t))) {
    score += W_CATEGORY;
  }

  score += proximityBoost(
    event.latitude,
    event.longitude,
    userLocation?.lat,
    userLocation?.lng,
    intent.nearMe,
  );

  // Small tie-breaker so upcoming events surface ahead of far-future ones.
  if (score > 0) score += recencyBoost(event.date);

  if (score <= 0) return null;

  return {
    id: event.id,
    score,
    reason: explainMatch(matchedNeeds, matchedAudience, matchedVibe, textScore > 0),
  };
}

/** Score a single place against the parsed intent. Returns null if no match. */
export function scorePlace(
  place: Place,
  intent: QueryIntent,
  userLocation?: UserLocation,
): RankedResult | null {
  const stored = normaliseSearchProfile(
    (place as unknown as { search_profile?: unknown }).search_profile,
  );
  const catName = place.categories?.name ?? "";
  const profile: SearchProfile =
    stored ??
    deriveSearchProfile(place.name, place.description, `${place.address} ${catName}`) ??
    {};
  const isDerived = !stored;

  const pNeeds = new Set(profile.needs ?? []);
  const pAudience = new Set(profile.audience ?? []);
  const pVibe = new Set(profile.vibe ?? []);

  const matchedNeeds = [...pNeeds].filter((s) => intent.needs.has(s));
  const matchedAudience = [...pAudience].filter((s) => intent.audience.has(s));
  const matchedVibe = [...pVibe].filter((s) => intent.vibe.has(s));

  const tagPenalty = isDerived ? DERIVED_PENALTY : 1;

  let score = 0;
  score += tagOverlap(pNeeds, intent.needs, W_NEEDS) * tagPenalty;
  score += tagOverlap(pAudience, intent.audience, W_AUDIENCE) * tagPenalty;
  score += tagOverlap(pVibe, intent.vibe, W_VIBE) * tagPenalty;

  const haystack = `${place.name} ${place.description} ${place.address} ${catName}`;
  const textScore = textOverlap(haystack, intent.tokens, W_TEXT);
  score += textScore;

  score += proximityBoost(
    place.latitude,
    place.longitude,
    userLocation?.lat,
    userLocation?.lng,
    intent.nearMe,
  );

  if (score <= 0) return null;

  return {
    id: place.id,
    score,
    reason: explainMatch(matchedNeeds, matchedAudience, matchedVibe, textScore > 0),
  };
}

/** Score a single Contributor (profile) against the parsed intent.
 *  Returns null if no match.
 *
 *  Contributors don't yet carry a structured `search_profile`, so we
 *  always derive tags from their bio + full_name + physical_address
 *  and apply the same derived-tag penalty we use for untagged events.
 *  Proximity uses `physical_latitude` / `physical_longitude`.
 */
export function scoreContributor(
  profile: Profile,
  intent: QueryIntent,
  userLocation?: UserLocation,
): RankedResult | null {
  const derived =
    deriveSearchProfile(
      profile.full_name ?? "",
      profile.bio ?? "",
      profile.physical_address ?? "",
    ) ?? {};

  const pNeeds = new Set(derived.needs ?? []);
  const pAudience = new Set(derived.audience ?? []);
  const pVibe = new Set(derived.vibe ?? []);

  const matchedNeeds = [...pNeeds].filter((s) => intent.needs.has(s));
  const matchedAudience = [...pAudience].filter((s) => intent.audience.has(s));
  const matchedVibe = [...pVibe].filter((s) => intent.vibe.has(s));

  let score = 0;
  score += tagOverlap(pNeeds, intent.needs, W_NEEDS) * DERIVED_PENALTY;
  score += tagOverlap(pAudience, intent.audience, W_AUDIENCE) * DERIVED_PENALTY;
  score += tagOverlap(pVibe, intent.vibe, W_VIBE) * DERIVED_PENALTY;

  const haystack = [
    profile.full_name ?? "",
    profile.bio ?? "",
    profile.physical_address ?? "",
    profile.contributor_kind ?? "",
  ].join(" ");
  const textScore = textOverlap(haystack, intent.tokens, W_TEXT);
  score += textScore;

  // Kind keyword boost — e.g. searching "ministry" should surface
  // ministries even when their bio doesn't contain that literal word.
  if (
    profile.contributor_kind &&
    intent.tokens.some((t) => profile.contributor_kind!.includes(t))
  ) {
    score += W_CATEGORY;
  }

  score += proximityBoost(
    profile.physical_latitude ?? null,
    profile.physical_longitude ?? null,
    userLocation?.lat,
    userLocation?.lng,
    intent.nearMe,
  );

  if (score <= 0) return null;

  return {
    id: profile.id,
    score,
    reason: explainMatch(matchedNeeds, matchedAudience, matchedVibe, textScore > 0),
  };
}

/**
 * Rank a batch of events + places + contributors against a free-text
 * query.
 *
 * Results are sorted descending by score. Use the returned `intent` to
 * render "Why this matched" chips or to fall back to geocoding when
 * `intent.hasSignal` is false.
 *
 * `contributors` is optional and defaults to `[]` so existing callers
 * (e.g. the client-side EventsView) don't need to change. The API
 * layer passes contributors in so ecosystem search surfaces them
 * alongside events and places.
 */
export function rankResults(
  query: string,
  events: Event[],
  places: Place[],
  userLocation?: UserLocation,
  contributors: Profile[] = [],
): SearchResults {
  const intent = parseQuery(query);

  // Early-exit on empty query — the caller should render all items.
  if (!intent.raw) {
    return { intent, events: [], places: [], contributors: [] };
  }

  const rankedEvents: RankedResult[] = [];
  for (const e of events) {
    const r = scoreEvent(e, intent, userLocation);
    if (r) rankedEvents.push(r);
  }
  const rankedPlaces: RankedResult[] = [];
  for (const p of places) {
    const r = scorePlace(p, intent, userLocation);
    if (r) rankedPlaces.push(r);
  }
  const rankedContributors: RankedResult[] = [];
  for (const c of contributors) {
    const r = scoreContributor(c, intent, userLocation);
    if (r) rankedContributors.push(r);
  }

  rankedEvents.sort((a, b) => b.score - a.score);
  rankedPlaces.sort((a, b) => b.score - a.score);
  rankedContributors.sort((a, b) => b.score - a.score);

  return {
    intent,
    events: rankedEvents,
    places: rankedPlaces,
    contributors: rankedContributors,
  };
}
