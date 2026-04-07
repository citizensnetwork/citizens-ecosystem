"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  position: [number, number] | null;
  onSelect: (lat: number, lng: number) => void;
  onAddress?: (address: string) => void;
};

const MAPTILER_KEY = "UYwNkBMiXAEzjQxQmONO";
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

export default function LocationPicker({ position, onSelect, onAddress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onAddressRef = useRef(onAddress);
  onAddressRef.current = onAddress;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = position
      ? [position[1], position[0]] // [lng, lat]
      : [28.2293, -25.7479];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center,
      zoom: 13,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );

    mapRef.current = map;

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
        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { "Accept-Language": "en" } }
        )
          .then((res) => res.json())
          .then((data) => {
            if (data?.display_name) {
              onAddressRef.current?.(data.display_name);
            }
          })
          .catch(() => {
            /* reverse geocode failed — user can type manually */
          });
      }
    });

    return () => {
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
    </div>
  );
}
