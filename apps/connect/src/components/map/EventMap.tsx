"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Event, EventCategory, PlaceCategory, Place } from "@/types/db";
import { ORGANISER_ROLES } from "@/types/db";
import {
  createCategoryMarkerEl,
  createCustomMarkerEl,
  createPlaceMarkerEl,
  createGeoClusterBubbleEl,
  updateGeoClusterBubbleEl,
  setBubbleExpanded,
  getTemporalStyle,
  escapeHtml,
  PLACE_MARKER_SIZE,
  PLACE_ICON_RATIO,
} from "@/lib/map/markers";
import { getMapStyle, getMapStyleInfo, toLngLat, DEFAULT_CENTER } from "@/lib/map/config";
import { getCurrentPosition } from "@/lib/capacitor/geolocation";
import { PLACE_CATEGORY_KEYWORDS, PLACE_CATEGORY_HEX } from "@/lib/categories";
import {
  bucketPoints,
  tierOpacityAt,
  markerOpacityAt,
  bubbleSizeForCount,
  visibleTiersAt,
  childTierOf,
  pointsInBubble,
  bucketKeyOf,
  MARKER_FADE_IN_END,
  type ClusterBubble,
  type ClusterPoint,
} from "@/lib/map/clustering";

type Props = {
  events: Event[];
  places?: Place[];
  onSelectPlace?: (place: Place) => void;
  onQuickAction?: (action: "view" | "join" | "share" | "consider" | "visit", event: Event) => void;
  /** Events the current user has an 'attending' RSVP on.  Used by the
   *  map marker popup to swap the Join button to a gold "Joined" state
   *  with a tick so the popup reflects existing attendance. */
  rsvpEventIds?: Set<string>;
  /** Events the current user is 'considering'.  Swaps the Consider
   *  button into a gold "Considering" state when set. */
  considerEventIds?: Set<string>;
  center?: [number, number];
  zoom?: number;
  autoLocate?: boolean;
  flyTo?: [number, number] | null;
  flyToZoom?: number;
  /** Monotonically increases whenever a caller wants the map to re-fly to
   *  `flyTo` even if the coordinates / zoom are unchanged. Lets a consumer
   *  force the camera to revisit the same event on repeated taps. */
  flyToToken?: number;
  activeCategories?: Set<EventCategory>;
  activePlaceCategories?: Set<PlaceCategory>;
  /** Override marker border colour (used by quick-access tools for unified colour). */
  markerOverrideColor?: string;
  /** When true, skip rendering event markers so only place markers show.
   *  Wired to the burger menu "Places" tab. */
  placesMode?: boolean;
  /** Fires whenever the camera bearing changes. Used by the floating
   *  compass button which only appears when the map is rotated. */
  onBearingChange?: (deg: number) => void;
  /** Monotonically-increasing token; when it increments the map resets
   *  bearing and pitch to 0 (Google-Maps-style "north up" reset). */
  resetBearingToken?: number;
  /** Monotonically-increasing token; when it increments the map flies to
   *  the user's current position (locate-me FAB). */
  locateMeToken?: number;
  /** Fires after the camera settles (moveend) so the parent can surface
   *  the "Search this area" pill. */
  onMoveEnd?: () => void;
  /** Fires after the camera settles with the current map viewport bbox.
   *  Used by the "Search this area" pill to scope events/places by the
   *  visible region. Coords are WGS84 `[west, south, east, north]`. */
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  /** When set, the marker with this event id gets a pulsing gold ring
   *  (list-to-map sync). */
  highlightedEventId?: string | null;
};

/* ── Persist map viewpoint across navigations ── */
const MAP_VIEW_KEY = "cc-map-viewpoint";

/** Minimum zoom level to show place markers (~30% of a single city). */
const PLACE_ZOOM_MIN = 14;

/** Below this zoom, run marker deconfliction with leader lines. */
const DECONFLICT_MAX_ZOOM = 13;

/** Minimum pixel gap between marker edges — 0 allows touching but never overlapping. */
const MIN_GAP_PX = 0;

/** Number of force-simulation iterations for deconfliction. */
const DECONFLICT_ITERATIONS = 4;

/** Returns a scale factor [0.55 – 1.0] based on current zoom.
 *  Markers stay at their default size across normal viewing zooms and only
 *  shrink when the user zooms far out (regional / country view). */
function zoomScale(z: number): number {
  // At zoom >= 10 markers are full size; at zoom <= 4 markers shrink to 55%.
  if (z >= 10) return 1;
  if (z <= 4) return 0.55;
  return 0.55 + ((z - 4) / (10 - 4)) * (1 - 0.55);
}

/** Below this zoom, markers collapse to solid category-coloured dots so many
 *  points across a province/country remain distinguishable without clutter. */
const DOT_MODE_ZOOM = 7;

/** Between DOT_MODE_ZOOM and this zoom, markers are shown at full size but
 *  the inner glyph is slightly faded — a Google-Maps-style "mid tier" that
 *  cross-fades between dot and full marker presentation. */
const MID_MODE_ZOOM = 10;

/** Size (px) of a dot-mode marker regardless of base size — small and uniform. */
const DOT_MODE_SIZE = 10;

/* ── Event markers render at their true lat/lng at every zoom level ──
 * The previous "sticky 50 km ring" feature pinned off-screen markers to
 * the viewport edge with a directional spike and distance-based opacity
 * falloff. It was removed because the edge-pinned markers dimmed icons
 * when zoomed out, drifted to unhelpful positions during panning, and
 * only reconciled on drag-release. Markers now always render at their
 * real coordinates — clustering handles density at low zoom.
 */

/** Returns true when the user has opted into reduced motion. Used to bypass
 *  cinematic fly curves and marker animations for accessibility. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Shared easing — ease-out quad. Gives motion a Google-Maps-like gentle
 *  deceleration instead of MapLibre's default linear ramp. */
const EASE_OUT_QUAD = (t: number): number => t * (2 - t);

/** Shared flyTo options for cinematic camera moves. */
const FLY_TO_OPTS: Pick<maplibregl.FlyToOptions, "curve" | "speed" | "easing"> = {
  curve: 1.42,
  speed: 0.9,
  easing: EASE_OUT_QUAD,
};

export default function EventMap({
  events,
  places = [],
  onSelectPlace,
  onQuickAction,
  center = DEFAULT_CENTER,
  zoom = 12,
  autoLocate = false,
  flyTo = null,
  flyToZoom,
  flyToToken,
  activeCategories,
  activePlaceCategories,
  markerOverrideColor,
  placesMode = false,
  onBearingChange,
  resetBearingToken,
  locateMeToken,
  onMoveEnd,
  onBoundsChange,
  highlightedEventId = null,
  rsvpEventIds,
  considerEventIds,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);          // event markers
  const placeMarkersRef = useRef<maplibregl.Marker[]>([]);     // place markers (zoom-gated)
  const geoMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userPositionRef = useRef<[number, number] | null>(null);
  const readyRef = useRef(false);
  const hasRestoredView = useRef(false);

  // Stable refs so marker click handlers always see latest callbacks
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;
  const onQuickActionRef = useRef(onQuickAction);
  onQuickActionRef.current = onQuickAction;
  const activeCategoriesRef = useRef(activeCategories);
  activeCategoriesRef.current = activeCategories;
  const activePlaceCategoriesRef = useRef(activePlaceCategories);
  activePlaceCategoriesRef.current = activePlaceCategories;
  // When the burger menu "Locations" tab is active, the user has explicitly
  // asked to see places — bypass the zoom-gate so place markers render at
  // any zoom (otherwise the tab appears broken until the user zooms in).
  const placesModeRef = useRef(placesMode);
  placesModeRef.current = placesMode;
  const onBearingChangeRef = useRef(onBearingChange);
  onBearingChangeRef.current = onBearingChange;
  const onMoveEndRef = useRef(onMoveEnd);
  onMoveEndRef.current = onMoveEnd;
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  // RSVP / consider membership sets — kept in refs so the popup HTML picks
  // up the freshest value each time a marker is clicked instead of baking
  // in a stale snapshot at marker-creation time.
  const rsvpEventIdsRef = useRef(rsvpEventIds);
  rsvpEventIdsRef.current = rsvpEventIds;
  const considerEventIdsRef = useRef(considerEventIds);
  considerEventIdsRef.current = considerEventIds;

  // Deconfliction data: stores each event/place marker + its lat/lng + icon-to-outer ratio
  const evtMarkerDataRef = useRef<{ marker: maplibregl.Marker; lngLat: [number, number]; baseSize: number; iconRatio: number; eventId: string }[]>([]);
  const placeMarkerDataRef = useRef<{ marker: maplibregl.Marker; lngLat: [number, number]; baseSize: number; iconRatio: number }[]>([]);
  const svgOverlayRef = useRef<SVGSVGElement | null>(null);
  const runDeconflictionRef = useRef<() => void>(() => {});
  const updateMarkerSizesRef = useRef<() => void>(() => {});

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    placeMarkersRef.current.forEach((m) => m.remove());
    placeMarkersRef.current = [];
    evtMarkerDataRef.current = [];
    placeMarkerDataRef.current = [];
    // Clear leader lines
    const svg = svgOverlayRef.current;
    if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
  }, []);

  /* ── Progressive geo-clustering (see lib/map/clustering.ts) ──
   * Per-tier bubble markers keyed by `tier:gridX:gridY` so re-renders
   * reuse MapLibre marker elements instead of remounting every frame.
   * Populated by `rebuildGeoClusters`, opacity adjusted by `updateGeoClusterOpacity`. */
  const geoClusterMarkersRef = useRef<
    Map<string, { marker: maplibregl.Marker; el: HTMLDivElement; bubble: ClusterBubble }>
  >(new Map());

  const clearGeoClusters = useCallback(() => {
    geoClusterMarkersRef.current.forEach(({ marker }) => marker.remove());
    geoClusterMarkersRef.current.clear();
  }, []);

  /* ── Bubble click-to-split / recouple state ──
   * When a user clicks a bubble it splits into the child tier (or into
   * individual events/places at the suburb tier).  The parent bubble is
   * hidden while expanded, and child markers are spawned with a fly-out
   * animation that originates from the parent's screen position.
   *
   * Expand rules (April 2026 spec):
   *   - ALL tiers multi-expand. Opening another bubble at any tier
   *     never auto-collapses an already-open one. A staged outside
   *     map-click (see `collapseInnermostTier`) or a zoom-OUT across
   *     a tier band boundary are the only triggers that recouple.
   *
   * For non-suburb expansions `childMarkers` holds the spawned bubble
   * markers.  For suburb expansions `childMarkers` is empty — the visual
   * is provided by lifting the existing event/place markers (forcing
   * their opacity + visibility on regardless of zoom-fade).
   */
  type ExpansionState = {
    parent: ClusterBubble;
    childMarkers: { marker: maplibregl.Marker; el: HTMLDivElement }[];
  };
  const expansionsRef = useRef<Map<string, ExpansionState>>(new Map());

  /** Memoised set of suburb bucket-keys that are currently expanded.
   *  Reset every time the expansion map is mutated by `expandBubble` /
   *  `collapseExpansion` / `collapseAllExpansions` (see
   *  `liftedSuburbKeysRef.current = null` calls).  The opacity /
   *  visibility passes call `liftedSuburbKeys()` which lazily builds
   *  the set once per change and reuses it across all marker iterations
   *  in that pass — turns the per-marker per-frame cost from
   *  O(open-suburbs) into O(1). */
  const liftedSuburbKeysRef = useRef<Set<string> | null>(null);
  const liftedSuburbKeys = (): Set<string> => {
    if (liftedSuburbKeysRef.current) return liftedSuburbKeysRef.current;
    const out = new Set<string>();
    for (const { parent } of expansionsRef.current.values()) {
      if (parent.tier === "suburb") out.add(parent.key);
    }
    liftedSuburbKeysRef.current = out;
    return out;
  };

  /** True when (lat, lng) falls inside any currently-expanded suburb's
   *  grid cell — used by the opacity / visibility passes to keep the
   *  lifted event/place markers visible. */
  const isPointLiftedBySuburb = useCallback(
    (lat: number, lng: number): boolean => {
      const keys = liftedSuburbKeys();
      if (keys.size === 0) return false;
      // Only one suburb-grid lookup per call — bucketKeyOf is two
      // Math.floors on the same constant grid size for every check.
      return keys.has(bucketKeyOf("suburb", lat, lng));
    },
    [],
  );

  /**
   * Fade-fn helper — composes the individual marker's zoom-based opacity
   * crossfade (`markerOpacityAt`) with the temporal styling already
   * baked in at marker creation (`temporal.opacity`), which we stash on
   * `data-temporal-opacity` so we can recover it without recomputing.
   * Without this multiply, past-event dimming is lost during tier handover.
   */
  const applyComposedOpacity = (el: HTMLElement, markerOp: number) => {
    const raw = el.dataset.temporalOpacity;
    const temporal = raw ? parseFloat(raw) : 1;
    const t = Number.isFinite(temporal) ? temporal : 1;
    // When both are at their natural max, clear the override so any other
    // code paths (future highlights, etc.) can keep acting on opacity.
    if (markerOp >= 1 && t >= 1) {
      el.style.opacity = "";
    } else {
      el.style.opacity = String(t * markerOp);
    }
  };

  /**
   * Apply zoom-driven opacity to bubble markers + individual event/place
   * markers.  Called on every zoom change so tiers crossfade smoothly.
   * Honours the active expansion state: parent bubbles that are currently
   * "split open" stay hidden, and the markers lifted under expanded
   * suburbs stay fully visible regardless of the zoom-fade.
   * Pure presentation — does not add/remove markers.
   */
  const updateGeoClusterOpacity = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();

    geoClusterMarkersRef.current.forEach(({ el, bubble }) => {
      // An expanded parent stays hidden until the user recouples — we
      // don't want it pulsing back through the tier-fade ramp.
      if (expansionsRef.current.has(bubble.key)) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        el.style.visibility = "hidden";
        return;
      }
      const o = tierOpacityAt(bubble.tier, z);
      el.style.opacity = String(o);
      // Hide entirely when fully invisible so pointer events don't block
      // the individual markers that have taken over.
      el.style.pointerEvents = o > 0.02 ? "auto" : "none";
      el.style.visibility = o > 0.01 ? "visible" : "hidden";
    });

    // When filters / placesMode are active, clustering is off and the user
    // should see their filtered markers at every zoom.  Skip the fade.
    const filtersActive =
      placesModeRef.current ||
      (activeCategoriesRef.current && activeCategoriesRef.current.size > 0) ||
      (activePlaceCategoriesRef.current &&
        activePlaceCategoriesRef.current.size > 0);
    if (filtersActive) {
      markersRef.current.forEach((m) => {
        const el = m.getElement() as HTMLElement;
        applyComposedOpacity(el, 1);
      });
      placeMarkersRef.current.forEach((m) => {
        const el = m.getElement() as HTMLElement;
        applyComposedOpacity(el, 1);
      });
      return;
    }

    // Fade individual markers in as bubbles fade out.  Composed with the
    // temporal opacity so past/live dimming still reads during handover.
    // Markers lifted by an expanded suburb skip the fade and force-show.
    //
    // NOTE on visibility: below zoom 12 `markerOp === 0`, which clears
    // opacity but leaves the DOM element hit-testable and prone to
    // clutter the view behind the totalling bubbles.  We explicitly
    // flip `visibility` so events + places are truly hidden at city
    // zooms — only lifted (suburb-expansion) or filter-active markers
    // bypass the gate.
    const markerOp = markerOpacityAt(z);
    const hideBelowMarkerZoom = markerOp === 0;
    evtMarkerDataRef.current.forEach(({ marker, lngLat }) => {
      const el = marker.getElement() as HTMLElement;
      const lifted = isPointLiftedBySuburb(lngLat[1], lngLat[0]);
      if (lifted) {
        el.style.visibility = "";
        el.style.opacity = "1";
        el.style.zIndex = "20";
      } else if (hideBelowMarkerZoom) {
        el.style.visibility = "hidden";
        el.style.zIndex = "";
      } else {
        el.style.visibility = "";
        el.style.zIndex = "";
        applyComposedOpacity(el, markerOp);
      }
    });
    placeMarkerDataRef.current.forEach(({ marker, lngLat }) => {
      const el = marker.getElement() as HTMLElement;
      const lifted = isPointLiftedBySuburb(lngLat[1], lngLat[0]);
      if (lifted) {
        el.style.visibility = "";
        el.style.opacity = "1";
        el.style.zIndex = "20";
      } else if (hideBelowMarkerZoom) {
        // `updatePlaceVisibility` owns the authoritative visibility for
        // places (it factors in placesMode + category filters + the
        // PLACE_ZOOM_MIN threshold).  Defer to it rather than stomping
        // visibility here.
        el.style.zIndex = "";
        applyComposedOpacity(el, 0);
      } else {
        el.style.zIndex = "";
        applyComposedOpacity(el, markerOp);
      }
    });
  }, [isPointLiftedBySuburb]);

  /* ── Bubble split / recouple internals ────────────────── */

  /**
   * Animate a freshly-spawned child element to fly out from `originPx`
   * (the parent bubble's screen position) to its own real position.
   *
   * Uses inner-div transform so MapLibre's translate on the marker root
   * stays untouched — same trick used by `cc-marker-new` for the existing
   * drop-in animation.  Skipped when the user prefers reduced motion.
   */
  const animateChildSpawn = (
    childEl: HTMLElement,
    originPx: { x: number; y: number },
    targetPx: { x: number; y: number },
  ) => {
    if (prefersReducedMotion()) return;
    const dx = originPx.x - targetPx.x;
    const dy = originPx.y - targetPx.y;
    // Animate the OUTER bubble element — a single transform-able layer
    // that doesn't fight MapLibre (the bubble has no `.cc-marker-outer`
    // child, so target the root directly).  We pre-set the start
    // transform off-frame via `style.transform` then transition into
    // place on the next animation frame.
    const body = childEl.querySelector<HTMLElement>(
      "[data-cc-bubble-body]",
    );
    const target = body ?? childEl;
    target.style.transition = "none";
    target.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.4)`;
    target.style.opacity = "0";
    requestAnimationFrame(() => {
      target.style.transition =
        "transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease";
      target.style.transform = "translate(0px, 0px) scale(1)";
      target.style.opacity = "1";
    });
  };

  /** Returns the union of every event + place point currently on the
   *  map as `ClusterPoint`s — used both by clustering and by point
   *  filtering during expansion. */
  const collectAllPoints = useCallback((): ClusterPoint[] => {
    const out: ClusterPoint[] = [];
    for (const e of events) {
      if (e.latitude == null || e.longitude == null) continue;
      out.push({ id: e.id, lat: e.latitude, lng: e.longitude });
    }
    for (const p of places) {
      out.push({ id: `place:${p.id}`, lat: p.latitude, lng: p.longitude });
    }
    return out;
  }, [events, places]);

  /** Tear down a single expansion: remove its child markers, restore the
   *  parent bubble's natural state.  Safe to call with an unknown key. */
  const collapseExpansion = useCallback((key: string) => {
    const exp = expansionsRef.current.get(key);
    if (!exp) return;
    for (const { marker, el } of exp.childMarkers) {
      // Brief fade-out so the recouple feels intentional.
      if (!prefersReducedMotion()) {
        const body = el.querySelector<HTMLElement>("[data-cc-bubble-body]");
        const target = body ?? el;
        target.style.transition = "transform 180ms ease, opacity 180ms ease";
        target.style.transform = "scale(0.4)";
        target.style.opacity = "0";
        setTimeout(() => marker.remove(), 180);
      } else {
        marker.remove();
      }
    }
    expansionsRef.current.delete(key);
    liftedSuburbKeysRef.current = null;
    // Restore parent bubble visibility on next opacity pass.
    const rec = geoClusterMarkersRef.current.get(key);
    if (rec) setBubbleExpanded(rec.el, false);
  }, []);

  /** Tear down every expansion (used by outside-click recouple + zoom
   *  band changes). */
  const collapseAllExpansions = useCallback(() => {
    const keys = [...expansionsRef.current.keys()];
    for (const k of keys) collapseExpansion(k);
    // Repaint markers/place visibility now that nothing is lifted.
    updateGeoClusterOpacityRef.current();
    updatePlaceVisibilityRef.current();
  }, [collapseExpansion]);

  const collapseAllExpansionsRef = useRef<() => void>(() => {});
  collapseAllExpansionsRef.current = collapseAllExpansions;

  /**
   * Staged recouple — collapses only the *innermost* open tier.
   *
   * Tier nesting (outer → inner): capital ⟶ town ⟶ suburb ⟶ marker.
   * Opening a town bubble reveals suburb bubbles; opening a suburb
   * bubble lifts the underlying event / place markers. So if the user
   * has expanded a capital (→ towns) and then one of those towns
   * (→ suburbs) and then one of those suburbs (→ lifted markers), a
   * single outside map click should collapse the suburb expansion
   * first (re-show the suburb bubbles), the next click collapses the
   * town expansion (re-show the town bubble), and so on — reversing
   * the drill-down one level at a time.
   *
   * This replaces the prior "one map click collapses everything"
   * behaviour that the user found too aggressive (it also killed
   * suburb expansions when the user just clicked an event marker that
   * happened to have its MapLibre canvas click bubble up).
   *
   * Returns true if any collapse happened.
   */
  const collapseInnermostTier = useCallback((): boolean => {
    const exp = expansionsRef.current;
    if (exp.size === 0) return false;
    // Priority: suburb expansions are "innermost" (they lift markers),
    // then town, then capital.
    const priority: Array<ClusterBubble["tier"]> = ["suburb", "town", "capital"];
    for (const tier of priority) {
      const keysAtTier: string[] = [];
      for (const [k, s] of exp) {
        if (s.parent.tier === tier) keysAtTier.push(k);
      }
      if (keysAtTier.length > 0) {
        for (const k of keysAtTier) collapseExpansion(k);
        updateGeoClusterOpacityRef.current();
        updatePlaceVisibilityRef.current();
        return true;
      }
    }
    return false;
  }, [collapseExpansion]);

  const collapseInnermostTierRef = useRef<() => boolean>(() => false);
  collapseInnermostTierRef.current = collapseInnermostTier;

  /**
   * Open a bubble — split it into its child tier (or into individual
   * events/places at the suburb tier).  Enforces the single-expand /
   * multi-expand rules from the spec.
   *
   * Implementation notes:
   *  - For non-suburb expansions we spawn fresh `createGeoClusterBubbleEl`
   *    markers for each child bucket.  Those children are themselves
   *    clickable, allowing further drill-down.
   *  - For suburb expansions we DON'T spawn child markers — instead we
   *    leave the implicit "lifted" state (tracked via expansionsRef) and
   *    let `updateGeoClusterOpacity` + `updatePlaceVisibility` force the
   *    underlying event/place markers visible.  This keeps the user's
   *    real category-coloured icons on screen instead of generic count-1
   *    bubbles.
   */
  const expandBubble = useCallback(
    (parent: ClusterBubble) => {
      const map = mapRef.current;
      if (!map) return;
      // Already expanded? Toggle off (recouple this one specifically).
      if (expansionsRef.current.has(parent.key)) {
        collapseExpansion(parent.key);
        updateGeoClusterOpacityRef.current();
        updatePlaceVisibilityRef.current();
        return;
      }

      // Multi-expand across every tier (spec change, April 2026):
      // opening another cluster should NEVER auto-collapse an already
      // open one. Only an outside map-click or a zoom-out across a
      // tier boundary triggers recouple, and even then it's staged
      // one level at a time.

      const childTier = childTierOf(parent.tier);
      const allPoints = collectAllPoints();
      const member = pointsInBubble(parent, allPoints);

      const state: ExpansionState = { parent, childMarkers: [] };

      if (childTier !== null) {
        // Build child bubbles within the parent's grid cell.
        const childBuckets = bucketPoints(member, childTier);
        const originPx = map.project([parent.lng, parent.lat]);
        for (const child of childBuckets) {
          const size = bubbleSizeForCount(child.count);
          const el = createGeoClusterBubbleEl(child.count, size);
          el.classList.add("cc-geo-cluster-child");
          attachBubbleClickHandlerRef.current(el, child);
          const marker = new maplibregl.Marker({
            element: el,
            anchor: "center",
          })
            .setLngLat([child.lng, child.lat])
            .addTo(map);
          const targetPx = map.project([child.lng, child.lat]);
          animateChildSpawn(el, originPx, targetPx);
          state.childMarkers.push({ marker, el });
        }
      }
      // For suburb (childTier === null) we rely on the lifted-marker
      // path — registering the expansion is enough.

      expansionsRef.current.set(parent.key, state);
      liftedSuburbKeysRef.current = null;

      // Hide the parent bubble + repaint dependent layers.
      const rec = geoClusterMarkersRef.current.get(parent.key);
      if (rec) setBubbleExpanded(rec.el, true);
      updateGeoClusterOpacityRef.current();
      updatePlaceVisibilityRef.current();
    },
    [collapseExpansion, collectAllPoints],
  );

  /**
   * Attach click + keyboard handlers that split the bubble in place.
   * Replaces the previous "drill the camera in by 2 zooms" behaviour.
   */
  const attachBubbleClickHandler = (
    el: HTMLElement,
    b: ClusterBubble,
  ) => {
    const onClick = (ev: MouseEvent) => {
      ev.stopPropagation();
      expandBubble(b);
    };
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", (ev) => {
      const e = ev as KeyboardEvent;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        expandBubble(b);
      }
    });
  };
  const attachBubbleClickHandlerRef = useRef<
    (el: HTMLElement, b: ClusterBubble) => void
  >(() => {});
  attachBubbleClickHandlerRef.current = attachBubbleClickHandler;

  /**
   * Rebuild bubble markers from the current event + place set.  Bubbles
   * are computed for every tier with non-zero opacity at the current
   * zoom, so we don't waste work on tiers that would be invisible.
   * Re-uses existing markers by key to avoid DOM churn when the user is
   * just zooming around with the same data.
   *
   * Preserves expansion state across rebuilds: if a parent bubble that
   * is currently expanded still exists in the new tier set, we leave
   * its expansion in place; if it has gone out of scope, we collapse it
   * silently so we don't leak stale child markers.
   */
  const rebuildGeoClusters = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    // Skip bubbles when the user has filtered or is in "Places" mode —
    // clustering is a discovery affordance, not a filter UI.  When off,
    // `updateGeoClusterOpacity` restores marker opacity (filtersActive branch).
    if (placesModeRef.current) {
      collapseAllExpansionsRef.current();
      clearGeoClusters();
      updateGeoClusterOpacityRef.current();
      return;
    }
    const activeCats = activeCategoriesRef.current;
    const activePlaceCats = activePlaceCategoriesRef.current;
    if ((activeCats && activeCats.size > 0) || (activePlaceCats && activePlaceCats.size > 0)) {
      collapseAllExpansionsRef.current();
      clearGeoClusters();
      updateGeoClusterOpacityRef.current();
      return;
    }

    const points = collectAllPoints();

    const z = map.getZoom();
    const tiers = visibleTiersAt(z);
    const wantedKeys = new Set<string>();
    const wantedBubbles: ClusterBubble[] = [];
    for (const tier of tiers) {
      const buckets = bucketPoints(points, tier);
      for (const b of buckets) {
        // Note: we keep singleton buckets (count === 1) too.  If we
        // suppressed them, isolated rural events would disappear at
        // zoom 11 where `markerOpacityAt` has only just started fading
        // them in.
        wantedKeys.add(b.key);
        wantedBubbles.push(b);
      }
    }

    // Remove bubbles no longer wanted — but if a bubble is currently
    // expanded, drop its expansion first so we don't leak children.
    for (const [key, rec] of geoClusterMarkersRef.current) {
      if (!wantedKeys.has(key)) {
        if (expansionsRef.current.has(key)) {
          collapseExpansion(key);
        }
        rec.marker.remove();
        geoClusterMarkersRef.current.delete(key);
      }
    }

    // Add / update bubbles.
    for (const b of wantedBubbles) {
      const size = bubbleSizeForCount(b.count);
      const existing = geoClusterMarkersRef.current.get(b.key);
      if (existing) {
        if (existing.bubble.count !== b.count) {
          // In-place update preserves the attached listeners + marker binding.
          updateGeoClusterBubbleEl(existing.el, b.count, size);
          // Refresh the stored bubble so next count-diff sees the new count.
          existing.bubble = b;
        }
        continue;
      }
      const el = createGeoClusterBubbleEl(b.count, size);
      attachBubbleClickHandlerRef.current(el, b);
      const marker = new maplibregl.Marker({
        element: el,
        anchor: "center",
      })
        .setLngLat([b.lng, b.lat])
        .addTo(map);
      geoClusterMarkersRef.current.set(b.key, { marker, el, bubble: b });
    }

    updateGeoClusterOpacityRef.current();
  }, [collapseExpansion, collectAllPoints, clearGeoClusters]);

  const rebuildGeoClustersRef = useRef<() => void>(() => {});
  rebuildGeoClustersRef.current = rebuildGeoClusters;
  const updateGeoClusterOpacityRef = useRef<() => void>(() => {});
  updateGeoClusterOpacityRef.current = updateGeoClusterOpacity;

  const saveMapView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const z = map.getZoom();
    try {
      sessionStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ lng: c.lng, lat: c.lat, zoom: z }));
    } catch { /* sessionStorage full or unavailable */ }
  }, []);

  const getStoredView = useCallback((): { lng: number; lat: number; zoom: number } | null => {
    try {
      const raw = sessionStorage.getItem(MAP_VIEW_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }, []);

  /** Authoritative visibility gate for event + place markers.
   *  Below zoom 12 the totalling bubbles own the view, so individual
   *  markers are hidden except when (a) lifted by an open suburb
   *  expansion, or (b) filters / places-mode are active.  Above zoom 12
   *  markers become visible and the bubble tiers fade out.
   *
   *  Name is kept for historical reasons (place-visibility was added
   *  first); the function now owns both layers' visibility. */
  const updatePlaceVisibility = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    const placeCats = activePlaceCategoriesRef.current;
    const hasPlaceCatsSelected = placeCats && placeCats.size > 0;
    const inPlacesMode = placesModeRef.current;
    // Show places when: the user is on the burger "Locations" tab (always),
    // OR explicit place categories are selected, OR they've zoomed in deeply.
    const shouldShow = inPlacesMode || hasPlaceCatsSelected || z >= PLACE_ZOOM_MIN;
    placeMarkerDataRef.current.forEach(({ marker, lngLat }) => {
      const el = marker.getElement() as HTMLElement;
      const lifted = isPointLiftedBySuburb(lngLat[1], lngLat[0]);
      el.style.visibility = lifted || shouldShow ? "" : "hidden";
    });
    // Hide event markers when place categories are selected (user is
    // browsing places), OR when we're at a city zoom where the totalling
    // bubbles own the view.  Suburb-expansion lifts override both gates.
    const hideEventsForZoom = z < MARKER_FADE_IN_END;
    evtMarkerDataRef.current.forEach(({ marker, lngLat }) => {
      const el = marker.getElement() as HTMLElement;
      const lifted = isPointLiftedBySuburb(lngLat[1], lngLat[0]);
      if (lifted) {
        el.style.visibility = "";
        return;
      }
      if (hasPlaceCatsSelected || hideEventsForZoom) {
        el.style.visibility = "hidden";
      } else {
        el.style.visibility = "";
      }
    });
  }, [isPointLiftedBySuburb]);
  const updatePlaceVisibilityRef = useRef<() => void>(() => {});
  updatePlaceVisibilityRef.current = updatePlaceVisibility;

  /** Force-directed deconfliction: spread overlapping markers, draw leader lines. */
  const runDeconfliction = useCallback(() => {
    const map = mapRef.current;
    const svg = svgOverlayRef.current;
    if (!map || !svg || !readyRef.current) return;

    // Clear previous leader lines
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const z = map.getZoom();

    // At close zoom, snap markers back to their real positions
    if (z >= DECONFLICT_MAX_ZOOM) {
      evtMarkerDataRef.current.forEach(({ marker }) => {
        marker.setOffset([0, 0]);
      });
      placeMarkerDataRef.current.forEach(({ marker }) => {
        marker.setOffset([0, 0]);
      });
      return;
    }

    // Combine event + visible place markers for unified deconfliction
    const allMarkerData = [
      ...evtMarkerDataRef.current,
      ...placeMarkerDataRef.current.filter(({ marker }) => {
        const el = marker.getElement() as HTMLElement;
        return el.style.visibility !== "hidden";
      }),
    ];

    // Project lat/lng → screen px
    const items = allMarkerData.map(({ marker, lngLat }) => {
      const px = map.project(lngLat as maplibregl.LngLatLike);
      const el = marker.getElement() as HTMLElement;
      const size = parseInt(el.style.width || "40") || 40;
      return { marker, origX: px.x, origY: px.y, x: px.x, y: px.y, size };
    });

    // Iterative force spread (DECONFLICT_ITERATIONS iterations)
    // Damping factor reduces push per iteration to prevent overshoot
    const DAMPING = 0.5;
    for (let iter = 0; iter < DECONFLICT_ITERATIONS; iter++) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          const minDist = (a.size + b.size) / 2 + MIN_GAP_PX;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0 && dist < minDist) {
            const push = ((minDist - dist) / 2) * DAMPING;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }
    }

    // Apply marker offsets via MapLibre API and draw leader lines from origin to displaced position
    items.forEach(({ marker, origX, origY, x, y }) => {
      const dx = x - origX;
      const dy = y - origY;
      const hasMoved = Math.abs(dx) > 1 || Math.abs(dy) > 1;

      // Use MapLibre's setOffset so the marker actually moves to the line endpoint
      marker.setOffset(hasMoved ? [dx, dy] : [0, 0]);

      if (hasMoved) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", origX.toFixed(1));
        line.setAttribute("y1", origY.toFixed(1));
        line.setAttribute("x2", x.toFixed(1));
        line.setAttribute("y2", y.toFixed(1));
        line.setAttribute("stroke", "transparent");
        line.setAttribute("stroke-width", "0");
        line.setAttribute("stroke-linecap", "round");
        svg.appendChild(line);
      }
    });
  }, []);

  /** Resize event marker elements based on current zoom level.
   *  Scales the outer container, the inner white circle, and the icon glyph
   *  together so the ring-to-icon gap stays visually consistent.
   *  Below DOT_MODE_ZOOM each marker collapses to a small solid category-
   *  coloured dot (via the .cc-marker-dot CSS class). */
  const updateMarkerSizes = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    const scale = zoomScale(z);
    const dotMode = z < DOT_MODE_ZOOM;
    const midMode = !dotMode && z < MID_MODE_ZOOM;

    const resize = (el: HTMLElement, baseSize: number, iconRatio: number) => {
      if (dotMode) {
        el.classList.add("cc-marker-dot");
        el.classList.remove("cc-marker-mid");
        el.style.width = `${DOT_MODE_SIZE}px`;
        el.style.height = `${DOT_MODE_SIZE}px`;
        const outer = el.querySelector<HTMLElement>(".cc-marker-outer");
        if (outer) {
          outer.style.width = `${DOT_MODE_SIZE}px`;
          outer.style.height = `${DOT_MODE_SIZE}px`;
        }
        return;
      }

      el.classList.remove("cc-marker-dot");
      if (midMode) {
        el.classList.add("cc-marker-mid");
      } else {
        el.classList.remove("cc-marker-mid");
      }
      const newSize = Math.round(baseSize * scale);
      const iconSize = Math.round(newSize * iconRatio);
      el.style.width = `${newSize}px`;
      el.style.height = `${newSize}px`;
      const outer = el.querySelector<HTMLElement>(".cc-marker-outer");
      const icon = el.querySelector<HTMLElement>(".cc-marker-icon");
      if (outer) {
        outer.style.width = `${newSize}px`;
        outer.style.height = `${newSize}px`;
      }
      if (icon) {
        icon.style.width = `${iconSize}px`;
        icon.style.height = `${iconSize}px`;
      }
    };

    evtMarkerDataRef.current.forEach(({ marker, baseSize, iconRatio }) => {
      resize(marker.getElement() as HTMLElement, baseSize, iconRatio);
    });
    placeMarkerDataRef.current.forEach(({ marker, baseSize, iconRatio }) => {
      resize(marker.getElement() as HTMLElement, baseSize, iconRatio);
    });
  }, []);

  // Keep stable ref so init-effect listener always calls latest runDeconfliction
  runDeconflictionRef.current = runDeconfliction;
  updateMarkerSizesRef.current = updateMarkerSizes;

  /** Sticky 50 km nearby-event ring — REMOVED.
   *  Previously pinned off-screen markers to the viewport edge with a
   *  distance-based opacity falloff. Produced dimmed icons at low zoom,
   *  drifted during pans, and only reconciled on drag-release. Markers
   *  now render at their true lat/lng for the full zoom range; any
   *  leftover transform/opacity state from prior mounts is cleared here
   *  as a safety-net one-shot so existing in-memory markers don't carry
   *  stale styles forward.
   */
  const clearLegacyRingState = useCallback(() => {
    for (const entry of evtMarkerDataRef.current) {
      const root = entry.marker.getElement() as HTMLElement;
      const outer = root.querySelector<HTMLElement>(".cc-marker-outer");
      if (outer) {
        outer.style.removeProperty("transform");
        outer.style.removeProperty("--cc-ring-bearing");
      }
      root.classList.remove("cc-ring-edge");
      root.style.removeProperty("opacity");
      root.style.removeProperty("display");
    }
  }, []);
  const clearLegacyRingStateRef = useRef<() => void>(() => {});
  clearLegacyRingStateRef.current = clearLegacyRingState;

  /* ── Initialise map once ──────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const stored = getStoredView();
    const initialCenter = stored
      ? [stored.lng, stored.lat] as [number, number]
      : toLngLat(center);
    const initialZoom = stored ? stored.zoom : zoom;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
      // ── Google-Maps-like gesture set ─────────────────────────────
      // Two-finger twist to rotate the map and two-finger vertical drag
      // to pitch (same gestures Google uses). Disabled by default in
      // MapLibre; we enable them here so power users get the
      // familiar 3-dimensional feel.
      dragRotate: true,
      pitchWithRotate: true,
      // Higher max pitch lets users tilt further into a 3D perspective.
      maxPitch: 75,
    });

    // Smoother, finer wheel zoom — MapLibre's default (1/450) jumps by
    // whole zoom steps on every wheel tick which feels coarse compared to
    // Google's continuous zoom. 1/250 produces a slower, more granular feel.
    try {
      map.scrollZoom.setWheelZoomRate(1 / 250);
    } catch { /* some MapLibre builds don't expose this — safe to ignore */ }

    // Enable two-finger rotation on touch. MapLibre disables it by default
    // because pinch-rotate can be accidental; we pair it with existing
    // pinch-zoom so gestures feel identical to native map apps.
    try {
      map.touchZoomRotate.enableRotation();
    } catch { /* ignore if unsupported */ }

    if (stored) hasRestoredView.current = true;

    mapRef.current = map;

    // SVG overlay for deconfliction leader lines
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("class", "cc-leader-svg");
    containerRef.current.appendChild(svgEl);
    svgOverlayRef.current = svgEl;

    map.once("load", () => {
      readyRef.current = true;
      map.resize();
    });

    map.on("moveend", saveMapView);

    /* ── Bubble band tracker for split/recouple ──
     * When the user zooms across a tier boundary (capital → town →
     * suburb → marker), any open expansions belong to the previous
     * tier and should snap shut so the user sees the new tier cleanly.
     * Tracked via the band a zoom level falls into; ignores intra-band
     * zooming. */
    const bandFor = (z: number): "capital" | "town" | "suburb" | "marker" => {
      if (z < 8) return "capital";
      if (z < 11) return "town";
      if (z < 12) return "suburb";
      return "marker";
    };
    let lastBand = bandFor(map.getZoom());

    // Map-canvas click anywhere outside a bubble — staged recouple.
     // MapLibre's `click` event fires only for the canvas, not for
     // marker DOM, because bubble + marker handlers call
     // `stopPropagation()`. Each click collapses one tier at a time
     // (innermost first) so the user drills back out the way they
     // drilled in, rather than having a single click vaporise a deep
     // expansion tree.
    map.on("click", () => {
      if (expansionsRef.current.size === 0) return;
      collapseInnermostTierRef.current();
    });

    // Zoom-gate place visibility, resize markers, and run deconfliction on zoom changes.
    map.on("zoomend", () => {
      updatePlaceVisibility();
      updateMarkerSizesRef.current();
      runDeconflictionRef.current();
      // Crossing into a new tier band on *zoom-out* recouples open
      // expansions (the prior tier no longer owns the view). Zooming
      // *in* never collapses — the user is drilling deeper into the
      // data and their expansions should stay put.
      const newBand = bandFor(map.getZoom());
      if (newBand !== lastBand) {
        const bandRank: Record<typeof newBand, number> = {
          capital: 0,
          town: 1,
          suburb: 2,
          marker: 3,
        };
        const zoomedOut = bandRank[newBand] < bandRank[lastBand];
        lastBand = newBand;
        if (zoomedOut && expansionsRef.current.size > 0) {
          collapseAllExpansionsRef.current();
        }
      }
      // Recompute bubbles (tiers come in / out of play) and re-apply
      // opacity crossfade.
      rebuildGeoClustersRef.current();
    });

    // Smooth-crossfade bubble opacity during the zoom animation, not just
    // at zoomend, so the tier handover reads as gradual.
    let zoomOpacityRaf = 0;
    map.on("zoom", () => {
      if (zoomOpacityRaf) cancelAnimationFrame(zoomOpacityRaf);
      zoomOpacityRaf = requestAnimationFrame(() => {
        updateGeoClusterOpacityRef.current();
      });
    });

    // Continuously re-run deconfliction and marker sizing during panning so
    // markers animate/float along with the camera instead of snapping only
    // once the user releases the drag.
    let deconflictRaf = 0;
    map.on("move", () => {
      if (deconflictRaf) cancelAnimationFrame(deconflictRaf);
      deconflictRaf = requestAnimationFrame(() => {
        runDeconflictionRef.current();
        updateMarkerSizesRef.current();
      });
    });

    // After panning stops, do a final deconfliction pass
    map.on("moveend", () => {
      runDeconflictionRef.current();
      onMoveEndRef.current?.();
      if (onBoundsChangeRef.current) {
        const b = map.getBounds();
        onBoundsChangeRef.current([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      }
    });

    // Emit an initial bounds snapshot once the style has loaded so the
    // parent has a scope to match against immediately (no pan required).
    map.once("load", () => {
      if (onBoundsChangeRef.current) {
        const b = map.getBounds();
        onBoundsChangeRef.current([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      }
    });

    // ── Bearing tracker for floating compass button ───────────────
    // Fires whenever rotation changes so the parent can surface the
    // compass button only when the map isn't north-up.
    map.on("rotate", () => {
      onBearingChangeRef.current?.(map.getBearing());
    });
    map.on("rotateend", () => {
      onBearingChangeRef.current?.(map.getBearing());
    });

    /* Geolocation control */
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      "bottom-right"
    );

    /* Auto-locate user on initial load (only if no stored view) */
    if (autoLocate && !stored) {
      getCurrentPosition()
        .then((pos) => {
          const lngLat: [number, number] = [pos.longitude, pos.latitude];
          userPositionRef.current = [pos.latitude, pos.longitude];

          const el = document.createElement("div");
          el.style.cssText =
            "width:14px;height:14px;background:#D4AF37;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(212,175,55,.5);";
          geoMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat(lngLat)
            .addTo(map);

          if (mapRef.current) {
            map.flyTo({
              center: lngLat,
              zoom: 8,
              duration: prefersReducedMotion() ? 0 : 1200,
              ...FLY_TO_OPTS,
            });
          }
        })
        .catch(() => {
          /* geolocation denied — stay on default center */
        });
    }

    // W2: keyboard recouple — Escape collapses every open expansion so
    // keyboard users can undo a split without having to zoom across a
    // tier band.  Bound on the document so it works regardless of
    // current focus target (map canvas, bubble, surrounding UI).
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (expansionsRef.current.size === 0) return;
      collapseAllExpansionsRef.current();
    };
    document.addEventListener("keydown", onEsc);

    return () => {
      readyRef.current = false;
      if (deconflictRaf) cancelAnimationFrame(deconflictRaf);
      if (zoomOpacityRaf) cancelAnimationFrame(zoomOpacityRaf);
      document.removeEventListener("keydown", onEsc);
      saveMapView();
      map.remove();
      mapRef.current = null;
      geoMarkerRef.current = null;
      // Remove SVG overlay
      if (svgEl.parentNode) svgEl.parentNode.removeChild(svgEl);
      svgOverlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Update place visibility when activeCategories or activePlaceCategories changes ── */
  useEffect(() => {
    updatePlaceVisibility();
  }, [activeCategories, activePlaceCategories, placesMode, updatePlaceVisibility]);

  /* ── Sync event + place markers ───────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const addMarkers = () => {
      clearMarkers();

      const bounds = new maplibregl.LngLatBounds();
      let hasPoints = false;

      // ── Event markers ──
      // When placesMode is true, skip creating event markers so only places
      // show on the map (the burger menu "Places" tab sets this).
      const mappable = placesMode
        ? []
        : events.filter((e) => e.latitude != null && e.longitude != null);

      mappable.forEach((event) => {
        const temporal = getTemporalStyle(event.date);

        // Glow effect for highlighted (category-selected) markers — no scale change
        const isHighlighted = activeCategories && activeCategories.size > 0 &&
          event.category !== null && event.category !== undefined && activeCategories.has(event.category);

        // Phase B: auto-promote category markers to profile-photo markers when
        // the creator is an organiser (ministry/organization/business/admin)
        // with an avatar on file. This keeps organiser branding on the map
        // without requiring every event to be opted-in manually.
        const creator = event.creator;
        const autoProfileMarker =
          (!event.marker_type || event.marker_type === "category") &&
          !!creator?.avatar_url &&
          !!creator?.role &&
          ORGANISER_ROLES.includes(creator.role);

        const el = event.marker_type && event.marker_type !== "category"
          ? createCustomMarkerEl({
              markerType: event.marker_type,
              category: event.category,
              temporal,
              markerIcon: event.marker_icon,
              markerColor: event.marker_color,
              markerImageUrl: event.marker_image_url,
              creatorAvatarUrl: creator?.avatar_url ?? null,
              overrideColor: markerOverrideColor,
            })
          : autoProfileMarker
            ? createCustomMarkerEl({
                markerType: "profile",
                category: event.category,
                temporal,
                creatorAvatarUrl: creator!.avatar_url!,
                overrideColor: markerOverrideColor,
              })
            : createCategoryMarkerEl(event.category, temporal, markerOverrideColor);

        // Add glow class for highlighted markers (CSS animation)
        if (isHighlighted) {
          el.classList.add("cc-marker-highlighted");
        }

        // One-shot drop-in animation on creation (stripped after the
        // animation completes so it doesn't replay on the next re-render).
        el.classList.add("cc-marker-new");
        setTimeout(() => el.classList.remove("cc-marker-new"), 320);

        const dateStr = new Date(event.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const hasWebsite = event.website_url && /^https?:\/\//i.test(event.website_url);
        const now = new Date();
        const hasStarted = new Date(event.date) <= now;

        const popup = new maplibregl.Popup({
          offset: 16,
          closeButton: true,
          maxWidth: "280px",
        });

        // Build popup HTML lazily on open so the Join/Consider buttons
        // reflect the user's *current* RSVP / consider state instead of a
        // stale snapshot from marker creation. This is what makes the Join
        // button switch to a gold "Joined" tick after the user RSVPs.
        const renderPopupHtml = () => {
          const isJoined = !!rsvpEventIdsRef.current?.has(event.id);
          const isConsidering = !!considerEventIdsRef.current?.has(event.id);

          const joinIcon = isJoined
            ? // Person + tick
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>'
            : // Person + plus
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>';

          const considerIcon = isConsidering
            ? // Circle + tick
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15 16 9.5"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';

          const joinClass = `cc-action-btn${hasStarted ? " cc-action-disabled" : ""}${isJoined ? " cc-action-done" : ""}`;
          const considerClass = `cc-action-btn${isConsidering ? " cc-action-done" : ""}`;

          return `<div class="cc-popup">
            ${event.status === "cancelled" ? '<span class="cc-chip-cancelled" title="This event has been cancelled">Cancelled</span>' : ""}
            ${event.community_contributor ? '<span class="cc-chip-community" title="Community-organised by a Citizen">★ Community</span>' : ""}
            <strong>${escapeHtml(event.title)}</strong>
            <p>${dateStr}</p>
            <p>${escapeHtml(event.location)}</p>
            <div class="cc-popup-actions">
              <button class="cc-action-btn" data-action="view" title="View details">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>View</span>
              </button>
              <button class="${joinClass}" data-action="join" title="${hasStarted ? "Event started" : isJoined ? "You're going" : "Join event"}"${hasStarted ? " disabled" : ""}>
                ${joinIcon}
                <span>${isJoined ? "Joined" : "Join"}</span>
              </button>
              <button class="cc-action-btn" data-action="share" title="Share event">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                <span>Share</span>
              </button>
              <button class="${considerClass}" data-action="consider" title="${isConsidering ? "Considering" : "Consider"}">
                ${considerIcon}
                <span>${isConsidering ? "Considering" : "Consider"}</span>
              </button>
              <button class="cc-action-btn${hasWebsite ? "" : " cc-action-disabled"}" data-action="visit" title="${hasWebsite ? "Visit website" : "No website"}"${hasWebsite ? "" : " disabled"}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>Visit</span>
              </button>
            </div>
          </div>`;
        };

        popup.on("open", () => {
          popup.setHTML(renderPopupHtml());
          // Adjust popup position to follow deconflicted marker offset.
          // Subtracts 16px (the popup's base offset from the marker anchor)
          // so the popup tip points at the displaced marker, not empty space.
          const markerData = evtMarkerDataRef.current.find((d) => d.marker === marker);
          if (markerData) {
            const offset = marker.getOffset();
            const POPUP_BASE_OFFSET = 16;
            popup.setOffset([offset.x, offset.y - POPUP_BASE_OFFSET]);
          }

          const popupEl = popup.getElement();
          popupEl?.querySelectorAll(".cc-action-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
              const action = btn.getAttribute("data-action") as "view" | "join" | "share" | "consider" | "visit";
              if (action) {
                popup.remove();
                onQuickActionRef.current?.(action, event);
              }
            });
          });
        });

        const lngLat: [number, number] = [event.longitude!, event.latitude!];
        const baseSize = parseInt(el.style.width || "40") || 40;
        // Stash the temporal opacity + register a fade transition once so
        // the geo-clustering fade layer can multiply (not clobber) it and
        // we don't rewrite `transition` on every zoom frame.
        el.dataset.temporalOpacity = String(temporal.opacity);
        el.style.transition = "opacity 160ms linear";
        // Prevent the marker click from bubbling up to the map canvas's
        // `click` handler (which would collapse open cluster expansions).
        // See `collapseInnermostTier` wiring in the map-init effect.
        el.addEventListener("click", (e) => e.stopPropagation());
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
        evtMarkerDataRef.current.push({ marker, lngLat, baseSize, iconRatio: 0.48, eventId: event.id });
        bounds.extend(lngLat);
        hasPoints = true;
      });

      // ── Place markers (zoom-gated) ──
      places.forEach((place) => {
        const avgRating = place.avg_rating ?? null;
        const isHighRated = avgRating != null && avgRating >= 4.5;
        const isFlagged =
          !!place.verification_flagged || place.verified === false;

        // Determine place category slug (either via filter highlight or keyword auto-match)
        const text = `${place.name} ${place.description} ${place.address} ${place.categories?.name ?? ""}`.toLowerCase();
        const categoryKeys = Object.keys(PLACE_CATEGORY_KEYWORDS) as PlaceCategory[];
        const inferredCategory =
          categoryKeys.find((cat) =>
            PLACE_CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))
          ) ?? null;

        // Place category highlighting
        let placeIsHighlighted = false;
        let placeHighlightColor: string | undefined;
        if (activePlaceCategories && activePlaceCategories.size > 0) {
          const matchedCat = [...activePlaceCategories].find((cat) =>
            PLACE_CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))
          );
          if (matchedCat) {
            placeIsHighlighted = true;
            placeHighlightColor = PLACE_CATEGORY_HEX[matchedCat];
          }
        }

        const placeEl = createPlaceMarkerEl({
          avgRating,
          isHighRated,
          isFlagged,
          highlighted: placeIsHighlighted,
          highlightColor: markerOverrideColor ?? placeHighlightColor,
          category: inferredCategory,
        });

        // One-shot drop-in animation (same as event markers).
        placeEl.classList.add("cc-marker-new");
        setTimeout(() => placeEl.classList.remove("cc-marker-new"), 320);

        const ratingLabel =
          avgRating != null
            ? `${avgRating.toFixed(1)} / 5 · ${place.reviews_count ?? 0} review${(place.reviews_count ?? 0) !== 1 ? "s" : ""}`
            : "No ratings yet";

        const warning = isFlagged
          ? '<p class="cc-popup-warning">Possibly closed - awaiting verification</p>'
          : "";

        const popup = new maplibregl.Popup({
          offset: 16,
          closeButton: true,
          maxWidth: "240px",
        }).setHTML(
          `<div class="cc-popup"><strong>${escapeHtml(place.name)}</strong><p>${escapeHtml(place.address)}</p><p>${ratingLabel}</p>${warning}<div class="cc-popup-actions"><button class="cc-action-btn" data-action="view" title="View details"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span>View</span></button></div></div>`
        );

        popup.on("open", () => {
          // Adjust popup position to follow deconflicted marker offset
          const markerData = placeMarkerDataRef.current.find((d) => d.marker === marker);
          if (markerData) {
            const offset = marker.getOffset();
            const POPUP_BASE_OFFSET = 16;
            popup.setOffset([offset.x, offset.y - POPUP_BASE_OFFSET]);
          }

          const popupEl = popup.getElement();
          popupEl?.querySelector(".cc-action-btn")?.addEventListener("click", () => {
            popup.remove();
            onSelectPlaceRef.current?.(place);
          });
        });

        const lngLat: [number, number] = [place.longitude, place.latitude];
        const baseSize = parseInt(placeEl.style.width || String(PLACE_MARKER_SIZE)) || PLACE_MARKER_SIZE;
        // Places don't have temporal dimming today — keep attribute for
        // symmetry so the clustering fade multiplies by 1 not by NaN.
        placeEl.dataset.temporalOpacity = "1";
        placeEl.style.transition = "opacity 160ms linear";
        // Same cluster-collapse guard as event markers.
        placeEl.addEventListener("click", (e) => e.stopPropagation());
        const marker = new maplibregl.Marker({ element: placeEl, anchor: "center" })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);

        placeMarkersRef.current.push(marker);
        placeMarkerDataRef.current.push({ marker, lngLat, baseSize, iconRatio: PLACE_ICON_RATIO });
        bounds.extend(lngLat);
        hasPoints = true;
      });

      // Apply zoom-based visibility to freshly placed place markers
      updatePlaceVisibility();

      // C1 fix: when the underlying event/place set changes, any open
      // capital/town expansion's spawned child bubbles are computed against
      // a now-stale point set.  Suburb expansions self-heal because they
      // rely on the lifted-marker pass which re-runs over the fresh
      // marker refs.  Cheapest correct fix: collapse non-suburb
      // expansions before the cluster rebuild.
      const openKeys = [...expansionsRef.current.keys()];
      for (const k of openKeys) {
        const exp = expansionsRef.current.get(k);
        if (exp && exp.parent.tier !== "suburb") {
          collapseExpansion(k);
        }
      }

      // Build progressive geo-clustering bubbles over the fresh point set.
      rebuildGeoClustersRef.current();

      // ── Fit bounds (skip if user had a stored viewpoint) ──
      if (hasPoints && !hasRestoredView.current) {
        if (userPositionRef.current) {
          bounds.extend(toLngLat(userPositionRef.current));
        }
        const reduce = prefersReducedMotion();
        map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: reduce ? 0 : 600,
          easing: EASE_OUT_QUAD,
        });
        hasRestoredView.current = true;
      }

      // Apply zoom-based marker sizing and run deconfliction after markers settle.
      // Also clear any legacy ring-pin state left on in-memory markers from prior
      // sessions (safety-net; no-op on fresh markers).
      setTimeout(() => {
        updateMarkerSizesRef.current();
        runDeconflictionRef.current();
        clearLegacyRingStateRef.current();
      }, 300);
    };

    if (readyRef.current) {
      addMarkers();
    } else {
      const handler = () => {
        readyRef.current = true;
        addMarkers();
      };
      map.once("load", handler);
      return () => {
        map.off("load", handler);
        clearMarkers();
        clearGeoClusters();
      };
    }

    return () => {
      clearMarkers();
      clearGeoClusters();
    };
  }, [events, places, clearMarkers, clearGeoClusters, activeCategories, activePlaceCategories, updatePlaceVisibility, markerOverrideColor, placesMode, collapseExpansion]);

  /* ── Fly to coordinates when flyTo prop changes ─────── */
  // `flyToToken` is included in the dependency array so that tapping the
  // same card twice (identical lat/lng/zoom) still retriggers the camera.
  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    const [lat, lng] = flyTo;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) return;
    const reduce = prefersReducedMotion();
    mapRef.current.flyTo({
      center: toLngLat(flyTo),
      zoom: flyToZoom ?? 13,
      duration: reduce ? 0 : 1200,
      ...FLY_TO_OPTS,
    });
  }, [flyTo, flyToZoom, flyToToken]);

  /* ── Reset bearing / pitch to 0 (compass button) ──────── */
  useEffect(() => {
    if (resetBearingToken === undefined) return;
    const map = mapRef.current;
    if (!map) return;
    // Skip on first mount (token === initial value) to avoid an unwanted animation.
    if (resetBearingToken === 0) return;
    const reduce = prefersReducedMotion();
    map.easeTo({
      bearing: 0,
      pitch: 0,
      duration: reduce ? 0 : 500,
      easing: EASE_OUT_QUAD,
    });
  }, [resetBearingToken]);

  /* ── Locate-me FAB handler ────────────────────────────── */
  useEffect(() => {
    if (locateMeToken === undefined) return;
    const map = mapRef.current;
    if (!map) return;
    if (locateMeToken === 0) return;
    getCurrentPosition()
      .then((pos) => {
        const lngLat: [number, number] = [pos.longitude, pos.latitude];
        userPositionRef.current = [pos.latitude, pos.longitude];

        // Draw / refresh the gold pin marking the user's location.
        if (!geoMarkerRef.current) {
          const el = document.createElement("div");
          el.style.cssText =
            "width:14px;height:14px;background:#D4AF37;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(212,175,55,.5);";
          geoMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat(lngLat)
            .addTo(map);
        } else {
          geoMarkerRef.current.setLngLat(lngLat);
        }

        const reduce = prefersReducedMotion();
        map.flyTo({
          center: lngLat,
          zoom: Math.max(map.getZoom(), 13),
          duration: reduce ? 0 : 1200,
          ...FLY_TO_OPTS,
        });
      })
      .catch(() => {
        /* geolocation denied — silent */
      });
  }, [locateMeToken]);

  /* ── List → map highlight sync ─────────────────────────
   * Applies a pulsing gold ring to whichever event marker matches
   * `highlightedEventId`; clears the class on all others. No state
   * change needed — this runs directly on the marker DOM. */
  useEffect(() => {
    evtMarkerDataRef.current.forEach(({ marker, eventId }) => {
      const el = marker.getElement() as HTMLElement;
      if (eventId === highlightedEventId) {
        el.classList.add("cc-marker-sync-highlight");
      } else {
        el.classList.remove("cc-marker-sync-highlight");
      }
    });
  }, [highlightedEventId, events]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {process.env.NODE_ENV === "development" ? <MapStyleDebugBadge /> : null}
    </div>
  );
}

/**
 * Dev-only badge rendered over the map showing the active basemap style
 * source and ID.  Helps QA confirm a new MapTiler Cloud style (or env
 * override) has actually been applied after cache-busted rebuilds.
 */
function MapStyleDebugBadge() {
  const info = getMapStyleInfo();
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-2 bottom-16 z-5 rounded-md bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-white/90 shadow"
      data-testid="map-style-debug"
    >
      <div>style: {info.source}</div>
      {info.styleId ? <div>id: {info.styleId.slice(0, 8)}…</div> : null}
    </div>
  );
}
