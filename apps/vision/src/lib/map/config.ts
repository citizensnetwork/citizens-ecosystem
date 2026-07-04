// Citizens Vision — Map Configuration

/** Default map center (Pretoria, South Africa) */
export const DEFAULT_CENTER: [number, number] = [28.2293, -25.7479]; // [lng, lat]

/** Default zoom level */
export const DEFAULT_ZOOM = 10;

/** Min/max zoom */
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;

/** Clustering config */
export const CLUSTER_RADIUS = 50;
export const CLUSTER_MAX_ZOOM = 14;

/** Heatmap config */
export const HEATMAP_INTENSITY = 1;
export const HEATMAP_RADIUS = 20;
export const HEATMAP_OPACITY = 0.7;

/** OpenStreetMap tile style */
export const OSM_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** Session storage key for persisting viewport */
export const VIEWPORT_STORAGE_KEY = "cv-map-viewport";

/** Activity type colours for map markers */
export const ACTIVITY_TYPE_COLOURS: Record<string, string> = {
  event: "#4a90d9",     // Blue (accent)
  meeting: "#50c878",   // Emerald
  outreach: "#e6a23c",  // Amber
  workshop: "#9b59b6",  // Purple
  service: "#e74c3c",   // Red
  training: "#1abc9c",  // Teal
  other: "#95a5a6",     // Grey
};

/** Geocoding endpoint (Nominatim — OSM) */
export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

/** User-Agent for Nominatim (required by TOS) */
export const NOMINATIM_USER_AGENT = "CitizensVision/1.0";
