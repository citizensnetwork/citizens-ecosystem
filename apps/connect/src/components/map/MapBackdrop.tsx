"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapStyle, toLngLat, DEFAULT_CENTER, attachBasemapPruner } from "@/lib/map/config";

/**
 * Purely-decorative, non-interactive MapLibre map used as a backdrop behind
 * floating glass panels (e.g. `/events/new`). All user interaction is
 * disabled so clicks and scroll-wheels continue to reach the UI on top.
 *
 * Rendered via `<dynamic … ssr:false>` because MapLibre needs `window`.
 */
export default function MapBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: toLngLat(DEFAULT_CENTER),
      zoom: 11,
      attributionControl: false,
      // Disable all user interaction — purely decorative.
      interactive: false,
    });
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );
    mapRef.current = map;
    attachBasemapPruner(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      // aria-hidden: the map is background decoration, not content.
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
