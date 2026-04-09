import { describe, it, expect } from "vitest";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  CLUSTER_RADIUS,
  CLUSTER_MAX_ZOOM,
  HEATMAP_INTENSITY,
  HEATMAP_RADIUS,
  HEATMAP_OPACITY,
  OSM_STYLE_URL,
  ACTIVITY_TYPE_COLOURS,
  NOMINATIM_SEARCH_URL,
  NOMINATIM_USER_AGENT,
  VIEWPORT_STORAGE_KEY,
} from "@/lib/map/config";
import { ACTIVITY_TYPES } from "@/lib/constants";

describe("Map Config", () => {
  it("exports valid default center coordinates", () => {
    expect(DEFAULT_CENTER).toHaveLength(2);
    const [lng, lat] = DEFAULT_CENTER;
    expect(lng).toBeGreaterThanOrEqual(-180);
    expect(lng).toBeLessThanOrEqual(180);
    expect(lat).toBeGreaterThanOrEqual(-90);
    expect(lat).toBeLessThanOrEqual(90);
  });

  it("exports valid zoom constraints", () => {
    expect(DEFAULT_ZOOM).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(DEFAULT_ZOOM).toBeLessThanOrEqual(MAX_ZOOM);
    expect(MIN_ZOOM).toBeLessThan(MAX_ZOOM);
  });

  it("exports valid clustering config", () => {
    expect(CLUSTER_RADIUS).toBeGreaterThan(0);
    expect(CLUSTER_MAX_ZOOM).toBeGreaterThan(0);
    expect(CLUSTER_MAX_ZOOM).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it("exports valid heatmap config", () => {
    expect(HEATMAP_INTENSITY).toBeGreaterThan(0);
    expect(HEATMAP_RADIUS).toBeGreaterThan(0);
    expect(HEATMAP_OPACITY).toBeGreaterThan(0);
    expect(HEATMAP_OPACITY).toBeLessThanOrEqual(1);
  });

  it("exports a valid style URL", () => {
    expect(OSM_STYLE_URL).toMatch(/^https:\/\//);
    expect(OSM_STYLE_URL).toContain("style.json");
  });

  it("has colours for every activity type", () => {
    for (const type of ACTIVITY_TYPES) {
      expect(ACTIVITY_TYPE_COLOURS[type]).toBeDefined();
      expect(ACTIVITY_TYPE_COLOURS[type]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("exports valid Nominatim config", () => {
    expect(NOMINATIM_SEARCH_URL).toMatch(/^https:\/\//);
    expect(NOMINATIM_SEARCH_URL).toContain("nominatim");
    expect(NOMINATIM_USER_AGENT).toBeTruthy();
    expect(NOMINATIM_USER_AGENT.length).toBeGreaterThan(0);
  });

  it("exports viewport storage key", () => {
    expect(VIEWPORT_STORAGE_KEY).toBe("cv-map-viewport");
  });
});
