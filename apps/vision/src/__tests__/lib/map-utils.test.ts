import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  saveViewport,
  loadViewport,
  activitiesToGeoJSON,
  geocodeSearch,
  type MapActivity,
  type MapViewport,
} from "@/lib/map/utils";
import { VIEWPORT_STORAGE_KEY } from "@/lib/map/config";

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {};
const mockGetItem = vi.fn((key: string) => mockSessionStorage[key] ?? null);
const mockSetItem = vi.fn((key: string, value: string) => {
  mockSessionStorage[key] = value;
});

beforeEach(() => {
  Object.defineProperty(window, "sessionStorage", {
    value: { getItem: mockGetItem, setItem: mockSetItem },
    writable: true,
  });
  vi.clearAllMocks();
  for (const key in mockSessionStorage) delete mockSessionStorage[key];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveViewport / loadViewport", () => {
  it("saves and loads viewport from sessionStorage", () => {
    const viewport: MapViewport = { center: [28.2, -25.7], zoom: 12 };

    saveViewport(viewport);
    expect(mockSetItem).toHaveBeenCalledWith(
      VIEWPORT_STORAGE_KEY,
      JSON.stringify(viewport)
    );

    // Simulate loading
    mockSessionStorage[VIEWPORT_STORAGE_KEY] = JSON.stringify(viewport);
    const loaded = loadViewport();
    expect(loaded).toEqual(viewport);
  });

  it("returns null when no viewport is saved", () => {
    const loaded = loadViewport();
    expect(loaded).toBeNull();
  });

  it("returns null for invalid stored data", () => {
    mockSessionStorage[VIEWPORT_STORAGE_KEY] = "not json";
    expect(loadViewport()).toBeNull();
  });

  it("returns null for malformed viewport object", () => {
    mockSessionStorage[VIEWPORT_STORAGE_KEY] = JSON.stringify({
      center: "bad",
      zoom: "nope",
    });
    expect(loadViewport()).toBeNull();
  });

  it("validates center array length", () => {
    mockSessionStorage[VIEWPORT_STORAGE_KEY] = JSON.stringify({
      center: [1],
      zoom: 10,
    });
    expect(loadViewport()).toBeNull();
  });
});

describe("activitiesToGeoJSON", () => {
  const sampleActivities: MapActivity[] = [
    {
      id: "act-1",
      title: "Community Meeting",
      type: "meeting",
      date: "2026-04-01",
      latitude: -25.75,
      longitude: 28.23,
      location_name: "City Hall",
      participant_count: 50,
      department_id: "dept-1",
      department_name: "Operations",
      tags: ["community", "planning"],
    },
    {
      id: "act-2",
      title: "Training Workshop",
      type: "workshop",
      date: "2026-04-02",
      latitude: -25.80,
      longitude: 28.30,
      location_name: null,
      participant_count: 20,
      department_id: null,
      department_name: null,
      tags: [],
    },
  ];

  it("produces a valid GeoJSON FeatureCollection", () => {
    const geojson = activitiesToGeoJSON(sampleActivities);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(2);
  });

  it("creates Point features with correct coordinates", () => {
    const geojson = activitiesToGeoJSON(sampleActivities);
    const feature = geojson.features[0];
    expect(feature.type).toBe("Feature");
    expect(feature.geometry.type).toBe("Point");
    expect((feature.geometry as GeoJSON.Point).coordinates).toEqual([28.23, -25.75]);
  });

  it("includes all properties in features", () => {
    const geojson = activitiesToGeoJSON(sampleActivities);
    const props = geojson.features[0].properties!;
    expect(props.id).toBe("act-1");
    expect(props.title).toBe("Community Meeting");
    expect(props.type).toBe("meeting");
    expect(props.date).toBe("2026-04-01");
    expect(props.location_name).toBe("City Hall");
    expect(props.participant_count).toBe(50);
    expect(props.department_id).toBe("dept-1");
    expect(props.department_name).toBe("Operations");
    expect(props.tags).toBe("community,planning");
    expect(typeof props.days_ago).toBe("number");
    expect(props.days_ago).toBeGreaterThanOrEqual(0);
  });

  it("computes days_ago as 0 for today", () => {
    const today = new Date().toISOString().split("T")[0];
    const activities: MapActivity[] = [
      {
        id: "act-today",
        title: "Today Event",
        type: "event",
        date: today,
        latitude: -25.75,
        longitude: 28.23,
        location_name: null,
        participant_count: 10,
        department_id: null,
        tags: [],
      },
    ];
    const geojson = activitiesToGeoJSON(activities);
    expect(geojson.features[0].properties!.days_ago).toBe(0);
  });

  it("handles activities with null department", () => {
    const geojson = activitiesToGeoJSON(sampleActivities);
    const props = geojson.features[1].properties!;
    expect(props.department_id).toBeNull();
    expect(props.department_name).toBeNull();
    expect(props.tags).toBe("");
  });

  it("returns empty collection for no activities", () => {
    const geojson = activitiesToGeoJSON([]);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(0);
  });
});

describe("geocodeSearch", () => {
  it("returns empty array for empty query", async () => {
    const results = await geocodeSearch("");
    expect(results).toEqual([]);
  });

  it("returns empty array for whitespace-only query", async () => {
    const results = await geocodeSearch("   ");
    expect(results).toEqual([]);
  });

  it("calls Nominatim API with correct parameters", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            display_name: "Pretoria, Gauteng, South Africa",
            lat: "-25.7479",
            lon: "28.2293",
            boundingbox: ["-25.9", "-25.5", "28.0", "28.4"],
          },
        ])
      )
    );

    const results = await geocodeSearch("Pretoria");
    expect(results).toHaveLength(1);
    expect(results[0].display_name).toBe("Pretoria, Gauteng, South Africa");
    expect(results[0].lat).toBeCloseTo(-25.7479);
    expect(results[0].lon).toBeCloseTo(28.2293);

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("nominatim.openstreetmap.org");
    expect(calledUrl).toContain("q=Pretoria");
    expect(calledUrl).toContain("format=json");

    fetchSpy.mockRestore();
  });

  it("returns empty array on fetch failure", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    );

    const results = await geocodeSearch("Test");
    expect(results).toEqual([]);

    fetchSpy.mockRestore();
  });
});
