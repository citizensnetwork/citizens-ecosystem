// Citizens Vision — Map Utilities

import { NOMINATIM_SEARCH_URL, NOMINATIM_USER_AGENT, VIEWPORT_STORAGE_KEY } from "./config";

/** Viewport state for session persistence */
export interface MapViewport {
  center: [number, number]; // [lng, lat]
  zoom: number;
}

/** Save viewport to sessionStorage */
export function saveViewport(viewport: MapViewport): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
  } catch {
    // Storage full or unavailable — ignore
  }
}

/** Load viewport from sessionStorage */
export function loadViewport(): MapViewport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapViewport;
    // Validate shape
    if (
      Array.isArray(parsed.center) &&
      parsed.center.length === 2 &&
      typeof parsed.center[0] === "number" &&
      typeof parsed.center[1] === "number" &&
      typeof parsed.zoom === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Geocoding result from Nominatim */
export interface GeocodingResult {
  display_name: string;
  lat: number;
  lon: number;
  boundingbox: [string, string, string, string];
}

/** Search for a location using Nominatim geocoding */
export async function geocodeSearch(query: string): Promise<GeocodingResult[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    q: query.trim(),
    format: "json",
    limit: "5",
    addressdetails: "0",
  });

  const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params}`, {
    headers: {
      "User-Agent": NOMINATIM_USER_AGENT,
    },
  });

  if (!response.ok) return [];

  const data = await response.json();
  return (data as Array<Record<string, unknown>>).map((item) => ({
    display_name: String(item.display_name),
    lat: parseFloat(String(item.lat)),
    lon: parseFloat(String(item.lon)),
    boundingbox: item.boundingbox as [string, string, string, string],
  }));
}

/**
 * Convert activities GeoJSON source data for MapLibre.
 * Returns a GeoJSON FeatureCollection from activity data.
 */
export interface MapActivity {
  id: string;
  title: string;
  type: string;
  date: string;
  latitude: number;
  longitude: number;
  location_name: string | null;
  participant_count: number;
  department_id: string | null;
  department_name?: string | null;
  tags: string[];
}

export function activitiesToGeoJSON(
  activities: MapActivity[]
): GeoJSON.FeatureCollection {
  const now = Date.now();
  const MS_PER_DAY = 86_400_000;

  return {
    type: "FeatureCollection",
    features: activities.map((a) => {
      const ageMs = now - new Date(a.date).getTime();
      const daysAgo = Math.max(0, Math.floor(ageMs / MS_PER_DAY));

      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [a.longitude, a.latitude],
        },
        properties: {
          id: a.id,
          title: a.title,
          type: a.type,
          date: a.date,
          days_ago: daysAgo,
          location_name: a.location_name,
          participant_count: a.participant_count,
          department_id: a.department_id,
          department_name: a.department_name ?? null,
          tags: a.tags.join(","),
        },
      };
    }),
  };
}
