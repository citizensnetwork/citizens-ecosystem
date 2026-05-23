"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapStyle, toLngLat, DEFAULT_CENTER, attachBasemapPruner } from "@/lib/map/config";

type Props = {
  position: [number, number] | null;
  onSelect: (lat: number, lng: number) => void;
  onAddress?: (address: string) => void;
};

export default function LocationPicker({ position, onSelect, onAddress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onAddressRef = useRef(onAddress);
  onAddressRef.current = onAddress;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = position
      ? toLngLat(position)
      : toLngLat(DEFAULT_CENTER);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center,
      zoom: 13,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );

    mapRef.current = map;
    attachBasemapPruner(map);

    if (position) {
      markerRef.current = new maplibregl.Marker({ color: "#D4AF37" })
        .setLngLat([position[1], position[0]])
        .addTo(map);
    }

    map.on("click", (e) => {
      const { lng, lat } = e.lngLat;

      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        markerRef.current = new maplibregl.Marker({ color: "#D4AF37" })
          .setLngLat([lng, lat])
          .addTo(map);
      }

      onSelectRef.current(lat, lng);

      // Reverse geocode to auto-populate address
      if (onAddressRef.current) {
        // Cancel any in-flight lookup so the *latest* click wins.
        geocodeAbortRef.current?.abort();
        const controller = new AbortController();
        geocodeAbortRef.current = controller;
        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          {
            headers: { "Accept-Language": "en", "User-Agent": "CitizensConnect/1.0" },
            signal: controller.signal,
          }
        )
          .then((res) => res.json())
          .then((data) => {
            if (data?.display_name) {
              onAddressRef.current?.(data.display_name);
            }
          })
          .catch(() => {
            /* reverse geocode failed or was aborted — user can type manually */
          });
      }
    });

    return () => {
      geocodeAbortRef.current?.abort();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500">
        Click on the map to set the event location
      </p>
      <div ref={containerRef} className="h-75 w-full rounded-lg border" />
      {position && (
        <p className="text-xs text-gray-400">
          Coordinates: {position[0].toFixed(5)}, {position[1].toFixed(5)}
        </p>
      )}
      <p className="text-[10px] text-gray-400">
        Address lookup uses OpenStreetMap (Nominatim). Coordinates you pin
        are sent to nominatim.openstreetmap.org to fetch the street name.
      </p>
    </div>
  );
}
