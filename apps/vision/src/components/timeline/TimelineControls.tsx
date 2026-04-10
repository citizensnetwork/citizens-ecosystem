"use client";

import { useTimelineStore } from "@/stores/timelineStore";
import type { TimelineZoom, SwimLaneGrouping } from "@/stores/timelineStore";

const ZOOM_LEVELS: { value: TimelineZoom; label: string }[] = [
  { value: "year", label: "Year" },
  { value: "quarter", label: "Quarter" },
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

const GROUPINGS: { value: SwimLaneGrouping; label: string }[] = [
  { value: "department", label: "Department" },
  { value: "project", label: "Project" },
  { value: "goal", label: "Goal" },
  { value: "type", label: "Activity Type" },
];

export function TimelineControls() {
  const {
    rangeStart,
    rangeEnd,
    zoom,
    swimLaneGrouping,
    setRange,
    setZoom,
    setSwimLaneGrouping,
  } = useTimelineStore();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-text-secondary" htmlFor="tl-from">
          From
        </label>
        <input
          id="tl-from"
          type="date"
          value={rangeStart}
          onChange={(e) => setRange(e.target.value, rangeEnd)}
          className="rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
        />
        <label className="text-xs text-text-secondary" htmlFor="tl-to">
          To
        </label>
        <input
          id="tl-to"
          type="date"
          value={rangeEnd}
          onChange={(e) => setRange(rangeStart, e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
        />
      </div>

      {/* Zoom level */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-secondary">Zoom</span>
        <div className="flex rounded border border-border bg-surface">
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z.value}
              onClick={() => setZoom(z.value)}
              className={`px-2 py-1 text-xs transition-colors ${
                zoom === z.value
                  ? "bg-accent text-highlight font-medium"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* Swim lane grouping */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-secondary">Group by</span>
        <select
          value={swimLaneGrouping}
          onChange={(e) =>
            setSwimLaneGrouping(e.target.value as SwimLaneGrouping)
          }
          className="rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
        >
          {GROUPINGS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
