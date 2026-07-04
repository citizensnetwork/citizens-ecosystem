// Citizens Vision — Geographic Utilities
// Bounding-box and point-in-polygon for GeoJSON boundaries

export interface BBox {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

/**
 * Extract bounding box from a GeoJSON Polygon or MultiPolygon.
 */
export function getBoundingBox(
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon
): BBox {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const rings: number[][][] =
    geojson.type === "Polygon"
      ? geojson.coordinates
      : geojson.coordinates.flat();

  for (const ring of rings) {
    for (const coord of ring) {
      const [lng, lat] = coord;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  return { minLng, maxLng, minLat, maxLat };
}

/**
 * Check if a point [lng, lat] is inside a bounding box.
 */
export function pointInBBox(
  lng: number,
  lat: number,
  bbox: BBox
): boolean {
  return (
    lng >= bbox.minLng &&
    lng <= bbox.maxLng &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  );
}

/**
 * Ray-casting point-in-polygon test.
 * Works for a single ring (no holes).
 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a point is inside a GeoJSON Polygon (with holes support).
 */
export function pointInPolygon(
  lng: number,
  lat: number,
  polygon: GeoJSON.Polygon
): boolean {
  // Must be in outer ring
  if (!pointInRing(lng, lat, polygon.coordinates[0])) return false;

  // Must NOT be in any hole
  for (let i = 1; i < polygon.coordinates.length; i++) {
    if (pointInRing(lng, lat, polygon.coordinates[i])) return false;
  }

  return true;
}

/**
 * Check if a point is inside a GeoJSON MultiPolygon.
 */
export function pointInMultiPolygon(
  lng: number,
  lat: number,
  multiPolygon: GeoJSON.MultiPolygon
): boolean {
  for (const coords of multiPolygon.coordinates) {
    const polygon: GeoJSON.Polygon = { type: "Polygon", coordinates: coords };
    if (pointInPolygon(lng, lat, polygon)) return true;
  }
  return false;
}

/**
 * Check if a point is inside a GeoJSON geometry (Polygon or MultiPolygon).
 * Uses bounding box as fast pre-filter, then ray-casting.
 */
export function pointInGeometry(
  lng: number,
  lat: number,
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon
): boolean {
  // Fast bounding box check
  const bbox = getBoundingBox(geojson);
  if (!pointInBBox(lng, lat, bbox)) return false;

  if (geojson.type === "Polygon") {
    return pointInPolygon(lng, lat, geojson);
  }
  return pointInMultiPolygon(lng, lat, geojson);
}

/**
 * Approximate area of a polygon in km² using the Shoelace formula
 * with spherical correction. Good enough for display purposes.
 */
export function approximateAreaKm2(
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon
): number {
  const rings: number[][][] =
    geojson.type === "Polygon"
      ? [geojson.coordinates[0]]
      : geojson.coordinates.map((p) => p[0]);

  let totalArea = 0;

  for (const ring of rings) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [lng1, lat1] = ring[i];
      const [lng2, lat2] = ring[i + 1];
      area += (lng2 - lng1) * (lat2 + lat1);
    }
    // Convert from degrees² to km² (approximate at mid-latitude)
    const midLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    const degToKm = 111.32; // km per degree latitude
    const lngScale = Math.cos((midLat * Math.PI) / 180);
    totalArea += Math.abs(area / 2) * degToKm * degToKm * lngScale;
  }

  return Math.round(totalArea * 10000) / 10000;
}

/**
 * Validate that a GeoJSON object is a valid Polygon or MultiPolygon.
 */
export function isValidBoundaryGeoJSON(
  geojson: unknown
): geojson is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (!geojson || typeof geojson !== "object") return false;
  const g = geojson as Record<string, unknown>;

  if (g.type !== "Polygon" && g.type !== "MultiPolygon") return false;
  if (!Array.isArray(g.coordinates)) return false;

  if (g.type === "Polygon") {
    // Must have at least one ring
    if (g.coordinates.length === 0) return false;
    const outer = g.coordinates[0];
    if (!Array.isArray(outer) || outer.length < 4) return false;
    // First and last point must match (closed ring)
    const first = outer[0] as number[];
    const last = outer[outer.length - 1] as number[];
    if (first[0] !== last[0] || first[1] !== last[1]) return false;
  }

  if (g.type === "MultiPolygon") {
    if (g.coordinates.length === 0) return false;
    for (const poly of g.coordinates as number[][][][]) {
      if (!Array.isArray(poly) || poly.length === 0) return false;
      const outer = poly[0];
      if (!Array.isArray(outer) || outer.length < 4) return false;
    }
  }

  return true;
}

/**
 * Convert a GeoBoundary to a GeoJSON Feature for map rendering.
 */
export function boundaryToFeature(
  boundary: {
    id: string;
    name: string;
    colour: string;
    boundary_geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  },
  coverageLevel?: string
): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: boundary.boundary_geojson,
    properties: {
      id: boundary.id,
      name: boundary.name,
      colour: boundary.colour,
      coverage_level: coverageLevel ?? "unknown",
    },
  };
}
