import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DensityStrip } from "@/components/timeline/DensityStrip";
import { groupItemsIntoLanes } from "@/components/timeline/SwimLane";
import type { TimelineItem, TimelineMilestone } from "@/types/metrics";

describe("DensityStrip", () => {
  it("renders empty state when no buckets", () => {
    const { container } = render(
      <DensityStrip buckets={[]} playbackCursor={null} />
    );
    expect(
      container.querySelector("[aria-label='No activity density data']")
    ).toBeTruthy();
  });

  it("renders buckets with correct titles", () => {
    const buckets = [
      { date: "2026-01-01", count: 3 },
      { date: "2026-01-02", count: 7 },
      { date: "2026-01-03", count: 1 },
    ];
    const { container } = render(
      <DensityStrip buckets={buckets} playbackCursor={null} />
    );
    const bars = container.querySelectorAll("[title]");
    expect(bars.length).toBe(3);
    expect(bars[0].getAttribute("title")).toBe("2026-01-01: 3 activities");
    expect(bars[1].getAttribute("title")).toBe("2026-01-02: 7 activities");
  });

  it("highlights current playback cursor position", () => {
    const buckets = [
      { date: "2026-01-01", count: 3 },
      { date: "2026-01-02", count: 7 },
    ];
    const { container } = render(
      <DensityStrip buckets={buckets} playbackCursor="2026-01-02" />
    );
    const bars = container.querySelectorAll("[title]");
    // The cursor bar should have the accent blue color
    expect(bars[1].getAttribute("style")).toContain("rgb(74, 144, 217)");
  });
});

describe("groupItemsIntoLanes", () => {
  const items: TimelineItem[] = [
    {
      id: "a1",
      title: "Activity 1",
      type: "event",
      date: "2026-01-01",
      start_time: null,
      end_time: null,
      department_id: "dept-1",
      department_name: "Operations",
      project_id: "proj-1",
      project_name: "Project A",
      aligned_goals: ["Goal 1"],
      latitude: null,
      longitude: null,
      participant_count: 10,
    },
    {
      id: "a2",
      title: "Activity 2",
      type: "meeting",
      date: "2026-01-02",
      start_time: null,
      end_time: null,
      department_id: "dept-2",
      department_name: "Finance",
      project_id: null,
      project_name: null,
      aligned_goals: [],
      latitude: null,
      longitude: null,
      participant_count: 5,
    },
    {
      id: "a3",
      title: "Activity 3",
      type: "event",
      date: "2026-01-03",
      start_time: null,
      end_time: null,
      department_id: "dept-1",
      department_name: "Operations",
      project_id: "proj-1",
      project_name: "Project A",
      aligned_goals: ["Goal 1"],
      latitude: null,
      longitude: null,
      participant_count: 15,
    },
  ];

  const milestones: TimelineMilestone[] = [
    {
      id: "ms-1",
      project_id: "proj-1",
      project_name: "Project A",
      title: "Phase 1",
      target_date: "2026-02-01",
      completed_at: null,
      department_id: "dept-1",
      department_name: "Operations",
    },
  ];

  it("groups by department", () => {
    const lanes = groupItemsIntoLanes(items, milestones, "department");
    expect(lanes.length).toBe(2);
    const opsLane = lanes.find((l) => l.label === "Operations");
    const finLane = lanes.find((l) => l.label === "Finance");
    expect(opsLane?.items.length).toBe(2);
    expect(finLane?.items.length).toBe(1);
    expect(opsLane?.milestones.length).toBe(1);
  });

  it("groups by project", () => {
    const lanes = groupItemsIntoLanes(items, milestones, "project");
    const projLane = lanes.find((l) => l.label === "Project A");
    const noLane = lanes.find((l) => l.label === "No Project");
    expect(projLane?.items.length).toBe(2);
    expect(noLane?.items.length).toBe(1);
    expect(projLane?.milestones.length).toBe(1);
  });

  it("groups by goal", () => {
    const lanes = groupItemsIntoLanes(items, milestones, "goal");
    const goalLane = lanes.find((l) => l.label === "Goal 1");
    const noGoalLane = lanes.find((l) => l.label === "No Goal Alignment");
    expect(goalLane?.items.length).toBe(2);
    expect(noGoalLane?.items.length).toBe(1);
  });

  it("groups by type", () => {
    const lanes = groupItemsIntoLanes(items, milestones, "type");
    const eventLane = lanes.find((l) => l.label === "Event");
    const meetingLane = lanes.find((l) => l.label === "Meeting");
    expect(eventLane?.items.length).toBe(2);
    expect(meetingLane?.items.length).toBe(1);
  });

  it("returns empty array for no items", () => {
    const lanes = groupItemsIntoLanes([], [], "department");
    expect(lanes.length).toBe(0);
  });

  it("handles items with null department", () => {
    const unassigned: TimelineItem[] = [
      {
        id: "a4",
        title: "Unassigned",
        type: "other",
        date: "2026-01-01",
        start_time: null,
        end_time: null,
        department_id: null,
        department_name: null,
        project_id: null,
        project_name: null,
        aligned_goals: [],
        latitude: null,
        longitude: null,
        participant_count: 0,
      },
    ];
    const lanes = groupItemsIntoLanes(unassigned, [], "department");
    expect(lanes[0].label).toBe("Unassigned");
  });
});
