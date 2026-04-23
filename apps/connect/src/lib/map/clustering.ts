/**
 * Progressive geographic clustering for the Connect map.
 *
 * The map must stay legible at every zoom.  Rendering every event / place
 * marker from zoom 0 creates a wall of overlapping icons over major cities.
 * This module quantises points into coarse → fine geographic buckets so we
 * can render a small number of counted "bubbles" at low zoom and smoothly
 * hand over to individual markers as the user zooms in.
 *
 * Tiers (user-confirmed zoom thresholds — see DECISIONS, batch "bubble
 * split/recouple"):
 *   capital  zooms 0–5    (capital cities)
 *   town     zooms 6–8    (towns)
 *   suburb   zooms 9–11   (suburbs)
 *   markers  zooms 12+    (individual events / places)
 *
 * Tiers crossfade with a 1-zoom overlap so the transitions feel smooth
 * instead of snap-swapping between grouping levels.  Below zoom 12 there
 * is always exactly one "active" bubble tier visible; from zoom 12 onward
 * no bubbles render — only individual markers.
 *
 * Each tier also supports an interactive "split / recouple" model layered
 * by EventMap: a click on a bubble splits it into the child tier (or into
 * individual markers when clicked at the suburb tier).  See
 * `childTierOf`, `pointsInBubble`, and `bucketKeyOf` below — they are the
 * pure pieces of that interaction; the DOM choreography lives in the
 * map component.
 *
 * Grid quantisation is deliberately a plain lat/lng grid — fast, pure,
 * deterministic, and easy to test.  This is good enough for the v1
 * visualisation over Southern Africa; a server-side Supabase RPC with
 * admin-region aggregation can replace it later without changing the
 * render layer (see DECISIONS, "progressive geo-clustering v1 client-side").
 */

export type ClusterTier = "capital" | "town" | "suburb";

export type ClusterPoint = {
  /** Stable id (e.g. event/place row id) — used as React / marker key. */
  id: string;
  lat: number;
  lng: number;
};

export type ClusterBubble = {
  /** Stable bucket key — composed of tier + grid cell.  Used as marker key
   *  so MapLibre can reuse the element across re-renders. */
  key: string;
  tier: ClusterTier;
  /** Weighted average centre of the points in this bucket. */
  lat: number;
  lng: number;
  /** Number of source points in the bucket. */
  count: number;
};

/** Grid cell size in degrees per tier.  Roughly:
 *  capital ≈ 400 km, town ≈ 45 km, suburb ≈ 5 km.
 *  (1° ≈ 111 km at the equator; error grows toward the poles but SA is
 *  well-behaved and the buckets don't need to be perfectly uniform.)
 */
const GRID_SIZE_DEG: Record<ClusterTier, number> = {
  capital: 4,
  town: 0.4,
  suburb: 0.05,
};

/**
 * Zoom band for each tier.  The bubble tier is fully opaque inside its
 * `[fullStart, fullEnd]` core and crossfades over `FADE_WIDTH` zoom levels
 * on either side.  From zoom 12 upward there is no bubble tier — the
 * individual event/place markers (the `marker` "tier") take over.
 *
 * Invariant: every zoom in [0, MARKER_FADE_IN_END] has at least one tier
 * (bubble or marker) at opacity > 0 so the map never looks "empty".
 */
const TIER_BANDS: Record<ClusterTier, { fullStart: number; fullEnd: number }> =
  {
    capital: { fullStart: 0, fullEnd: 5 },
    town: { fullStart: 6, fullEnd: 8 },
    suburb: { fullStart: 9, fullEnd: 11 },
  };

/** Zoom levels below which markers are invisible / above which fully visible.
 *  Markers fade in across the suburb tier's fade-out so the handover
 *  reads as a single smooth crossfade. */
export const MARKER_FADE_IN_START = 11;
export const MARKER_FADE_IN_END = 12;

/** Width (in zoom levels) of the crossfade ramp on either side of a tier
 *  core.  1 zoom level produces one-step crossfades that feel snappy
 *  without snap-popping between tiers. */
const FADE_WIDTH = 1;

/** Parent → child tier order.  `null` means "the layer below this is
 *  individual markers, not another bubble tier". */
const CHILD_TIER: Record<ClusterTier, ClusterTier | null> = {
  capital: "town",
  town: "suburb",
  suburb: null,
};

/** Returns the tier whose bubbles a click on a `tier` bubble should split
 *  into, or `null` to mean "split to individual events / places". */
export function childTierOf(tier: ClusterTier): ClusterTier | null {
  return CHILD_TIER[tier];
}

/**
 * Smooth-step helper (0 → 1) used for opacity crossfades.  Produces a
 * gentler curve than a raw linear ramp, which matches how the user's
 * tile-colour progression reads on screen.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Quantise a lat/lng to its grid cell at the given tier and return the
 *  stable bucket key (`tier:bx:by`).  Exposed so EventMap can ask
 *  "which bubble does this point belong to?" when filtering points to
 *  show under an expanded parent. */
export function bucketKeyOf(
  tier: ClusterTier,
  lat: number,
  lng: number,
): string {
  const g = GRID_SIZE_DEG[tier];
  const bx = Math.floor(lng / g);
  const by = Math.floor(lat / g);
  return `${tier}:${bx}:${by}`;
}

/** Internal alias kept for legibility inside this module. */
function bucketKey(tier: ClusterTier, lat: number, lng: number): string {
  return bucketKeyOf(tier, lat, lng);
}

/**
 * Group points into tier buckets.  Returns one bubble per non-empty cell.
 * Centroid is the mean of member lat/lng (weighted equally — good enough
 * for visualisation; avoids a single outlier dragging the label off-centre).
 *
 * Note: singleton buckets (count === 1) are also returned.  The render
 * layer decides whether to show them as bubbles or to let the individual
 * marker take over at the same zoom — usually driven by `tierOpacityAt`.
 */
export function bucketPoints(
  points: readonly ClusterPoint[],
  tier: ClusterTier,
): ClusterBubble[] {
  if (points.length === 0) return [];
  const map = new Map<
    string,
    { latSum: number; lngSum: number; count: number }
  >();
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const k = bucketKey(tier, p.lat, p.lng);
    const existing = map.get(k);
    if (existing) {
      existing.latSum += p.lat;
      existing.lngSum += p.lng;
      existing.count += 1;
    } else {
      map.set(k, { latSum: p.lat, lngSum: p.lng, count: 1 });
    }
  }
  const out: ClusterBubble[] = [];
  for (const [key, b] of map) {
    out.push({
      key,
      tier,
      lat: b.latSum / b.count,
      lng: b.lngSum / b.count,
      count: b.count,
    });
  }
  return out;
}

/**
 * Opacity (0–1) for a given tier at a given zoom.  Outside its band the
 * tier fades to 0 over `FADE_WIDTH` zoom levels.  This is what produces
 * the "bubbles split smoothly as you zoom in" effect the UX requires.
 */
export function tierOpacityAt(tier: ClusterTier, zoom: number): number {
  const band = TIER_BANDS[tier];
  if (zoom >= band.fullStart && zoom <= band.fullEnd) return 1;
  if (zoom < band.fullStart) {
    // fade-in window: smoothstep from (fullStart - FADE_WIDTH) → fullStart
    return smoothstep(band.fullStart - FADE_WIDTH, band.fullStart, zoom);
  }
  // zoom > fullEnd → fade-out window: fullEnd → fullEnd + FADE_WIDTH
  return 1 - smoothstep(band.fullEnd, band.fullEnd + FADE_WIDTH, zoom);
}

/**
 * Opacity (0–1) for the individual marker layer at a given zoom.  Fades
 * in from `MARKER_FADE_IN_START` → `MARKER_FADE_IN_END` so markers appear
 * underneath the last bubble tier (`suburb`) before it fully fades out.
 */
export function markerOpacityAt(zoom: number): number {
  return smoothstep(MARKER_FADE_IN_START, MARKER_FADE_IN_END, zoom);
}

/**
 * Bubble diameter in CSS pixels as a function of count.  Log scale keeps a
 * "2 vs 200" bubble from ballooning off-screen while still making larger
 * groupings visibly larger.  Floor 28, ceiling 56.
 */
export function bubbleSizeForCount(count: number): number {
  if (count <= 0) return 28;
  const MIN = 28;
  const MAX = 56;
  // log2(1)=0, log2(100)~6.64 → map 1..100 roughly to 28..56
  const raw = MIN + Math.log2(count + 1) * 4.2;
  return Math.max(MIN, Math.min(MAX, Math.round(raw)));
}

/**
 * Returns every tier whose current opacity at `zoom` would be non-zero.
 * Useful for callers that want to build bubble data only for visible
 * tiers (skipping work on tiers that would be invisible anyway).
 */
export function visibleTiersAt(zoom: number): ClusterTier[] {
  const all: ClusterTier[] = ["capital", "town", "suburb"];
  return all.filter((t) => tierOpacityAt(t, zoom) > 0);
}

/**
 * Filter a point set down to the points whose grid cell at `bubble.tier`
 * matches `bubble.key`.  Used by the click-to-split interaction so we can
 * compute child bubbles (or the individual points for a suburb expansion)
 * without recomputing the full tier bucket for every other point.
 */
export function pointsInBubble<P extends ClusterPoint>(
  bubble: ClusterBubble,
  points: readonly P[],
): P[] {
  const out: P[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (bucketKeyOf(bubble.tier, p.lat, p.lng) === bubble.key) {
      out.push(p);
    }
  }
  return out;
}
