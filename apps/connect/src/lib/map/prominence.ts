/**
 * Map marker prominence — the client half of the hybrid tiering score.
 *
 * The server precomputes `prominence_base` ∈ [0,1] (popularity: rsvps /
 * comments / views for events, follows / reviews for places — migration 119).
 * Here we layer the *live* signals that must never go stale between cron
 * runs — time-proximity to the event and a newcomer boost — and fold
 * everything into one prominence value ∈ [0,1].
 *
 * That value drives two things on the map (see EventMap):
 *   1. Which tier a marker renders at for the current zoom (dot → mid → full),
 *      via `markerTier` — higher prominence reveals a couple of zoom levels
 *      earlier, exactly like Google promotes important POIs sooner.
 *   2. Who wins a collision and who gets the capped photo tier (raw compare).
 *
 * VISION — "the small are honoured": prominence only decides *tier* and
 * *priority*, never visibility. Every marker is always at least a dot. The
 * newcomer boost + a time-dominant weighting keep fresh/small items from
 * being buried under whatever is currently popular.
 */

export type MarkerTier = "dot" | "mid" | "full";
export type MarkerKind = "event" | "place";

/* ── Tier zoom thresholds (single source of truth; EventMap imports these) ──
 * Base thresholds for a prominence-0 marker. Higher prominence subtracts up
 * to PROMINENCE_ZOOM_SPAN from both, so a top item escapes dot-mode and
 * reaches full presentation sooner. */
export const DOT_MODE_ZOOM = 7;
export const MID_MODE_ZOOM = 10;
export const EVENT_MID_MARKER_ZOOM = 9;
export const EVENT_FULL_MARKER_ZOOM = 12;
export const EVENT_FOLLOWED_LIVE_FULL_ZOOM = 8;
export const EVENT_FOLLOWED_SOON_PHOTO_ZOOM = 11;
/** Hide event markers entirely below this zoom. Farther out, a city-activity
 * glow layer can carry the map without overwhelming citizens with noise. */
export const EVENT_MARKER_MIN_ZOOM = 6;
export const PLACE_MARKER_MIN_ZOOM = 10;
export const PLACE_FULL_MARKER_ZOOM = 12;
/** Max zoom levels a maximally-prominent marker is promoted by. */
export const PROMINENCE_ZOOM_SPAN = 3;

/* ── Score weights ─────────────────────────────────────────── */
/** Personal relevance order: follow first, time second, consider/friend
 *  activity equal, platform prominence last. */
const W_FOLLOW = 0.32;
const W_TIME = 0.28;
const W_ENGAGED = 0.16;
const W_FRIEND = 0.16;
const W_POP = 0.08;
const W_PLACE_FOLLOW = 0.35;
const W_PLACE_ACTIVITY = 0.35;
const W_PLACE_POP = 0.2;
/** Places have no expiry — they are "always relevant", so they take a
 *  neutral, mid time-proximity rather than 0. Keeps event↔place collision
 *  and photo-tier comparisons on a fair common scale. */
const PLACE_TIME_PROXIMITY = 0.5;

/* ── Newcomer boost ────────────────────────────────────────── */
/** Days a freshly-created item rides the boost before it fully decays. */
export const NEWCOMER_WINDOW_DAYS = 7;
/** Peak boost (at creation), added on top of the weighted score. */
const NEWCOMER_PEAK = 0.2;

const DAY_MS = 86_400_000;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Time-proximity ∈ [0,1] for an event — 1 when live/imminent, decaying as
 * the start recedes into the future (or the past). Mirrors the bands in
 * getTemporalStyle so size and tier tell a consistent story.
 */
export function timeProximity(
  dateStr: string,
  endDateStr: string | null | undefined,
  now: number
): number {
  const start = new Date(dateStr).getTime();
  if (!Number.isFinite(start)) return PLACE_TIME_PROXIMITY;
  const end = endDateStr
    ? new Date(endDateStr).getTime()
    : start + 2 * 60 * 60 * 1000;

  // Live right now → maximal.
  if (start <= now && (Number.isFinite(end) ? end : start) > now) return 1;

  // Already finished → lowest band (still shown; just deprioritised).
  if ((Number.isFinite(end) ? end : start) <= now) return 0.2;

  const ahead = start - now;
  if (ahead < DAY_MS) return 1;
  if (ahead < 7 * DAY_MS) return 0.8;
  if (ahead < 30 * DAY_MS) return 0.6;
  if (ahead < 90 * DAY_MS) return 0.4;
  return 0.25;
}

/**
 * Newcomer boost ∈ [0, NEWCOMER_PEAK] — full at creation, decaying linearly
 * to 0 over NEWCOMER_WINDOW_DAYS. Gives a brand-new small item a head start
 * so it surfaces before it has had time to earn engagement.
 */
export function newcomerBoost(
  createdAt: string | null | undefined,
  now: number
): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  const ageMs = now - created;
  if (ageMs <= 0) return NEWCOMER_PEAK; // clock skew / future-dated → treat as brand new
  const windowMs = NEWCOMER_WINDOW_DAYS * DAY_MS;
  if (ageMs >= windowMs) return 0;
  return NEWCOMER_PEAK * (1 - ageMs / windowMs);
}

export type ProminenceInput = {
  /** Server popularity score [0,1]; absent/null → 0 (fairness floor). */
  base?: number | null;
  /** Event start ISO string. Omit for places (no expiry). */
  dateStr?: string | null;
  /** Event end ISO string (optional). */
  endDateStr?: string | null;
  /** Item creation ISO string — drives the newcomer boost. */
  createdAt?: string | null;
  /** User follows the event's contributor or the place itself. */
  isFollowed?: boolean;
  /** User has RSVP'd / considered / otherwise directly engaged. */
  isEngaged?: boolean;
  /** Mutual friend activity exists for this item. */
  hasFriendActivity?: boolean;
  /** Place-owned upcoming event activity, normalized to [0,1]. */
  placeActivity?: number | null;
  /** Current time in ms (injected for testability). Defaults to Date.now(). */
  now?: number;
};

/**
 * Fold the server popularity base + live time-proximity + newcomer boost
 * into a single prominence value ∈ [0,1].
 */
export function computeProminence(input: ProminenceInput): number {
  const now = input.now ?? Date.now();
  const base = clamp01(input.base ?? 0);
  const boost = newcomerBoost(input.createdAt, now);
  if (!input.dateStr) {
    const activity = clamp01(input.placeActivity ?? PLACE_TIME_PROXIMITY);
    return clamp01(
      W_PLACE_FOLLOW * (input.isFollowed ? 1 : 0) +
      W_PLACE_ACTIVITY * activity +
      W_PLACE_POP * base +
      boost
    );
  }

  const timeProx = timeProximity(input.dateStr, input.endDateStr, now);
  return clamp01(
    W_FOLLOW * (input.isFollowed ? 1 : 0) +
    W_TIME * timeProx +
    W_ENGAGED * (input.isEngaged ? 1 : 0) +
    W_FRIEND * (input.hasFriendActivity ? 1 : 0) +
    W_POP * base +
    boost
  );
}

/**
 * Decide a marker's tier for the current zoom given its prominence.
 * Prominence shifts the dot/mid thresholds *down* by up to
 * PROMINENCE_ZOOM_SPAN, so higher-prominence markers reach mid/full sooner.
 * A prominence-0 marker still becomes full at MID_MODE_ZOOM — never trapped
 * as a dot (fairness floor).
 */
export function markerTier(
  zoom: number,
  prominence: number,
  options: {
    kind?: MarkerKind;
    isFollowed?: boolean;
    isLive?: boolean;
  } = {}
): MarkerTier {
  const kind = options.kind ?? "event";
  if (kind === "place") {
    return zoom < PLACE_FULL_MARKER_ZOOM ? "dot" : "full";
  }

  if (
    options.isFollowed &&
    options.isLive &&
    zoom >= EVENT_FOLLOWED_LIVE_FULL_ZOOM
  ) {
    return "full";
  }
  if (zoom < EVENT_MID_MARKER_ZOOM) return "dot";
  if (zoom < EVENT_FULL_MARKER_ZOOM) return "mid";
  return "full";
}
