"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { Event, Place } from "@/types/db";
import {
  createCategoryIcon,
  createPlaceIcon,
  getTemporalStyle,
  escapeHtml,
} from "@/lib/map/markers";
import { getCurrentPosition } from "@/lib/capacitor/geolocation";

type Props = {
  events: Event[];
  places?: Place[];
  onSelectEvent?: (event: Event) => void;
  onSelectPlace?: (place: Place) => void;
  center?: [number, number];
  zoom?: number;
};

export default function EventMap({
  events,
  places = [],
  onSelectEvent,
  onSelectPlace,
  center = [-29.8587, 31.0218],
  zoom = 12,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const eventClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const placeClusterRef = useRef<L.MarkerClusterGroup | null>(null);

  /* ── Initialise map once ──────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(center, zoom);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    /* Geolocation button */
    const LocBtn = L.Control.extend({
      onAdd() {
        const btn = L.DomUtil.create("button", "cc-geo-btn");
        btn.innerHTML = "📍";
        btn.title = "My location";
        btn.type = "button";
        btn.setAttribute(
          "style",
          "width:36px;height:36px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:6px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;"
        );
        L.DomEvent.disableClickPropagation(btn);
        btn.addEventListener("click", () => {
          getCurrentPosition()
            .then((pos) => {
              const ll: L.LatLngExpression = [
                pos.latitude,
                pos.longitude,
              ];
              map.setView(ll, 15);
              L.circleMarker(ll, {
                radius: 8,
                fillColor: "#4285F4",
                fillOpacity: 1,
                color: "#fff",
                weight: 2,
              })
                .addTo(map)
                .bindPopup("You are here");
            })
            .catch(() => {
              /* permission denied — ignore */
            });
        });
        return btn;
      },
    });
    new LocBtn({ position: "bottomright" }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Sync event markers ───────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old cluster group
    if (eventClusterRef.current) {
      map.removeLayer(eventClusterRef.current);
    }

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    eventClusterRef.current = cluster;

    const mappable = events.filter(
      (e) => e.latitude != null && e.longitude != null
    );

    mappable.forEach((event) => {
      const temporal = getTemporalStyle(event.date);
      const icon = createCategoryIcon(event.category, temporal);

      const dateStr = new Date(event.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const popup = `<div style="min-width:190px">
        <h3 style="font-weight:600;font-size:14px;color:#111;margin:0">${escapeHtml(event.title)}</h3>
        <p style="font-size:12px;color:#4b5563;margin:4px 0 0">${dateStr}</p>
        <p style="font-size:12px;color:#4b5563;margin:0">${escapeHtml(event.location)}</p>
      </div>`;

      const marker = L.marker([event.latitude!, event.longitude!], { icon })
        .bindPopup(popup);

      marker.on("click", () => onSelectEvent?.(event));
      cluster.addLayer(marker);
    });

    map.addLayer(cluster);

    if (mappable.length > 0 && places.length === 0) {
      const bounds = L.latLngBounds(
        mappable.map((e) => [e.latitude!, e.longitude!])
      );
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [events, onSelectEvent, places.length]);

  /* ── Sync place markers ───────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (placeClusterRef.current) {
      map.removeLayer(placeClusterRef.current);
    }

    if (places.length === 0) return;

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 40,
      showCoverageOnHover: false,
    });
    placeClusterRef.current = cluster;

    places.forEach((place) => {
      const emoji = place.categories?.emoji ?? "📍";
      const color = place.categories?.color ?? "#6b7280";
      const avgRating = place.avg_rating ?? null;
      const isHighRated = avgRating != null && avgRating >= 4.5;
      const isFlagged = !!place.verification_flagged || place.verified === false;

      const icon = createPlaceIcon(emoji, color, {
        avgRating,
        isHighRated,
        isFlagged,
      });

      const ratingLabel =
        avgRating != null
          ? `${avgRating.toFixed(1)} / 5 · ${place.reviews_count ?? 0} review${
              (place.reviews_count ?? 0) !== 1 ? "s" : ""
            }`
          : "No ratings yet";

      const warning = isFlagged
        ? '<p style="font-size:11px;color:#b45309;margin:6px 0 0">Possibly closed - awaiting verification</p>'
        : "";

      const popup = `<div style="min-width:190px">
        <h3 style="font-weight:600;font-size:14px;color:#111;margin:0">${escapeHtml(place.name)}</h3>
        <p style="font-size:12px;color:#4b5563;margin:4px 0 0">${escapeHtml(place.address)}</p>
        <p style="font-size:12px;color:#4b5563;margin:4px 0 0">⭐ ${ratingLabel}</p>
        ${warning}
      </div>`;

      const marker = L.marker([place.latitude, place.longitude], { icon })
        .bindPopup(popup);

      marker.on("click", () => onSelectPlace?.(place));
      cluster.addLayer(marker);
    });

    map.addLayer(cluster);
  }, [places, onSelectPlace]);

  return <div ref={containerRef} className="h-full w-full" />;
}
