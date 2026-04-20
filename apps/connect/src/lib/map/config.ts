/**
 * Shared MapLibre GL configuration.
 *
 * Uses MapTiler vector tiles when NEXT_PUBLIC_MAPTILER_KEY is set,
 * otherwise falls back to OpenStreetMap raster tiles so the map
 * always renders regardless of configuration.
 */
import type { StyleSpecification } from "maplibre-gl";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
/**
 * MapTiler map/style identifier.  Defaults to the Citizens Connect
 * gold-tinted Cloud style so the map ships with the brand skin even when
 * `NEXT_PUBLIC_MAPTILER_STYLE` is not set in the deploy environment.
 * Override with any preset slug (e.g. `"dataviz-light"`) or a different
 * Cloud style UUID by setting that env var — no code change required.
 */
const MAPTILER_STYLE =
  process.env.NEXT_PUBLIC_MAPTILER_STYLE ??
  "019da63f-f3d4-7958-a9e3-e7c4e61e1f37";

/**
 * Light/neutral raster fallback using CartoDB Positron.
 * Desaturated palette lets category-coloured markers and gold clusters
 * dominate visually without competing with the basemap.
 */
const NEUTRAL_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "carto-light", type: "raster", source: "carto" }],
};

/**
 * MapTiler vector style URL (requires valid API key).
 * Uses NEXT_PUBLIC_MAPTILER_STYLE to target either a preset slug
 * (e.g. "dataviz-light") or a custom Cloud style UUID.
 */
function maptilerStyleUrl(): string {
  return `https://api.maptiler.com/maps/${MAPTILER_STYLE}/style.json?key=${MAPTILER_KEY}`;
}

/**
 * Returns the map style to use.
 * - If a MapTiler key is configured → returns the vector style URL string.
 * - Otherwise → returns an inline raster StyleSpecification object.
 */
export function getMapStyle(): string | StyleSpecification {
  if (MAPTILER_KEY) return maptilerStyleUrl();
  return NEUTRAL_RASTER_STYLE;
}

/** Default map center: Pretoria, South Africa [lat, lng]. */
export const DEFAULT_CENTER: [number, number] = [-25.7479, 28.2293];

/** Convert [lat, lng] → [lng, lat] for MapLibre. */
export function toLngLat(latLng: [number, number]): [number, number] {
  return [latLng[1], latLng[0]];
}
