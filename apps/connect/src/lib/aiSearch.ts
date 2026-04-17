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

import type { Event, Place } from "@/types/db";
import {
  type QueryIntent,
  type SearchProfile,
  ALL_TAGS,
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
const W_TEXT = 1.0;
const W_CATEGORY = 0.8;
const W_PROXIMITY = 1.5; // max boost when within 2km

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
};

/** Score a single event against the parsed intent. Returns null if no match. */
export function scoreEvent(
  event: Event,
  intent: QueryIntent,
  userLocation?: UserLocation,
): RankedResult | null {
  // Safely coerce the jsonb search_profile column. Events saved before the
  // AI search phase have no profile — they can still match via text/category.
  const profile: SearchProfile =
    normaliseSearchProfile(
      (event as unknown as { search_profile?: unknown }).search_profile,
    ) ?? {};

  const pNeeds = new Set(profile.needs ?? []);
  const pAudience = new Set(profile.audience ?? []);
  const pVibe = new Set(profile.vibe ?? []);

  const matchedNeeds = [...pNeeds].filter((s) => intent.needs.has(s));
  const matchedAudience = [...pAudience].filter((s) => intent.audience.has(s));
  const matchedVibe = [...pVibe].filter((s) => intent.vibe.has(s));

  let score = 0;
  score += tagOverlap(pNeeds, intent.needs, W_NEEDS);
  score += tagOverlap(pAudience, intent.audience, W_AUDIENCE);
  score += tagOverlap(pVibe, intent.vibe, W_VIBE);

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
  const profile: SearchProfile =
    normaliseSearchProfile(
      (place as unknown as { search_profile?: unknown }).search_profile,
    ) ?? {};

  const pNeeds = new Set(profile.needs ?? []);
  const pAudience = new Set(profile.audience ?? []);
  const pVibe = new Set(profile.vibe ?? []);

  const matchedNeeds = [...pNeeds].filter((s) => intent.needs.has(s));
  const matchedAudience = [...pAudience].filter((s) => intent.audience.has(s));
  const matchedVibe = [...pVibe].filter((s) => intent.vibe.has(s));

  let score = 0;
  score += tagOverlap(pNeeds, intent.needs, W_NEEDS);
  score += tagOverlap(pAudience, intent.audience, W_AUDIENCE);
  score += tagOverlap(pVibe, intent.vibe, W_VIBE);

  const catName = place.categories?.name ?? "";
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

/**
 * Rank a batch of events + places against a free-text query.
 *
 * Results are sorted descending by score. Use the returned `intent` to
 * render "Why this matched" chips or to fall back to geocoding when
 * `intent.hasSignal` is false.
 */
export function rankResults(
  query: string,
  events: Event[],
  places: Place[],
  userLocation?: UserLocation,
): SearchResults {
  const intent = parseQuery(query);

  // Early-exit on empty query — the caller should render all items.
  if (!intent.raw) {
    return { intent, events: [], places: [] };
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

  rankedEvents.sort((a, b) => b.score - a.score);
  rankedPlaces.sort((a, b) => b.score - a.score);

  return { intent, events: rankedEvents, places: rankedPlaces };
}
