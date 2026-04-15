"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Event, Place } from "@/types/db";
import {
  createCategoryMarkerEl,
  createCustomMarkerEl,
  createPlaceMarkerEl,
  getTemporalStyle,
  escapeHtml,
} from "@/lib/map/markers";
import { getMapStyle, toLngLat, DEFAULT_CENTER } from "@/lib/map/config";
import { getCurrentPosition } from "@/lib/capacitor/geolocation";

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
};

/* ── Persist map viewpoint across navigations ── */
const MAP_VIEW_KEY = "cc-map-viewpoint";

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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const geoMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userPositionRef = useRef<[number, number] | null>(null);
  const readyRef = useRef(false);
  const hasRestoredView = useRef(false);

  // Keep stable refs so marker click handlers always see latest callbacks
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;
  const onQuickActionRef = useRef(onQuickAction);
  onQuickActionRef.current = onQuickAction;

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
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

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );

    mapRef.current = map;

    // Mark map as ready once style is loaded
    map.once("load", () => {
      readyRef.current = true;
    });

    // Persist viewpoint on every move
    map.on("moveend", saveMapView);

    /* Geolocation control (native-like button) */
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

          // Only fly if map is still alive — province-level zoom
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
      saveMapView();
      map.remove();
      mapRef.current = null;
      geoMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Sync event + place markers ───────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Stable reference to latest data via closure
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
        const el = event.marker_type && event.marker_type !== "category"
          ? createCustomMarkerEl({
              markerType: event.marker_type,
              category: event.category,
              temporal,
              markerIcon: event.marker_icon,
              markerColor: event.marker_color,
              markerImageUrl: event.marker_image_url,
            })
          : createCategoryMarkerEl(event.category, temporal);

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
          const el = popup.getElement();
          el?.querySelectorAll(".cc-action-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
              const action = btn.getAttribute("data-action") as "view" | "join" | "share" | "consider" | "visit";
              if (action) {
                popup.remove();
                onQuickActionRef.current?.(action, event);
              }
            });
          });
        });

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([event.longitude!, event.latitude!])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
        bounds.extend([event.longitude!, event.latitude!]);
        hasPoints = true;
      });

      // ── Place markers ──
      places.forEach((place) => {
        const avgRating = place.avg_rating ?? null;
        const isHighRated = avgRating != null && avgRating >= 4.5;
        const isFlagged =
          !!place.verification_flagged || place.verified === false;

        const el = createPlaceMarkerEl({
          avgRating,
          isHighRated,
          isFlagged,
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
          const el = popup.getElement();
          el?.querySelector(".cc-action-btn")?.addEventListener("click", () => {
            popup.remove();
            onSelectPlaceRef.current?.(place);
          });
        });

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([place.longitude, place.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
        bounds.extend([place.longitude, place.latitude]);
        hasPoints = true;
      });

      // ── Fit bounds (skip if user had a stored viewpoint) ──
      if (hasPoints && !hasRestoredView.current) {
        if (userPositionRef.current) {
          bounds.extend(toLngLat(userPositionRef.current));
        }
        map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 600 });
        // Lock viewpoint so category filtering never moves the map
        hasRestoredView.current = true;
      }
    };

    // If style is loaded, add markers immediately; otherwise wait for load
    if (readyRef.current) {
      addMarkers();
    } else {
      const handler = () => {
        readyRef.current = true;
        addMarkers();
      };
      map.once("load", handler);
      // Cleanup: remove the listener if effect re-runs before load fires
      return () => {
        map.off("load", handler);
        clearMarkers();
      };
    }

    return () => clearMarkers();
  }, [events, places, clearMarkers]);

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
