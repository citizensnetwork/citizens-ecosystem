"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Event, Place } from "@/types/db";
import {
  createCategoryMarkerEl,
  createPlaceMarkerEl,
  getTemporalStyle,
  escapeHtml,
} from "@/lib/map/markers";
import { getMapStyle, toLngLat, DEFAULT_CENTER } from "@/lib/map/config";
import { getCurrentPosition } from "@/lib/capacitor/geolocation";

type Props = {
  events: Event[];
  places?: Place[];
  onSelectEvent?: (event: Event) => void;
  onSelectPlace?: (place: Place) => void;
  center?: [number, number];
  zoom?: number;
  autoLocate?: boolean;
  flyTo?: [number, number] | null;
};

export default function EventMap({
  events,
  places = [],
  onSelectEvent,
  onSelectPlace,
  center = DEFAULT_CENTER,
  zoom = 12,
  autoLocate = false,
  flyTo = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const geoMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userPositionRef = useRef<[number, number] | null>(null);
  const readyRef = useRef(false);

  // Keep stable refs so marker click handlers always see latest callbacks
  const onSelectEventRef = useRef(onSelectEvent);
  onSelectEventRef.current = onSelectEvent;
  const onSelectPlaceRef = useRef(onSelectPlace);
  onSelectPlaceRef.current = onSelectPlace;

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }, []);

  /* ── Initialise map once ──────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: toLngLat(center),
      zoom,
      attributionControl: false,
    });

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

    /* Geolocation control (native-like button) */
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      "bottom-right"
    );

    /* Auto-locate user on initial load */
    if (autoLocate) {
      getCurrentPosition()
        .then((pos) => {
          const lngLat: [number, number] = [pos.longitude, pos.latitude];
          userPositionRef.current = [pos.latitude, pos.longitude];

          const el = document.createElement("div");
          el.style.cssText =
            "width:16px;height:16px;background:#4285F4;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(66,133,244,.45);";
          geoMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat(lngLat)
            .addTo(map);

          // Only fly if map is still alive
          if (mapRef.current) {
            map.flyTo({ center: lngLat, zoom: 14, duration: 1200 });
          }
        })
        .catch(() => {
          /* geolocation denied — stay on default center */
        });
    }

    return () => {
      readyRef.current = false;
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
        const el = createCategoryMarkerEl(event.category, temporal);

        const dateStr = new Date(event.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([event.longitude!, event.latitude!])
          .setPopup(
            new maplibregl.Popup({
              offset: 16,
              closeButton: false,
              maxWidth: "240px",
            }).setHTML(
              `<div class="cc-popup"><strong>${escapeHtml(event.title)}</strong><p>${dateStr}</p><p>${escapeHtml(event.location)}</p></div>`
            )
          )
          .addTo(map);

        el.addEventListener("click", () => onSelectEventRef.current?.(event));
        markersRef.current.push(marker);
        bounds.extend([event.longitude!, event.latitude!]);
        hasPoints = true;
      });

      // ── Place markers ──
      places.forEach((place) => {
        const emoji = place.categories?.emoji ?? "📍";
        const color = place.categories?.color ?? "#6b7280";
        const avgRating = place.avg_rating ?? null;
        const isHighRated = avgRating != null && avgRating >= 4.5;
        const isFlagged =
          !!place.verification_flagged || place.verified === false;

        const el = createPlaceMarkerEl(emoji, color, {
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

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([place.longitude, place.latitude])
          .setPopup(
            new maplibregl.Popup({
              offset: 16,
              closeButton: false,
              maxWidth: "240px",
            }).setHTML(
              `<div class="cc-popup"><strong>${escapeHtml(place.name)}</strong><p>${escapeHtml(place.address)}</p><p>${ratingLabel}</p>${warning}</div>`
            )
          )
          .addTo(map);

        el.addEventListener("click", () => onSelectPlaceRef.current?.(place));
        markersRef.current.push(marker);
        bounds.extend([place.longitude, place.latitude]);
        hasPoints = true;
      });

      // ── Fit bounds ──
      if (hasPoints) {
        if (userPositionRef.current) {
          bounds.extend(toLngLat(userPositionRef.current));
        }
        map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 600 });
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
      zoom: 13,
      duration: 1200,
    });
  }, [flyTo]);

  return <div ref={containerRef} className="h-full w-full" />;
}
