/**
 * Shared types for the Glassmorphism Community Map overlay (Figma:
 * "Glassmorphism Community Map"). The three visualization layers restyle the
 * existing MapLibre markers via data-attributes on the map wrapper — they do
 * NOT touch the basemap or marker data.
 */

export type MapLayerKey = "glow" | "pulse" | "connections";

export type MapLayers = Record<MapLayerKey, boolean>;

/** Impact Glow on by default to match the Figma hero state. */
export const DEFAULT_MAP_LAYERS: MapLayers = {
  glow: true,
  pulse: true,
  connections: false,
};
