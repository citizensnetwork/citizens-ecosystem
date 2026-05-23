"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapStyle, toLngLat, DEFAULT_CENTER, attachBasemapPruner } from "@/lib/map/config";

type Props = {
  position: [number, number] | null;
  onSelect: (lat: number, lng: number) => void;
  onAddress?: (address: string) => void;
  /**
   * Optional controlled address from the parent. When the user types into
   * the parent's address input, we forward-geocode it (debounced) and show
   * a dropdown of suggestions; clicking one drops a pin on the map.
   */
  address?: string;
};

type Suggestion = {
  display_name: string;
  lat: string;
  lon: string;
};

export default function LocationPicker({
  position,
  onSelect,
  onAddress,
  address,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onAddressRef = useRef(onAddress);
  onAddressRef.current = onAddress;
  // Address values we have set ourselves (reverse-geocode result or picked
  // suggestion). When the controlled `address` matches one of these we
  // skip forward-geocoding so picking a suggestion doesn't immediately
  // retrigger a search.
  const lastSetAddressRef = useRef<string | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);

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
      setShowSuggestions(false);

      // Reverse geocode to auto-populate address
      if (onAddressRef.current) {
        geocodeAbortRef.current?.abort();
        const controller = new AbortController();
        geocodeAbortRef.current = controller;
        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          {
            headers: { "Accept-Language": "en" },
            signal: controller.signal,
          }
        )
          .then((res) => res.json())
          .then((data) => {
            if (data?.display_name) {
              lastSetAddressRef.current = data.display_name;
              onAddressRef.current?.(data.display_name);
            }
          })
          .catch(() => {
            /* reverse geocode failed or was aborted */
          });
      }
    });

    return () => {
      geocodeAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Forward-geocode: debounce on `address` changes coming from the parent.
  useEffect(() => {
    if (address === undefined) return;
    const trimmed = address.trim();
    if (trimmed.length < 3 || trimmed === lastSetAddressRef.current) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const handle = setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearching(true);
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          trimmed
        )}&format=json&limit=5&addressdetails=0`,
        {
          headers: { "Accept-Language": "en" },
          signal: controller.signal,
        }
      )
        .then((res) => res.json())
        .then((data: Suggestion[]) => {
          if (Array.isArray(data)) {
            setSuggestions(data.slice(0, 5));
            setShowSuggestions(data.length > 0);
          }
        })
        .catch(() => {
          /* aborted or failed */
        })
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(handle);
  }, [address]);

  function pickSuggestion(s: Suggestion) {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const map = mapRef.current;
    if (map) {
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        markerRef.current = new maplibregl.Marker({ color: "#D4AF37" })
          .setLngLat([lng, lat])
          .addTo(map);
      }
      map.flyTo({ center: [lng, lat], zoom: 15, essential: true });
    }

    onSelectRef.current(lat, lng);
    lastSetAddressRef.current = s.display_name;
    onAddressRef.current?.(s.display_name);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500">
        Click on the map to set the location, or type an address above to
        search.
      </p>
      <div className="relative">
        <div ref={containerRef} className="h-75 w-full rounded-lg border" />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-0 z-20 m-2 max-h-60 overflow-y-auto rounded-md border border-black/15 bg-white shadow-lg">
            <ul className="divide-y divide-black/5 text-sm">
              {suggestions.map((s, i) => (
                <li key={`${s.lat},${s.lon},${i}`}>
                  <button
                    type="button"
                    onClick={() => pickSuggestion(s)}
                    className="block w-full px-3 py-2 text-left hover:bg-black/5"
                  >
                    {s.display_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {searching && (
        <p className="text-[10px] text-gray-400">Searching…</p>
      )}
      {position && (
        <p className="text-xs text-gray-400">
          Coordinates: {position[0].toFixed(5)}, {position[1].toFixed(5)}
        </p>
      )}
      <p className="text-[10px] text-gray-400">
        Address lookup uses OpenStreetMap (Nominatim). The address you type
        and coordinates you pin are sent to nominatim.openstreetmap.org.
      </p>
    </div>
  );
}
