import { create } from "zustand";
import type { MapActivity } from "@/lib/map/utils";

export type MapLayer = "markers" | "clusters" | "heatmap" | "boundaries";

interface MapState {
  /** Currently visible layers */
  activeLayers: Set<MapLayer>;
  /** Selected activity ID (shown in detail panel) */
  selectedActivityId: string | null;
  /** Selected activity data */
  selectedActivity: MapActivity | null;
  /** Whether the detail panel is open */
  detailPanelOpen: boolean;
  /** Map viewport center [lng, lat] */
  center: [number, number] | null;
  /** Map zoom level */
  zoom: number | null;

  /** Toggle a layer on/off */
  toggleLayer: (layer: MapLayer) => void;
  /** Set active layers explicitly */
  setActiveLayers: (layers: Set<MapLayer>) => void;
  /** Select an activity (opens detail panel) */
  selectActivity: (activity: MapActivity) => void;
  /** Close detail panel */
  closeDetailPanel: () => void;
  /** Update viewport state */
  setViewport: (center: [number, number], zoom: number) => void;
  /** Reset all map state */
  resetMap: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  activeLayers: new Set<MapLayer>(["markers", "clusters"]),
  selectedActivityId: null,
  selectedActivity: null,
  detailPanelOpen: false,
  center: null,
  zoom: null,

  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.activeLayers);
      if (next.has(layer)) {
        next.delete(layer);
      } else {
        next.add(layer);
      }
      return { activeLayers: next };
    }),

  setActiveLayers: (layers) => set({ activeLayers: layers }),

  selectActivity: (activity) =>
    set({
      selectedActivityId: activity.id,
      selectedActivity: activity,
      detailPanelOpen: true,
    }),

  closeDetailPanel: () =>
    set({
      selectedActivityId: null,
      selectedActivity: null,
      detailPanelOpen: false,
    }),

  setViewport: (center, zoom) => set({ center, zoom }),

  resetMap: () =>
    set({
      activeLayers: new Set<MapLayer>(["markers", "clusters"]),
      selectedActivityId: null,
      selectedActivity: null,
      detailPanelOpen: false,
      center: null,
      zoom: null,
    }),
}));
