/**
 * Shared MapLibre GL configuration.
 *
 * Uses MapTiler vector tiles when NEXT_PUBLIC_MAPTILER_KEY is set,
 * otherwise falls back to OpenStreetMap raster tiles so the map
 * always renders regardless of configuration.
 */
import type { Map as MaplibreMap, StyleSpecification } from "maplibre-gl";

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
  "019e5525-61a4-7791-82f2-2222fb440592";

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

/**
 * Dev-only description of the currently active basemap style, used by
 * the on-screen overlay in EventMap so QA can visually confirm that a
 * newly-configured MapTiler Cloud style/ENV change is actually applied
 * and not overridden by caching or build artefacts.
 */
export function getMapStyleInfo(): {
  source: "maptiler" | "carto-raster";
  styleId: string | null;
  url: string | null;
} {
  if (MAPTILER_KEY) {
    return {
      source: "maptiler",
      styleId: MAPTILER_STYLE,
      url: maptilerStyleUrl(),
    };
  }
  return { source: "carto-raster", styleId: null, url: null };
}

/** Default map center: Pretoria, South Africa [lat, lng]. */
export const DEFAULT_CENTER: [number, number] = [-25.7479, 28.2293];

/** Convert [lat, lng] → [lng, lat] for MapLibre. */
export function toLngLat(latLng: [number, number]): [number, number] {
  return [latLng[1], latLng[0]];
}

/* ──────────────────────────────────────────────────────────────────────
 * Basemap layer pruning
 *
 * MapTiler Cloud vector styles (OpenMapTiles schema) ship with dozens of
 * layers we do not need for Citizens Connect — POI icons compete with our
 * category markers, building footprints add cost at high zoom, and
 * transit / aeroway / hillshade are noise for our use case.
 *
 * `pruneBasemapLayers(map)` strips a conservative allow-list of
 * clutter layers at runtime on `style.load`. It is a no-op for raster
 * basemaps (CARTO fallback) because they expose only a single raster
 * layer that we obviously must keep.
 *
 * Set `NEXT_PUBLIC_MAP_PRUNE=off` to disable pruning (debugging only).
 *
 * What this DOES strip (universally safe):
 *   - POI icons + POI labels (`poi`, `poi_*`)
 *   - Building footprints + 3D extrusions (`building`, `building-3d`)
 *   - Aeroway (runways, taxiways)
 *   - Transit lines/stops, ferries
 *   - House numbers
 *   - Hillshade, contours, terrain
 *
 * What this preserves:
 *   - All roads (transportation)
 *   - All place / road / suburb labels
 *   - Water, parks, landuse polygons
 *   - Boundaries
 *
 * For deeper, style-level stripping (landuse fill, font fallbacks, etc.)
 * edit the MapTiler Cloud style itself — see
 * `docs/archive/MAP_TILER_LITE_CHECKLIST.md`.
 * ────────────────────────────────────────────────────────────────────── */

const PRUNE_LAYER_PATTERNS: readonly RegExp[] = [
  /(^|[_-])poi([_-]|$)/i,
  /^building($|[-_])/i,
  /(^|[_-])aeroway([_-]|$)/i,
  /(^|[_-])transit([_-]|$)/i,
  /(^|[_-])ferry([_-]|$)/i,
  /(^|[_-])housenum/i,
  /(^|[_-])hillshade/i,
  /(^|[_-])contour/i,
];

const PRUNE_SOURCE_LAYERS: ReadonlySet<string> = new Set([
  "poi",
  "building",
  "aeroway",
  "transit",
  "ferry",
  "housenumber",
]);

function pruneEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_MAP_PRUNE ?? "on").toLowerCase() !== "off";
}

/**
 * Remove non-essential basemap layers to reduce render cost.
 * Safe to call multiple times; missing layers are silently skipped.
 */
export function pruneBasemapLayers(map: MaplibreMap): void {
  if (!pruneEnabled()) return;
  let style;
  try {
    style = map.getStyle();
  } catch {
    return;
  }
  const layers = style?.layers;
  if (!Array.isArray(layers)) return;

  for (const layer of layers) {
    if (!layer || layer.type === "raster" || layer.type === "background") {
      continue;
    }
    const id = layer.id ?? "";
    const sourceLayer = "source-layer" in layer ? layer["source-layer"] : undefined;
    const matchesId = PRUNE_LAYER_PATTERNS.some((re) => re.test(id));
    const matchesSrc =
      typeof sourceLayer === "string" && PRUNE_SOURCE_LAYERS.has(sourceLayer);
    if (!matchesId && !matchesSrc) continue;
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* layer already gone or style mid-swap — safe to ignore */
    }
  }
}

/**
 * Convenience: attach pruning to a map so it runs on every style load
 * (including style changes). Returns the cleanup handler.
 */
export function attachBasemapPruner(map: MaplibreMap): () => void {
  const run = () => pruneBasemapLayers(map);
  map.on("style.load", run);
  // Also run immediately in case the style is already loaded.
  try {
    if (map.isStyleLoaded()) run();
  } catch {
    /* ignore */
  }
  return () => {
    try {
      map.off("style.load", run);
    } catch {
      /* ignore */
    }
  };
}
