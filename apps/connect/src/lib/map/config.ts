/**
 * Shared MapLibre GL configuration.
 *
 * Uses MapTiler vector tiles when NEXT_PUBLIC_MAPTILER_KEY is set,
 * otherwise falls back to OpenStreetMap raster tiles so the map
 * always renders regardless of configuration.
 */
import type { StyleSpecification } from "maplibre-gl";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

/** Free OpenStreetMap raster fallback — always works, no key needed. */
const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** MapTiler vector style URL (requires valid API key). */
function maptilerStyleUrl(): string {
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
}

/**
 * Returns the map style to use.
 * - If a MapTiler key is configured → returns the vector style URL string.
 * - Otherwise → returns an inline raster StyleSpecification object.
 */
export function getMapStyle(): string | StyleSpecification {
  if (MAPTILER_KEY) return maptilerStyleUrl();
  return OSM_RASTER_STYLE;
}

/** Default map center: Pretoria, South Africa [lat, lng]. */
export const DEFAULT_CENTER: [number, number] = [-25.7479, 28.2293];

/** Convert [lat, lng] → [lng, lat] for MapLibre. */
export function toLngLat(latLng: [number, number]): [number, number] {
  return [latLng[1], latLng[0]];
}
