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
  getTemporalStyle,
  escapeHtml,
  PLACE_MARKER_SIZE,
  PLACE_ICON_RATIO,
} from "@/lib/map/markers";
import { getMapStyle, toLngLat, DEFAULT_CENTER } from "@/lib/map/config";
import { getCurrentPosition } from "@/lib/capacitor/geolocation";
import { PLACE_CATEGORY_KEYWORDS, PLACE_CATEGORY_HEX } from "@/lib/categories";

type Props = {
  events: Event[];
  places?: Place[];
  onSelectPlace?: (place: Place) => void;
  onQuickAction?: (action: "view" | "join" | "share" | "consider" | "visit", event: Event) => void;
  center?: [number, number];
  zoom?: number;
  autoLocate?: boolean;
  flyTo?: [number, number] | null;
  flyToZoom?: number;
  activeCategories?: Set<EventCategory>;
  activePlaceCategories?: Set<PlaceCategory>;
  /** Override marker border colour (used by quick-access tools for unified colour). */
  markerOverrideColor?: string;
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

/** Size (px) of a dot-mode marker regardless of base size — small and uniform. */
const DOT_MODE_SIZE = 10;

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
  activeCategories,
  activePlaceCategories,
  markerOverrideColor,
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

  // Deconfliction data: stores each event/place marker + its lat/lng + icon-to-outer ratio
  const evtMarkerDataRef = useRef<{ marker: maplibregl.Marker; lngLat: [number, number]; baseSize: number; iconRatio: number }[]>([]);
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

  /** Show or hide place markers based on zoom + active category state. */
  const updatePlaceVisibility = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    const placeCats = activePlaceCategoriesRef.current;
    const hasPlaceCatsSelected = placeCats && placeCats.size > 0;
    // Show places when: place categories are explicitly selected (any zoom), OR at high zoom with no event-category filter
    const shouldShow = hasPlaceCatsSelected || z >= PLACE_ZOOM_MIN;
    placeMarkersRef.current.forEach((m) => {
      (m.getElement() as HTMLElement).style.visibility = shouldShow ? "" : "hidden";
    });
    // Hide event markers when place categories are selected (user is browsing places)
    markersRef.current.forEach((m) => {
      (m.getElement() as HTMLElement).style.visibility = hasPlaceCatsSelected ? "hidden" : "";
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

    const resize = (el: HTMLElement, baseSize: number, iconRatio: number) => {
      if (dotMode) {
        el.classList.add("cc-marker-dot");
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
    });

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

    // Zoom-gate place visibility, resize markers, and run deconfliction on zoom changes.
    map.on("zoomend", () => {
      updatePlaceVisibility();
      updateMarkerSizesRef.current();
      runDeconflictionRef.current();
    });

    // Continuously re-run deconfliction during panning/zooming so markers stay spread
    let deconflictRaf = 0;
    map.on("move", () => {
      if (deconflictRaf) cancelAnimationFrame(deconflictRaf);
      deconflictRaf = requestAnimationFrame(() => {
        runDeconflictionRef.current();
      });
    });

    // After panning stops, do a final deconfliction pass
    map.on("moveend", () => {
      runDeconflictionRef.current();
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
            map.flyTo({ center: lngLat, zoom: 8, duration: 1200 });
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
  }, [activeCategories, activePlaceCategories, updatePlaceVisibility]);

  /* ── Sync event + place markers ───────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const addMarkers = () => {
      clearMarkers();

      const bounds = new maplibregl.LngLatBounds();
      let hasPoints = false;

      // ── Event markers ──
      const mappable = events.filter(
        (e) => e.latitude != null && e.longitude != null
      );

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
        }).setHTML(
          `<div class="cc-popup">
            <strong>${escapeHtml(event.title)}</strong>
            <p>${dateStr}</p>
            <p>${escapeHtml(event.location)}</p>
            <div class="cc-popup-actions">
              <button class="cc-action-btn" data-action="view" title="View details">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>View</span>
              </button>
              <button class="cc-action-btn${hasStarted ? " cc-action-disabled" : ""}" data-action="join" title="${hasStarted ? "Event started" : "Join event"}"${hasStarted ? " disabled" : ""}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                <span>Join</span>
              </button>
              <button class="cc-action-btn" data-action="share" title="Share event">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                <span>Share</span>
              </button>
              <button class="cc-action-btn" data-action="consider" title="Consider">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                <span>Consider</span>
              </button>
              <button class="cc-action-btn${hasWebsite ? "" : " cc-action-disabled"}" data-action="visit" title="${hasWebsite ? "Visit website" : "No website"}"${hasWebsite ? "" : " disabled"}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>Visit</span>
              </button>
            </div>
          </div>`
        );

        popup.on("open", () => {
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
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
        evtMarkerDataRef.current.push({ marker, lngLat, baseSize, iconRatio: 0.48 });
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

      // ── Fit bounds (skip if user had a stored viewpoint) ──
      if (hasPoints && !hasRestoredView.current) {
        if (userPositionRef.current) {
          bounds.extend(toLngLat(userPositionRef.current));
        }
        map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 600 });
        hasRestoredView.current = true;
      }

      // Apply zoom-based marker sizing and run deconfliction after markers settle
      setTimeout(() => {
        updateMarkerSizesRef.current();
        runDeconflictionRef.current();
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

    return () => clearMarkers();
  }, [events, places, clearMarkers, activeCategories, activePlaceCategories, updatePlaceVisibility, markerOverrideColor]);

  /* ── Fly to coordinates when flyTo prop changes ─────── */
  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    mapRef.current.flyTo({
      center: toLngLat(flyTo),
      zoom: flyToZoom ?? 13,
      duration: 1200,
    });
  }, [flyTo, flyToZoom]);

  return <div ref={containerRef} className="h-full w-full" />;
}
