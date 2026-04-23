import { describe, it, expect } from "vitest";
import {
  bucketPoints,
  bucketKeyOf,
  tierOpacityAt,
  markerOpacityAt,
  bubbleSizeForCount,
  visibleTiersAt,
  childTierOf,
  pointsInBubble,
  type ClusterPoint,
  type ClusterBubble,
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
    const out = bucketPoints([PRETORIA, bad], "town");
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
  it("capital tier is fully opaque inside its core band (zoom 0–5)", () => {
    expect(tierOpacityAt("capital", 0)).toBe(1);
    expect(tierOpacityAt("capital", 3)).toBe(1);
    expect(tierOpacityAt("capital", 5)).toBe(1);
  });

  it("capital tier fades out between zoom 5 and 6", () => {
    const a = tierOpacityAt("capital", 5.3);
    const b = tierOpacityAt("capital", 5.8);
    expect(a).toBeGreaterThan(b);
    expect(tierOpacityAt("capital", 6)).toBe(0);
  });

  it("town tier crossfades with capital around zoom 5–6", () => {
    const before = tierOpacityAt("town", 5);
    const core = tierOpacityAt("town", 7);
    const after = tierOpacityAt("town", 9);
    expect(before).toBeLessThan(core);
    expect(after).toBeLessThan(core);
    expect(core).toBe(1);
  });

  it("suburb tier is active in its 9–11 core", () => {
    expect(tierOpacityAt("suburb", 9)).toBe(1);
    expect(tierOpacityAt("suburb", 11)).toBe(1);
    // Fade-in side
    expect(tierOpacityAt("suburb", 8.5)).toBeGreaterThan(0);
    expect(tierOpacityAt("suburb", 8.5)).toBeLessThan(1);
    // Fully out by zoom 12 (markers take over)
    expect(tierOpacityAt("suburb", 12)).toBe(0);
  });

  it("every zoom from 0 to 12 has at least one tier visible", () => {
    for (let z = 0; z <= 12; z += 0.5) {
      const any =
        tierOpacityAt("capital", z) +
        tierOpacityAt("town", z) +
        tierOpacityAt("suburb", z) +
        markerOpacityAt(z);
      expect(any).toBeGreaterThan(0);
    }
  });
});

describe("markerOpacityAt", () => {
  it("is 0 well below fade-in", () => {
    expect(markerOpacityAt(8)).toBe(0);
  });

  it("is 1 at and above zoom 12", () => {
    expect(markerOpacityAt(12)).toBe(1);
    expect(markerOpacityAt(15)).toBe(1);
  });

  it("ramps monotonically across the 11–12 fade-in band", () => {
    const a = markerOpacityAt(11.2);
    const b = markerOpacityAt(11.5);
    const c = markerOpacityAt(11.8);
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

  it("returns suburb (plus fade-in/out neighbours) near zoom 10", () => {
    const tiers = visibleTiersAt(10);
    expect(tiers).toContain("suburb");
  });

  it("returns no bubble tiers from zoom 12 onward", () => {
    expect(visibleTiersAt(12)).toEqual([]);
    expect(visibleTiersAt(14)).toEqual([]);
  });

  it("returns at least one tier for every integer zoom 0-11", () => {
    for (let z = 0; z <= 11; z++) {
      expect(visibleTiersAt(z).length).toBeGreaterThan(0);
    }
  });
});

describe("childTierOf", () => {
  it("capital → town → suburb → null", () => {
    expect(childTierOf("capital")).toBe("town");
    expect(childTierOf("town")).toBe("suburb");
    expect(childTierOf("suburb")).toBeNull();
  });
});

describe("bucketKeyOf", () => {
  it("returns the same key for two points in the same grid cell", () => {
    const a = bucketKeyOf("suburb", -25.7479, 28.2293);
    const b = bucketKeyOf("suburb", -25.748, 28.2294);
    expect(a).toBe(b);
  });

  it("returns different keys for points in different cells", () => {
    const a = bucketKeyOf("suburb", -25.7479, 28.2293);
    const b = bucketKeyOf("suburb", -25.6, 28.3);
    expect(a).not.toBe(b);
  });

  it("encodes the tier in the key", () => {
    expect(bucketKeyOf("capital", 0, 0)).toMatch(/^capital:/);
    expect(bucketKeyOf("town", 0, 0)).toMatch(/^town:/);
    expect(bucketKeyOf("suburb", 0, 0)).toMatch(/^suburb:/);
  });
});

describe("pointsInBubble", () => {
  it("returns only points whose grid cell matches the bubble", () => {
    const pts: ClusterPoint[] = [PRETORIA, PRETORIA_2, CAPE_TOWN];
    const buckets = bucketPoints(pts, "capital");
    const ptaBubble = buckets.find((b) => b.lat > -30) as ClusterBubble;
    const inside = pointsInBubble(ptaBubble, pts);
    expect(inside).toHaveLength(2);
    expect(inside.map((p) => p.id).sort()).toEqual(["pta-1", "pta-2"]);
  });

  it("ignores non-finite coordinates", () => {
    const bad: ClusterPoint = { id: "bad", lat: NaN, lng: 0 };
    const buckets = bucketPoints([PRETORIA], "town");
    const inside = pointsInBubble(buckets[0], [PRETORIA, bad]);
    expect(inside).toHaveLength(1);
  });
});
