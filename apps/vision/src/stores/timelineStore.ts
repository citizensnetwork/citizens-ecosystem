import { create } from "zustand";

export type TimelineZoom = "year" | "quarter" | "month" | "week" | "day";
export type SwimLaneGrouping = "department" | "project" | "goal" | "type";
export type PlaybackSpeed = 1 | 2 | 4;

interface TimelineState {
  /** Start of the visible time range (ISO date) */
  rangeStart: string;
  /** End of the visible time range (ISO date) */
  rangeEnd: string;
  /** Current zoom level */
  zoom: TimelineZoom;
  /** How items are grouped into swim lanes */
  swimLaneGrouping: SwimLaneGrouping;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Playback speed multiplier */
  playbackSpeed: PlaybackSpeed;
  /** Current playback cursor position (ISO date) */
  playbackCursor: string | null;
  /** Currently highlighted item ID */
  selectedItemId: string | null;

  /** Actions */
  setRange: (start: string, end: string) => void;
  setZoom: (zoom: TimelineZoom) => void;
  setSwimLaneGrouping: (grouping: SwimLaneGrouping) => void;
  togglePlayback: () => void;
  stopPlayback: () => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setPlaybackCursor: (cursor: string | null) => void;
  selectItem: (id: string | null) => void;
  reset: () => void;
}

function getDefaultRange(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1)
    .toISOString()
    .split("T")[0];
  return { start, end };
}

const defaultRange = getDefaultRange();

export const useTimelineStore = create<TimelineState>((set) => ({
  rangeStart: defaultRange.start,
  rangeEnd: defaultRange.end,
  zoom: "month",
  swimLaneGrouping: "department",
  isPlaying: false,
  playbackSpeed: 1,
  playbackCursor: null,
  selectedItemId: null,

  setRange: (start, end) => set({ rangeStart: start, rangeEnd: end }),
  setZoom: (zoom) => set({ zoom }),
  setSwimLaneGrouping: (grouping) => set({ swimLaneGrouping: grouping }),
  togglePlayback: () =>
    set((state) => ({
      isPlaying: !state.isPlaying,
      playbackCursor: state.isPlaying ? null : state.rangeStart,
    })),
  stopPlayback: () => set({ isPlaying: false, playbackCursor: null }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setPlaybackCursor: (cursor) => set({ playbackCursor: cursor }),
  selectItem: (id) => set({ selectedItemId: id }),
  reset: () => {
    const range = getDefaultRange();
    set({
      rangeStart: range.start,
      rangeEnd: range.end,
      zoom: "month",
      swimLaneGrouping: "department",
      isPlaying: false,
      playbackSpeed: 1,
      playbackCursor: null,
      selectedItemId: null,
    });
  },
}));
