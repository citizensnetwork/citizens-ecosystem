"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_CENTER, DEFAULT_ZOOM, OSM_STYLE_URL } from "@/lib/map/config";
import { geocodeSearch, type GeocodingResult } from "@/lib/map/utils";

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  locationName: string;
  onLocationChange: (lat: number, lng: number, name: string) => void;
}

export function LocationPicker({
  latitude,
  longitude,
  locationName,
  onLocationChange,
}: LocationPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateMarker = useCallback(
    (lng: number, lat: number) => {
      const map = mapRef.current;
      if (!map) return;

      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        markerRef.current = new maplibregl.Marker({ color: "#4a90d9", draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);

        markerRef.current.on("dragend", () => {
          const lngLat = markerRef.current!.getLngLat();
          onLocationChange(lngLat.lat, lngLat.lng, locationName);
        });
      }
    },
    [locationName, onLocationChange]
  );

  // Initialize mini-map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const center: [number, number] =
      latitude !== null && longitude !== null
        ? [longitude, latitude]
        : DEFAULT_CENTER;
    const zoom = latitude !== null ? 14 : DEFAULT_ZOOM;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_STYLE_URL,
      center,
      zoom,
      attributionControl: false,
    });

    map.on("load", () => {
      if (latitude !== null && longitude !== null) {
        updateMarker(longitude, latitude);
      }
    });

    // Click to place marker
    map.on("click", (e) => {
      const { lat, lng } = e.lngLat;
      updateMarker(lng, lat);
      onLocationChange(lat, lng, locationName);
    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker when lat/lng props change
  useEffect(() => {
    if (latitude !== null && longitude !== null && mapRef.current) {
      updateMarker(longitude, latitude);
      mapRef.current.flyTo({ center: [longitude, latitude], zoom: 14 });
    }
  }, [latitude, longitude, updateMarker]);

  // Close results on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const data = await geocodeSearch(value);
      setSearchResults(data);
      setShowResults(data.length > 0);
    }, 400);
  }

  function handleSelectResult(result: GeocodingResult) {
    const name = result.display_name.split(",").slice(0, 2).join(",").trim();
    onLocationChange(result.lat, result.lon, name);
    setSearchQuery(name);
    setShowResults(false);
    setSearchResults([]);
  }

  return (
    <div ref={containerRef}>
      {/* Search input */}
      <div className="relative mb-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="Search for a location..."
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          aria-label="Search location for activity"
        />
        {showResults && searchResults.length > 0 && (
          <ul className="absolute z-30 mt-1 w-full rounded-md border border-border bg-surface shadow-lg">
            {searchResults.map((r, i) => (
              <li key={`${r.lat}-${r.lon}-${i}`}>
                <button
                  type="button"
                  onClick={() => handleSelectResult(r)}
                  className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-alt"
                >
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mini map */}
      <div
        ref={mapContainer}
        className="h-48 w-full rounded-md border border-border"
        role="application"
        aria-label="Click map to select location"
      />

      {/* Coordinates display */}
      {latitude !== null && longitude !== null && (
        <p className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
          </svg>
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </p>
      )}
    </div>
  );
}
