"use client";

import type { TimelineItem, TimelineMilestone } from "@/types/metrics";
import type { SwimLaneGrouping } from "@/stores/timelineStore";
import { ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_LABELS } from "@/lib/constants";

interface SwimLaneProps {
  label: string;
  items: TimelineItem[];
  milestones: TimelineMilestone[];
  rangeStart: string;
  rangeEnd: string;
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
}

function getPositionPct(date: string, rangeStart: string, rangeEnd: string): number {
  const start = new Date(rangeStart).getTime();
  const end = new Date(rangeEnd).getTime();
  const d = new Date(date).getTime();
  const range = end - start;
  if (range <= 0) return 0;
  return Math.max(0, Math.min(100, ((d - start) / range) * 100));
}

export function SwimLane({
  label,
  items,
  milestones,
  rangeStart,
  rangeEnd,
  selectedItemId,
  onSelectItem,
}: SwimLaneProps) {
  return (
    <div className="border-b border-border py-2">
      <div className="mb-1 flex items-center gap-2 px-2">
        <span className="text-xs font-medium text-text-primary truncate max-w-[150px]">
          {label}
        </span>
        <span className="text-xs text-text-secondary">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="relative h-8 bg-surface-alt/50 rounded mx-2">
        {/* Activity dots */}
        {items.map((item) => {
          const left = getPositionPct(item.date, rangeStart, rangeEnd);
          const isSelected = item.id === selectedItemId;
          const icon = ACTIVITY_TYPE_ICONS[item.type] ?? "📋";
          return (
            <button
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all ${
                isSelected
                  ? "z-10 ring-2 ring-accent scale-125"
                  : "hover:scale-110 hover:z-10"
              }`}
              style={{ left: `${left}%` }}
              title={`${item.title} (${item.date}) - ${ACTIVITY_TYPE_LABELS[item.type] ?? item.type}`}
              aria-label={`${item.title} on ${item.date}`}
            >
              <span className="text-xs">{icon}</span>
            </button>
          );
        })}

        {/* Milestone markers */}
        {milestones.map((ms) => {
          if (!ms.target_date) return null;
          const left = getPositionPct(ms.target_date, rangeStart, rangeEnd);
          return (
            <div
              key={ms.id}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%` }}
              title={`Milestone: ${ms.title} (${ms.target_date})${ms.completed_at ? " ✓" : ""}`}
            >
              <span
                className={`text-sm ${
                  ms.completed_at ? "text-green-400" : "text-yellow-400"
                }`}
              >
                ◆
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Group timeline items into swim lanes based on the selected grouping */
export function groupItemsIntoLanes(
  items: TimelineItem[],
  milestones: TimelineMilestone[],
  grouping: SwimLaneGrouping
): Array<{
  key: string;
  label: string;
  items: TimelineItem[];
  milestones: TimelineMilestone[];
}> {
  const laneMap = new Map<
    string,
    { label: string; items: TimelineItem[]; milestones: TimelineMilestone[] }
  >();

  for (const item of items) {
    let key: string;
    let label: string;

    switch (grouping) {
      case "department":
        key = item.department_id ?? "unassigned";
        label = item.department_name ?? "Unassigned";
        break;
      case "project":
        key = item.project_id ?? "no-project";
        label = item.project_name ?? "No Project";
        break;
      case "goal":
        if (item.aligned_goals.length > 0) {
          // Place in the first goal's lane
          key = item.aligned_goals[0];
          label = item.aligned_goals[0];
        } else {
          key = "no-goal";
          label = "No Goal Alignment";
        }
        break;
      case "type":
        key = item.type;
        label = ACTIVITY_TYPE_LABELS[item.type] ?? item.type;
        break;
      default:
        key = "all";
        label = "All";
    }

    if (!laneMap.has(key)) {
      laneMap.set(key, { label, items: [], milestones: [] });
    }
    laneMap.get(key)!.items.push(item);
  }

  // Assign milestones to lanes
  for (const ms of milestones) {
    let key: string;
    let label: string;

    switch (grouping) {
      case "department":
        key = ms.department_id ?? "unassigned";
        label = ms.department_name ?? "Unassigned";
        break;
      case "project":
        key = ms.project_id;
        label = ms.project_name;
        break;
      default:
        key = ms.project_id;
        label = ms.project_name;
    }

    if (!laneMap.has(key)) {
      laneMap.set(key, { label, items: [], milestones: [] });
    }
    laneMap.get(key)!.milestones.push(ms);
  }

  return Array.from(laneMap.entries()).map(([key, data]) => ({
    key,
    ...data,
  }));
}
