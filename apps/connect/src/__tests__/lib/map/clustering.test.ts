import { describe, it, expect } from "vitest";
import {
  bucketPoints,
  tierOpacityAt,
  markerOpacityAt,
  bubbleSizeForCount,
  visibleTiersAt,
  type ClusterPoint,
} from "@/lib/map/clustering";

const PRETORIA: ClusterPoint = { id: "pta-1", lat: -25.7479, lng: 28.2293 };
const PRETORIA_2: ClusterPoint = { id: "pta-2", lat: -25.75, lng: 28.23 };
const CAPE_TOWN: ClusterPoint = { id: "cpt-1", lat: -33.9249, lng: 18.4241 };
const CAPE_TOWN_2: ClusterPoint = { id: "cpt-2", lat: -33.93, lng: 18.43 };

describe("bucketPoints", () => {
  it("returns [] for empty input", () => {
    expect(bucketPoints([], "capital")).toEqual([]);
  });

  it("groups same-city points into a single capital bucket", () => {
    const out = bucketPoints([PRETORIA, PRETORIA_2], "capital");
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].tier).toBe("capital");
  });

  it("keeps distinct capital-scale cities in separate buckets", () => {
    const out = bucketPoints(
      [PRETORIA, PRETORIA_2, CAPE_TOWN, CAPE_TOWN_2],
      "capital",
    );
    expect(out).toHaveLength(2);
    expect(out.find((b) => b.count === 2 && b.lat < -30)).toBeDefined();
  });

  it("produces more buckets at finer tiers for the same points", () => {
    const points: ClusterPoint[] = [
      PRETORIA,
      { id: "pta-n", lat: -25.6, lng: 28.3 },
    ];
    const capital = bucketPoints(points, "capital");
    const suburb = bucketPoints(points, "suburb");
    // capital cell is 4° wide → both points merge; suburb is 0.05° → split
    expect(capital.length).toBeLessThan(suburb.length);
  });

  it("drops non-finite coordinates", () => {
    const bad: ClusterPoint = { id: "bad", lat: NaN, lng: 0 };
    const out = bucketPoints([PRETORIA, bad], "city");
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
  });

  it("centroid is mean of member lat/lng", () => {
    const out = bucketPoints([PRETORIA, PRETORIA_2], "capital");
    expect(out[0].lat).toBeCloseTo((PRETORIA.lat + PRETORIA_2.lat) / 2, 4);
    expect(out[0].lng).toBeCloseTo((PRETORIA.lng + PRETORIA_2.lng) / 2, 4);
  });
});

describe("tierOpacityAt", () => {
  it("capital tier is fully opaque inside its core band", () => {
    expect(tierOpacityAt("capital", 0)).toBe(1);
    expect(tierOpacityAt("capital", 3)).toBe(1);
    expect(tierOpacityAt("capital", 5)).toBe(1);
  });

  it("capital tier fades out above zoom 5", () => {
    const a = tierOpacityAt("capital", 5.5);
    const b = tierOpacityAt("capital", 6);
    expect(a).toBeGreaterThan(b);
    expect(tierOpacityAt("capital", 7)).toBe(0);
  });

  it("city tier fades in before its core and out after", () => {
    const before = tierOpacityAt("city", 5);
    const core = tierOpacityAt("city", 7);
    const after = tierOpacityAt("city", 10);
    expect(before).toBeLessThan(core);
    expect(after).toBeLessThan(core);
    expect(core).toBe(1);
  });

  it("suburb tier is active in its 12-14 core", () => {
    expect(tierOpacityAt("suburb", 12)).toBe(1);
    expect(tierOpacityAt("suburb", 14)).toBe(1);
    expect(tierOpacityAt("suburb", 11)).toBeGreaterThan(0);
    expect(tierOpacityAt("suburb", 11)).toBeLessThan(1);
  });

  it("every zoom from 0 to 15 has at least one tier visible", () => {
    for (let z = 0; z <= 15; z += 0.5) {
      const any =
        tierOpacityAt("capital", z) +
        tierOpacityAt("city", z) +
        tierOpacityAt("town", z) +
        tierOpacityAt("suburb", z);
      expect(any).toBeGreaterThan(0);
    }
  });
});

describe("markerOpacityAt", () => {
  it("is 0 well below fade-in", () => {
    expect(markerOpacityAt(10)).toBe(0);
  });

  it("is 1 well above fade-in", () => {
    expect(markerOpacityAt(16)).toBe(1);
  });

  it("ramps monotonically in the fade-in band", () => {
    const a = markerOpacityAt(14.2);
    const b = markerOpacityAt(14.8);
    const c = markerOpacityAt(15.3);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe("bubbleSizeForCount", () => {
  it("stays within [28, 56]", () => {
    for (const n of [1, 2, 10, 50, 500, 10000]) {
      const s = bubbleSizeForCount(n);
      expect(s).toBeGreaterThanOrEqual(28);
      expect(s).toBeLessThanOrEqual(56);
    }
  });

  it("is monotonically non-decreasing in count", () => {
    let last = 0;
    for (const n of [1, 5, 20, 100, 1000]) {
      const s = bubbleSizeForCount(n);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });
});

describe("visibleTiersAt", () => {
  it("returns only capital at zoom 0", () => {
    expect(visibleTiersAt(0)).toEqual(["capital"]);
  });

  it("returns suburb (plus fade-in neighbours) near zoom 13", () => {
    const tiers = visibleTiersAt(13);
    expect(tiers).toContain("suburb");
  });

  it("returns at least one tier for every integer zoom 0-14", () => {
    for (let z = 0; z <= 14; z++) {
      expect(visibleTiersAt(z).length).toBeGreaterThan(0);
    }
  });
});
