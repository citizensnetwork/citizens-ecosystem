import { describe, it, expect } from "vitest";
import {
  getBoundingBox,
  pointInBBox,
  pointInPolygon,
  pointInMultiPolygon,
  pointInGeometry,
  approximateAreaKm2,
  isValidBoundaryGeoJSON,
  boundaryToFeature,
} from "@/lib/map/geo";
import type { GeoBoundary, CoverageLevel } from "@/types/db";

// Simple square polygon: [0,0] -> [1,0] -> [1,1] -> [0,1] -> [0,0]
const squarePolygon: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

// Polygon with a hole
const polygonWithHole: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    // Outer ring
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    // Hole
    [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ],
  ],
};

const multiPolygon: GeoJSON.MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    squarePolygon.coordinates,
    [
      [
        [5, 5],
        [6, 5],
        [6, 6],
        [5, 6],
        [5, 5],
      ],
    ],
  ],
};

describe("getBoundingBox", () => {
  it("computes bounding box for Polygon", () => {
    const bbox = getBoundingBox(squarePolygon);
    expect(bbox).toEqual({ minLng: 0, maxLng: 1, minLat: 0, maxLat: 1 });
  });

  it("computes bounding box for MultiPolygon", () => {
    const bbox = getBoundingBox(multiPolygon);
    expect(bbox).toEqual({ minLng: 0, maxLng: 6, minLat: 0, maxLat: 6 });
  });
});

describe("pointInBBox", () => {
  it("returns true for point inside bbox", () => {
    const bbox = { minLng: 0, maxLng: 1, minLat: 0, maxLat: 1 };
    expect(pointInBBox(0.5, 0.5, bbox)).toBe(true);
  });

  it("returns false for point outside bbox", () => {
    const bbox = { minLng: 0, maxLng: 1, minLat: 0, maxLat: 1 };
    expect(pointInBBox(2, 2, bbox)).toBe(false);
  });

  it("returns true for point on bbox edge", () => {
    const bbox = { minLng: 0, maxLng: 1, minLat: 0, maxLat: 1 };
    expect(pointInBBox(0, 0, bbox)).toBe(true);
  });
});

describe("pointInPolygon", () => {
  it("returns true for point inside simple polygon", () => {
    expect(pointInPolygon(0.5, 0.5, squarePolygon)).toBe(true);
  });

  it("returns false for point outside simple polygon", () => {
    expect(pointInPolygon(2, 2, squarePolygon)).toBe(false);
  });

  it("returns true for point in outer ring but outside hole", () => {
    expect(pointInPolygon(1, 1, polygonWithHole)).toBe(true);
  });

  it("returns false for point inside hole", () => {
    expect(pointInPolygon(5, 5, polygonWithHole)).toBe(false);
  });
});

describe("pointInMultiPolygon", () => {
  it("returns true if point is in any polygon", () => {
    expect(pointInMultiPolygon(0.5, 0.5, multiPolygon)).toBe(true);
    expect(pointInMultiPolygon(5.5, 5.5, multiPolygon)).toBe(true);
  });

  it("returns false if point is in no polygon", () => {
    expect(pointInMultiPolygon(3, 3, multiPolygon)).toBe(false);
  });
});

describe("pointInGeometry", () => {
  it("handles Polygon", () => {
    expect(pointInGeometry(0.5, 0.5, squarePolygon)).toBe(true);
    expect(pointInGeometry(2, 2, squarePolygon)).toBe(false);
  });

  it("handles MultiPolygon", () => {
    expect(pointInGeometry(5.5, 5.5, multiPolygon)).toBe(true);
    expect(pointInGeometry(3, 3, multiPolygon)).toBe(false);
  });
});

describe("approximateAreaKm2", () => {
  it("returns positive area for a polygon", () => {
    const area = approximateAreaKm2(squarePolygon);
    expect(area).toBeGreaterThan(0);
  });

  it("returns positive area for multipolygon", () => {
    const area = approximateAreaKm2(multiPolygon);
    expect(area).toBeGreaterThan(0);
  });

  it("returns larger area for larger polygon", () => {
    const big: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    };
    const areaSmall = approximateAreaKm2(squarePolygon);
    const areaBig = approximateAreaKm2(big);
    expect(areaBig).toBeGreaterThan(areaSmall);
  });
});

describe("isValidBoundaryGeoJSON", () => {
  it("validates correct Polygon", () => {
    expect(isValidBoundaryGeoJSON(squarePolygon)).toBe(true);
  });

  it("validates correct MultiPolygon", () => {
    expect(isValidBoundaryGeoJSON(multiPolygon)).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidBoundaryGeoJSON(null)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isValidBoundaryGeoJSON("not a geojson")).toBe(false);
  });

  it("rejects Point geometry", () => {
    expect(isValidBoundaryGeoJSON({ type: "Point", coordinates: [0, 0] })).toBe(false);
  });

  it("rejects polygon with too few points", () => {
    const bad = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 0],
        ],
      ],
    };
    expect(isValidBoundaryGeoJSON(bad)).toBe(false);
  });

  it("rejects polygon where first != last point", () => {
    const bad = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    };
    expect(isValidBoundaryGeoJSON(bad)).toBe(false);
  });
});

describe("boundaryToFeature", () => {
  const boundary: GeoBoundary = {
    id: "b1",
    org_id: "o1",
    name: "Test Boundary",
    description: "A test",
    boundary_geojson: squarePolygon,
    area_km2: 10,
    colour: "#ff0000",
    active: true,
    created_by: "u1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("creates a valid GeoJSON Feature", () => {
    const feature = boundaryToFeature(boundary);
    expect(feature.type).toBe("Feature");
    expect(feature.geometry).toEqual(squarePolygon);
    expect(feature.properties?.name).toBe("Test Boundary");
    expect(feature.properties?.colour).toBe("#ff0000");
  });

  it("includes coverage_level if provided", () => {
    const level: CoverageLevel = "well-covered";
    const feature = boundaryToFeature(boundary, level);
    expect(feature.properties?.coverage_level).toBe("well-covered");
  });

  it("defaults coverage_level to unknown if not provided", () => {
    const feature = boundaryToFeature(boundary);
    expect(feature.properties?.coverage_level).toBe("unknown");
  });
});
