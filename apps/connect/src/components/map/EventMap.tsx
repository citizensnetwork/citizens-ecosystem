"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { Event, EventCategory, PlaceCategory, Place } from "@/types/db";
import { ORGANISER_ROLES } from "@/types/db";
import {
  createCategoryMarkerEl,
  createCustomMarkerEl,
  createPlaceMarkerEl,
  getTemporalStyle,
  PLACE_MARKER_SIZE,
  PLACE_ICON_RATIO,
} from "@/lib/map/markers";
import { getMapStyle, getMapStyleInfo, toLngLat, DEFAULT_CENTER, attachBasemapPruner } from "@/lib/map/config";
import { getCurrentPosition } from "@/lib/capacitor/geolocation";
import { PLACE_CATEGORY_KEYWORDS, PLACE_CATEGORY_HEX } from "@/lib/categories";
import { computeProminence, markerTier } from "@/lib/map/prominence";

type Props = {
  events: Event[];
  places?: Place[];
  onSelectPlace?: (place: Place) => void;
  onQuickAction?: (action: "view" | "join" | "share" | "consider" | "visit", event: Event) => void;
  /** When provided, clicking an event marker opens the inline glass
   *  EventPreviewCard via this callback instead of the legacy MapLibre popup. */
  onSelectEvent?: (event: Event) => void;
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

/** Minimum zoom level at which place markers reveal on zoom-in.  Below
 *  this zoom places stay hidden (events remain visible as density dots);
 *  the Locations tab and place-category filters override the gate. */
const PLACE_ZOOM_MIN = 12;

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

// DOT_MODE_ZOOM / MID_MODE_ZOOM now live in @/lib/map/prominence (single
// source of truth), since the tier decision is per-marker (zoom + prominence)
// rather than a global zoom cut-off. A prominence-0 marker still uses these
// exact base thresholds; higher-prominence markers reveal a couple of zoom
// levels earlier (Google-Maps-style importance promotion).

/** Size (px) of a dot-mode marker regardless of base size — small and uniform. */
const DOT_MODE_SIZE = 10;

/** Photo tier: the top-N most-prominent *full-tier* markers currently in the
 *  viewport get a larger thumbnail treatment (the "big icon with picture"
 *  look). Capped so the map never turns into a wall of photos and the
 *  DOM/image cost stays bounded. */
const PHOTO_TIER_CAP = 8;
/** Diameter (px) of a photo-tier marker. */
const PHOTO_TIER_SIZE = 56;

/* ── Event markers render at their true lat/lng at every zoom level ──
 * The previous "sticky 50 km ring" feature pinned off-screen markers to
 * the viewport edge with a directional spike and distance-based opacity
 * falloff. It was removed because the edge-pinned markers dimmed icons
 * when zoomed out, drifted to unhelpful positions during panning, and
 * only reconciled on drag-release. Markers now always render at their
 * real coordinates — dot-mode sizing + deconfliction handle density at
 * low zoom (no counted clustering bubbles).
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
  onSelectEvent,
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
  const onSelectEventRef = useRef(onSelectEvent);
  onSelectEventRef.current = onSelectEvent;
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
  const evtMarkerDataRef = useRef<{ marker: maplibregl.Marker; lngLat: [number, number]; baseSize: number; iconRatio: number; eventId: string; prominence: number; photoUrl: string | null }[]>([]);
  const placeMarkerDataRef = useRef<{ marker: maplibregl.Marker; lngLat: [number, number]; baseSize: number; iconRatio: number; prominence: number; photoUrl: string | null }[]>([]);
  /** Markers currently promoted to the photo tier (top-N by prominence in the
   *  viewport). Recomputed on every settle by updatePhotoTier. */
  const photoMarkersRef = useRef<Set<maplibregl.Marker>>(new Set());
  const updatePhotoTierRef = useRef<() => void>(() => {});
  const svgOverlayRef = useRef<SVGSVGElement | null>(null);
  const runDeconflictionRef = useRef<() => void>(() => {});
  const updateMarkerSizesRef = useRef<() => void>(() => {});
  /** Viewport culling — hides markers whose `lngLat` is outside the
   *  current map bounds (plus a margin) by toggling `display: none`.
   *  Eliminates per-frame transform compositing for off-screen markers,
   *  which is the dominant DOM-marker cost at province-level zooms.
   *  Reset by `clearMarkers()`; runs on every `move` via rAF. */
  const cullMarkersRef = useRef<() => void>(() => {});

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

  /** Visibility gate for event + place markers (zoom-reveal model).
   *  Events render at every zoom (dot-mode handles density when far out);
   *  they are hidden only while the user is explicitly browsing places.
   *  Places reveal on zoom-in: shown on the Locations tab, when place
   *  categories are selected, or once zoomed past PLACE_ZOOM_MIN.
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
    const shouldShowPlaces = inPlacesMode || hasPlaceCatsSelected || z >= PLACE_ZOOM_MIN;
    placeMarkerDataRef.current.forEach(({ marker }) => {
      const el = marker.getElement() as HTMLElement;
      el.style.visibility = shouldShowPlaces ? "" : "hidden";
    });
    // Event markers stay visible at all zooms. They are hidden ONLY during a
    // pure place-browse (place categories selected with NO event categories) —
    // e.g. the burger "Places" tab or a place-only quick tool. A quick-access
    // tool that carries BOTH event + place categories (Coffee, Churches, Runs…)
    // must show events AND places together, so the presence of event categories
    // keeps events on the map. (Was: hid events whenever any place cat was set,
    // which wiped events off the map for every "both" quick tool.)
    const hasEventCatsSelected = (activeCategoriesRef.current?.size ?? 0) > 0;
    const hideEvents = hasPlaceCatsSelected && !hasEventCatsSelected;
    evtMarkerDataRef.current.forEach(({ marker }) => {
      const el = marker.getElement() as HTMLElement;
      el.style.visibility = hideEvents ? "hidden" : "";
    });
  }, []);

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

    // Project lat/lng → screen px. `weight` biases collisions by prominence
    // (Google-style importance): a heavier marker yields less, so the more
    // prominent of two overlapping markers keeps its spot and the lower one
    // gives way — instead of both splitting the displacement 50/50.
    const items = allMarkerData.map(({ marker, lngLat, prominence }) => {
      const px = map.project(lngLat as maplibregl.LngLatLike);
      const el = marker.getElement() as HTMLElement;
      const size = parseInt(el.style.width || "40") || 40;
      return { marker, origX: px.x, origY: px.y, x: px.x, y: px.y, size, weight: 0.5 + prominence };
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
            const push = (minDist - dist) * DAMPING;
            const nx = dx / dist;
            const ny = dy / dist;
            // Split the push inversely to weight: each marker moves a share
            // proportional to the *other's* weight (heavier ⇒ moves less).
            const total = a.weight + b.weight;
            const aShare = b.weight / total;
            const bShare = a.weight / total;
            a.x -= nx * push * aShare;
            a.y -= ny * push * aShare;
            b.x += nx * push * bShare;
            b.y += ny * push * bShare;
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

  /** Resize marker elements for the current zoom, with the tier (dot → mid →
   *  full) decided per-marker by zoom + prominence. Scales the outer
   *  container, inner white circle, and icon glyph together so the
   *  ring-to-icon gap stays consistent. High-prominence markers leave
   *  dot-mode and reach full presentation earlier (Google-style importance
   *  promotion); a prominence-0 marker still collapses to a solid category
   *  dot below DOT_MODE_ZOOM and never gets stuck hidden (fairness floor). */
  const updateMarkerSizes = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    const scale = zoomScale(z);

    const resize = (el: HTMLElement, baseSize: number, iconRatio: number, prominence: number) => {
      const tier = markerTier(z, prominence);
      if (tier === "dot") {
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
      if (tier === "mid") {
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

    evtMarkerDataRef.current.forEach(({ marker, baseSize, iconRatio, prominence }) => {
      resize(marker.getElement() as HTMLElement, baseSize, iconRatio, prominence);
    });
    placeMarkerDataRef.current.forEach(({ marker, baseSize, iconRatio, prominence }) => {
      resize(marker.getElement() as HTMLElement, baseSize, iconRatio, prominence);
    });
  }, []);

  // Keep stable ref so init-effect listener always calls latest runDeconfliction
  runDeconflictionRef.current = runDeconfliction;
  updateMarkerSizesRef.current = updateMarkerSizes;

  // Viewport culling: hide markers outside current bounds (+10% margin).
  // Keeps a margin so panning doesn't pop markers in/out at the edge.
  // Display-toggle (not removal) so deconfliction/leader-line state stays
  // intact — the marker objects still exist in `markersRef`/`placeMarkersRef`.
  const cullMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const west = b.getWest();
    const east = b.getEast();
    const south = b.getSouth();
    const north = b.getNorth();
    const padLng = (east - west) * 0.1;
    const padLat = (north - south) * 0.1;
    const inBounds = (lng: number, lat: number) =>
      lng >= west - padLng &&
      lng <= east + padLng &&
      lat >= south - padLat &&
      lat <= north + padLat;
    const cull = (m: maplibregl.Marker) => {
      const ll = m.getLngLat();
      const el = m.getElement() as HTMLElement;
      const visible = inBounds(ll.lng, ll.lat);
      const hidden = el.dataset.cculled === "1";
      if (visible && hidden) {
        el.style.display = "";
        el.dataset.cculled = "0";
      } else if (!visible && !hidden) {
        el.style.display = "none";
        el.dataset.cculled = "1";
      }
    };
    for (const m of markersRef.current) cull(m);
    for (const m of placeMarkersRef.current) cull(m);
  }, []);
  cullMarkersRef.current = cullMarkers;

  /** Photo tier: promote the top-N most-prominent full-tier markers that are
   *  currently on-screen to a larger thumbnail ("big icon with picture"),
   *  everything else stays its normal pin. Recomputed on each settle because
   *  the candidate set depends on what's in the viewport at this zoom.
   *
   *  Visual is an overlay <img> centred on the marker (added once, idempotent)
   *  toggled by the `cc-marker-photo` class — variant-agnostic and fully
   *  reversible, so it never fights the per-zoom inline sizing on the host. */
  const updatePhotoTier = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();

    type PhotoCand = { marker: maplibregl.Marker; prominence: number; photoUrl: string };
    const candidates: PhotoCand[] = [];
    const consider = (d: { marker: maplibregl.Marker; prominence: number; photoUrl: string | null }) => {
      if (!d.photoUrl) return;
      // Only full-tier markers can wear a photo (no point on a dot/mid).
      if (markerTier(z, d.prominence) !== "full") return;
      const el = d.marker.getElement() as HTMLElement;
      if (el.dataset.cculled === "1" || el.style.display === "none") return; // off-screen
      if (el.style.visibility === "hidden") return; // place-gated / filtered out
      if (el.dataset.photoFailed === "1") return; // image 404'd earlier — keep the pin
      candidates.push({ marker: d.marker, prominence: d.prominence, photoUrl: d.photoUrl });
    };
    evtMarkerDataRef.current.forEach(consider);
    placeMarkerDataRef.current.forEach(consider);

    candidates.sort((a, b) => b.prominence - a.prominence);
    const winners = new Set(candidates.slice(0, PHOTO_TIER_CAP).map((c) => c.marker));

    const promote = (el: HTMLElement, url: string) => {
      let img = el.querySelector<HTMLImageElement>(".cc-marker-photo-img");
      if (!img) {
        img = document.createElement("img");
        img.className = "cc-marker-photo-img";
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        // Drop the promotion if the image fails to load — fall back to the pin
        // and remember the failure so it isn't re-promoted on the next settle.
        img.addEventListener("error", () => {
          el.dataset.photoFailed = "1";
          el.classList.remove("cc-marker-photo");
        }, { once: true });
        el.appendChild(img);
      }
      if (img.getAttribute("src") !== url) img.src = url; // src setter encodes safely
      el.style.setProperty("--cc-photo-size", `${PHOTO_TIER_SIZE}px`);
      el.classList.add("cc-marker-photo");
    };
    const demote = (el: HTMLElement) => {
      if (el.classList.contains("cc-marker-photo")) el.classList.remove("cc-marker-photo");
    };

    const apply = (d: { marker: maplibregl.Marker; photoUrl: string | null }) => {
      const el = d.marker.getElement() as HTMLElement;
      if (d.photoUrl && winners.has(d.marker)) promote(el, d.photoUrl);
      else demote(el);
    };
    evtMarkerDataRef.current.forEach(apply);
    placeMarkerDataRef.current.forEach(apply);
    photoMarkersRef.current = winners;
  }, []);
  updatePhotoTierRef.current = updatePhotoTier;

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
    attachBasemapPruner(map);

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

    // Reveal/hide markers by zoom (zoom-reveal), resize them, and run
    // deconfliction on zoom changes. No counted clustering — markers
    // simply resolve from dots to full pins as the user zooms in.
    map.on("zoomend", () => {
      updatePlaceVisibility();
      updateMarkerSizesRef.current();
      updatePhotoTierRef.current();
      runDeconflictionRef.current();
    });

    // Continuously re-run deconfliction and marker sizing during panning so
    // markers animate/float along with the camera instead of snapping only
    // once the user releases the drag.
    let deconflictRaf = 0;
    map.on("move", () => {
      if (deconflictRaf) cancelAnimationFrame(deconflictRaf);
      deconflictRaf = requestAnimationFrame(() => {
        cullMarkersRef.current();
        runDeconflictionRef.current();
        updateMarkerSizesRef.current();
      });
    });

    // After panning stops, do a final deconfliction pass
    map.on("moveend", () => {
      cullMarkersRef.current();
      updatePhotoTierRef.current();
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

    return () => {
      readyRef.current = false;
      if (deconflictRaf) cancelAnimationFrame(deconflictRaf);
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

        const lngLat: [number, number] = [event.longitude!, event.latitude!];
        const baseSize = parseInt(el.style.width || "40") || 40;
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);
        // Glass flow: clicking an event marker opens the inline
        // EventPreviewCard via onSelectEvent. EventsView (the only consumer)
        // always provides it; the legacy MapLibre popup has been removed.
        el.style.cursor = "pointer";
        el.addEventListener("click", () => onSelectEventRef.current?.(event));
        markersRef.current.push(marker);
        // Prominence: server popularity base + live time-proximity + newcomer
        // boost. Drives the per-marker tier (dot/mid/full) and collision/photo
        // priority. Fairness floor lives inside computeProminence (never 0-hides).
        const prominence = computeProminence({
          base: event.prominence_base,
          dateStr: event.date,
          endDateStr: event.end_time,
          createdAt: event.created_at,
        });
        const photoUrl = event.image_url ?? event.marker_image_url ?? creator?.avatar_url ?? null;
        evtMarkerDataRef.current.push({ marker, lngLat, baseSize, iconRatio: 0.48, eventId: event.id, prominence, photoUrl });
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

        const lngLat: [number, number] = [place.longitude, place.latitude];
        const baseSize = parseInt(placeEl.style.width || String(PLACE_MARKER_SIZE)) || PLACE_MARKER_SIZE;
        // Direct click opens place detail in the SidePanel drawer —
        // no intermediate popup. The click navigates via the parent's
        // onSelectPlace callback (router.push) so the @panel intercept
        // renders the full PlaceDetailServer in a right-side drawer.
        placeEl.addEventListener("click", () => {
          onSelectPlaceRef.current?.(place);
        });
        const marker = new maplibregl.Marker({ element: placeEl, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);

        placeMarkersRef.current.push(marker);
        // Places have no expiry — computeProminence uses a neutral time term;
        // popularity base + newcomer boost still differentiate them.
        const prominence = computeProminence({
          base: place.prominence_base,
          createdAt: place.created_at,
        });
        placeMarkerDataRef.current.push({ marker, lngLat, baseSize, iconRatio: PLACE_ICON_RATIO, prominence, photoUrl: place.image_url ?? null });
        bounds.extend(lngLat);
        hasPoints = true;
      });

      // Apply zoom-based visibility to freshly placed place markers
      updatePlaceVisibility();

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
        cullMarkersRef.current();
        updatePhotoTierRef.current();
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
      };
    }

    return () => {
      clearMarkers();
    };
  }, [events, places, clearMarkers, activeCategories, activePlaceCategories, updatePlaceVisibility, markerOverrideColor, placesMode]);

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
