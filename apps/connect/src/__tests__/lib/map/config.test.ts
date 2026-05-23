import { describe, it, expect, vi, beforeEach } from "vitest";

describe("map/config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("DEFAULT_CENTER", () => {
    it("equals Pretoria coordinates [-25.7479, 28.2293]", async () => {
      const { DEFAULT_CENTER } = await import("@/lib/map/config");
      expect(DEFAULT_CENTER).toEqual([-25.7479, 28.2293]);
    });
  });

  describe("toLngLat", () => {
    it("swaps [lat, lng] to [lng, lat]", async () => {
      const { toLngLat } = await import("@/lib/map/config");
      expect(toLngLat([-25.7479, 28.2293])).toEqual([28.2293, -25.7479]);
    });

    it("double-swap returns the original value", async () => {
      const { toLngLat } = await import("@/lib/map/config");
      const original: [number, number] = [-25.7479, 28.2293];
      expect(toLngLat(toLngLat(original))).toEqual(original);
    });

    it("preserves decimal precision", async () => {
      const { toLngLat } = await import("@/lib/map/config");
      const result = toLngLat([-25.123456789, 28.987654321]);
      expect(result[0]).toBe(28.987654321);
      expect(result[1]).toBe(-25.123456789);
    });
  });

  describe("getMapStyle", () => {
    it("returns OSM raster style object when MAPTILER_KEY is not set", async () => {
      delete process.env.NEXT_PUBLIC_MAPTILER_KEY;
      const { getMapStyle } = await import("@/lib/map/config");
      const style = getMapStyle();

      expect(typeof style).toBe("object");
      expect(style).toHaveProperty("version", 8);
      expect(style).toHaveProperty("sources");
      expect(style).toHaveProperty("layers");
    });

    it("returns MapTiler URL string when MAPTILER_KEY is set", async () => {
      process.env.NEXT_PUBLIC_MAPTILER_KEY = "test-key-123";
      const { getMapStyle } = await import("@/lib/map/config");
      const style = getMapStyle();

      expect(typeof style).toBe("string");
      // Default style is the Citizens Connect custom Cloud style UUID
      // so the brand skin ships even without NEXT_PUBLIC_MAPTILER_STYLE set.
      expect(style).toContain(
        "https://api.maptiler.com/maps/019e5525-61a4-7791-82f2-2222fb440592/style.json",
      );
      expect(style).toContain("key=test-key-123");

      // Cleanup
      delete process.env.NEXT_PUBLIC_MAPTILER_KEY;
    });
  });

  describe("pruneBasemapLayers", () => {
    type FakeLayer = { id: string; type: string; "source-layer"?: string };

    function makeFakeMap(layers: FakeLayer[]) {
      const removed: string[] = [];
      const remaining = new Map(layers.map((l) => [l.id, l] as const));
      return {
        removed,
        map: {
          getStyle: () => ({ layers }),
          getLayer: (id: string) => remaining.get(id),
          removeLayer: (id: string) => {
            removed.push(id);
            remaining.delete(id);
          },
        },
      };
    }

    it("removes POI, building, aeroway, transit, housenumber, hillshade layers", async () => {
      const { pruneBasemapLayers } = await import("@/lib/map/config");
      const { map, removed } = makeFakeMap([
        { id: "poi_z14", type: "symbol", "source-layer": "poi" },
        { id: "poi_z16", type: "symbol", "source-layer": "poi" },
        { id: "building", type: "fill", "source-layer": "building" },
        { id: "building-3d", type: "fill-extrusion", "source-layer": "building" },
        { id: "aeroway_runway", type: "line", "source-layer": "aeroway" },
        { id: "transit_line", type: "line", "source-layer": "transit" },
        { id: "ferry", type: "line", "source-layer": "ferry" },
        { id: "housenumber", type: "symbol", "source-layer": "housenumber" },
        { id: "hillshade", type: "raster", "source-layer": "hillshade" },
        { id: "contour_line", type: "line", "source-layer": "contour" },
        // must KEEP:
        { id: "road_major", type: "line", "source-layer": "transportation" },
        { id: "road_label", type: "symbol", "source-layer": "transportation_name" },
        { id: "place_suburb", type: "symbol", "source-layer": "place" },
        { id: "water", type: "fill", "source-layer": "water" },
        { id: "park", type: "fill", "source-layer": "park" },
        { id: "boundary_country", type: "line", "source-layer": "boundary" },
        { id: "background", type: "background" },
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pruneBasemapLayers(map as any);

      expect(removed).toEqual(
        expect.arrayContaining([
          "poi_z14",
          "poi_z16",
          "building",
          "building-3d",
          "aeroway_runway",
          "transit_line",
          "ferry",
          "housenumber",
          "contour_line",
        ]),
      );
      // hillshade is type:raster — current rule skips raster layers
      // (raster basemap fallback must keep its single raster layer).
      // That's fine: hillshade overlays are vector in OpenMapTiles.
      expect(removed).not.toContain("road_major");
      expect(removed).not.toContain("road_label");
      expect(removed).not.toContain("place_suburb");
      expect(removed).not.toContain("water");
      expect(removed).not.toContain("park");
      expect(removed).not.toContain("boundary_country");
      expect(removed).not.toContain("background");
    });

    it("is a no-op when NEXT_PUBLIC_MAP_PRUNE=off", async () => {
      process.env.NEXT_PUBLIC_MAP_PRUNE = "off";
      const { pruneBasemapLayers } = await import("@/lib/map/config");
      const { map, removed } = makeFakeMap([
        { id: "poi_z14", type: "symbol", "source-layer": "poi" },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pruneBasemapLayers(map as any);
      expect(removed).toEqual([]);
      delete process.env.NEXT_PUBLIC_MAP_PRUNE;
    });

    it("does not throw on raster-only style (CARTO fallback)", async () => {
      const { pruneBasemapLayers } = await import("@/lib/map/config");
      const { map, removed } = makeFakeMap([
        { id: "carto-light", type: "raster" },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => pruneBasemapLayers(map as any)).not.toThrow();
      expect(removed).toEqual([]);
    });

    it("swallows getStyle errors silently", async () => {
      const { pruneBasemapLayers } = await import("@/lib/map/config");
      const map = {
        getStyle: () => {
          throw new Error("style not loaded");
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => pruneBasemapLayers(map as any)).not.toThrow();
    });
  });
});
