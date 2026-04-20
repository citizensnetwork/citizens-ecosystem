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
      // Default style is the Citizens Connect gold-tinted Cloud style UUID
      // so the brand skin ships even without NEXT_PUBLIC_MAPTILER_STYLE set.
      expect(style).toContain(
        "https://api.maptiler.com/maps/019da63f-f3d4-7958-a9e3-e7c4e61e1f37/style.json",
      );
      expect(style).toContain("key=test-key-123");

      // Cleanup
      delete process.env.NEXT_PUBLIC_MAPTILER_KEY;
    });
  });
});
