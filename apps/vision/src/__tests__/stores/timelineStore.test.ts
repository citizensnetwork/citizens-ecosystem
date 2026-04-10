import { describe, it, expect, beforeEach } from "vitest";
import { useTimelineStore } from "@/stores/timelineStore";

describe("timelineStore", () => {
  beforeEach(() => {
    useTimelineStore.getState().reset();
  });

  describe("initial state", () => {
    it("has default zoom level of month", () => {
      expect(useTimelineStore.getState().zoom).toBe("month");
    });

    it("has default swim lane grouping of department", () => {
      expect(useTimelineStore.getState().swimLaneGrouping).toBe("department");
    });

    it("is not playing", () => {
      expect(useTimelineStore.getState().isPlaying).toBe(false);
    });

    it("has default playback speed of 1", () => {
      expect(useTimelineStore.getState().playbackSpeed).toBe(1);
    });

    it("has no playback cursor", () => {
      expect(useTimelineStore.getState().playbackCursor).toBeNull();
    });

    it("has no selected item", () => {
      expect(useTimelineStore.getState().selectedItemId).toBeNull();
    });

    it("has valid date range", () => {
      const { rangeStart, rangeEnd } = useTimelineStore.getState();
      expect(rangeStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rangeEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(rangeStart).getTime()).toBeLessThan(
        new Date(rangeEnd).getTime()
      );
    });
  });

  describe("setRange", () => {
    it("updates the range", () => {
      useTimelineStore.getState().setRange("2026-01-01", "2026-06-30");
      expect(useTimelineStore.getState().rangeStart).toBe("2026-01-01");
      expect(useTimelineStore.getState().rangeEnd).toBe("2026-06-30");
    });
  });

  describe("setZoom", () => {
    it("updates to year", () => {
      useTimelineStore.getState().setZoom("year");
      expect(useTimelineStore.getState().zoom).toBe("year");
    });

    it("updates to day", () => {
      useTimelineStore.getState().setZoom("day");
      expect(useTimelineStore.getState().zoom).toBe("day");
    });
  });

  describe("setSwimLaneGrouping", () => {
    it("updates to project", () => {
      useTimelineStore.getState().setSwimLaneGrouping("project");
      expect(useTimelineStore.getState().swimLaneGrouping).toBe("project");
    });

    it("updates to goal", () => {
      useTimelineStore.getState().setSwimLaneGrouping("goal");
      expect(useTimelineStore.getState().swimLaneGrouping).toBe("goal");
    });

    it("updates to type", () => {
      useTimelineStore.getState().setSwimLaneGrouping("type");
      expect(useTimelineStore.getState().swimLaneGrouping).toBe("type");
    });
  });

  describe("togglePlayback", () => {
    it("starts playback and sets cursor to range start", () => {
      useTimelineStore.getState().togglePlayback();
      const state = useTimelineStore.getState();
      expect(state.isPlaying).toBe(true);
      expect(state.playbackCursor).toBe(state.rangeStart);
    });

    it("stops playback and clears cursor", () => {
      useTimelineStore.getState().togglePlayback(); // start
      useTimelineStore.getState().togglePlayback(); // stop
      const state = useTimelineStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.playbackCursor).toBeNull();
    });
  });

  describe("stopPlayback", () => {
    it("stops and clears cursor", () => {
      useTimelineStore.getState().togglePlayback();
      useTimelineStore.getState().stopPlayback();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      expect(useTimelineStore.getState().playbackCursor).toBeNull();
    });
  });

  describe("setPlaybackSpeed", () => {
    it("sets speed to 2", () => {
      useTimelineStore.getState().setPlaybackSpeed(2);
      expect(useTimelineStore.getState().playbackSpeed).toBe(2);
    });

    it("sets speed to 4", () => {
      useTimelineStore.getState().setPlaybackSpeed(4);
      expect(useTimelineStore.getState().playbackSpeed).toBe(4);
    });
  });

  describe("setPlaybackCursor", () => {
    it("sets cursor to a date", () => {
      useTimelineStore.getState().setPlaybackCursor("2026-03-15");
      expect(useTimelineStore.getState().playbackCursor).toBe("2026-03-15");
    });

    it("clears cursor with null", () => {
      useTimelineStore.getState().setPlaybackCursor("2026-03-15");
      useTimelineStore.getState().setPlaybackCursor(null);
      expect(useTimelineStore.getState().playbackCursor).toBeNull();
    });
  });

  describe("selectItem", () => {
    it("selects an item", () => {
      useTimelineStore.getState().selectItem("item-1");
      expect(useTimelineStore.getState().selectedItemId).toBe("item-1");
    });

    it("deselects with null", () => {
      useTimelineStore.getState().selectItem("item-1");
      useTimelineStore.getState().selectItem(null);
      expect(useTimelineStore.getState().selectedItemId).toBeNull();
    });
  });

  describe("reset", () => {
    it("resets all state to defaults", () => {
      useTimelineStore.getState().setZoom("year");
      useTimelineStore.getState().setSwimLaneGrouping("project");
      useTimelineStore.getState().setPlaybackSpeed(4);
      useTimelineStore.getState().selectItem("item-1");

      useTimelineStore.getState().reset();
      const state = useTimelineStore.getState();
      expect(state.zoom).toBe("month");
      expect(state.swimLaneGrouping).toBe("department");
      expect(state.playbackSpeed).toBe(1);
      expect(state.selectedItemId).toBeNull();
      expect(state.isPlaying).toBe(false);
    });
  });
});
