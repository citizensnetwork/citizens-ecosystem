import { describe, it, expect, beforeEach } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import type { MapActivity } from "@/lib/map/utils";

const sampleActivity: MapActivity = {
  id: "act-1",
  title: "Test Activity",
  type: "event",
  date: "2026-04-01",
  latitude: -25.75,
  longitude: 28.23,
  location_name: "Test Location",
  participant_count: 30,
  department_id: "dept-1",
  department_name: "Operations",
  tags: ["community"],
};

describe("mapStore", () => {
  beforeEach(() => {
    useMapStore.getState().resetMap();
  });

  describe("initial state", () => {
    it("has markers and clusters as default active layers", () => {
      const { activeLayers } = useMapStore.getState();
      expect(activeLayers.has("markers")).toBe(true);
      expect(activeLayers.has("clusters")).toBe(true);
      expect(activeLayers.has("heatmap")).toBe(false);
    });

    it("has no selected activity", () => {
      const state = useMapStore.getState();
      expect(state.selectedActivityId).toBeNull();
      expect(state.selectedActivity).toBeNull();
      expect(state.detailPanelOpen).toBe(false);
    });

    it("has null viewport", () => {
      const state = useMapStore.getState();
      expect(state.center).toBeNull();
      expect(state.zoom).toBeNull();
    });
  });

  describe("toggleLayer", () => {
    it("toggles a layer off when active", () => {
      useMapStore.getState().toggleLayer("markers");
      expect(useMapStore.getState().activeLayers.has("markers")).toBe(false);
    });

    it("toggles a layer on when inactive", () => {
      useMapStore.getState().toggleLayer("heatmap");
      expect(useMapStore.getState().activeLayers.has("heatmap")).toBe(true);
    });

    it("preserves other layers when toggling", () => {
      useMapStore.getState().toggleLayer("heatmap");
      const layers = useMapStore.getState().activeLayers;
      expect(layers.has("markers")).toBe(true);
      expect(layers.has("clusters")).toBe(true);
      expect(layers.has("heatmap")).toBe(true);
    });
  });

  describe("setActiveLayers", () => {
    it("replaces all active layers", () => {
      useMapStore.getState().setActiveLayers(new Set(["heatmap"]));
      const layers = useMapStore.getState().activeLayers;
      expect(layers.has("heatmap")).toBe(true);
      expect(layers.has("markers")).toBe(false);
      expect(layers.has("clusters")).toBe(false);
    });
  });

  describe("selectActivity / closeDetailPanel", () => {
    it("selects an activity and opens detail panel", () => {
      useMapStore.getState().selectActivity(sampleActivity);
      const state = useMapStore.getState();
      expect(state.selectedActivityId).toBe("act-1");
      expect(state.selectedActivity).toEqual(sampleActivity);
      expect(state.detailPanelOpen).toBe(true);
    });

    it("closes detail panel and clears selection", () => {
      useMapStore.getState().selectActivity(sampleActivity);
      useMapStore.getState().closeDetailPanel();
      const state = useMapStore.getState();
      expect(state.selectedActivityId).toBeNull();
      expect(state.selectedActivity).toBeNull();
      expect(state.detailPanelOpen).toBe(false);
    });
  });

  describe("setViewport", () => {
    it("updates center and zoom", () => {
      useMapStore.getState().setViewport([28.2, -25.7], 12);
      const state = useMapStore.getState();
      expect(state.center).toEqual([28.2, -25.7]);
      expect(state.zoom).toBe(12);
    });
  });

  describe("resetMap", () => {
    it("resets all state to defaults", () => {
      useMapStore.getState().selectActivity(sampleActivity);
      useMapStore.getState().setViewport([0, 0], 5);
      useMapStore.getState().toggleLayer("heatmap");

      useMapStore.getState().resetMap();
      const state = useMapStore.getState();

      expect(state.activeLayers.has("markers")).toBe(true);
      expect(state.activeLayers.has("clusters")).toBe(true);
      expect(state.activeLayers.has("heatmap")).toBe(false);
      expect(state.selectedActivityId).toBeNull();
      expect(state.detailPanelOpen).toBe(false);
      expect(state.center).toBeNull();
      expect(state.zoom).toBeNull();
    });
  });
});
