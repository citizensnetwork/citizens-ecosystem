"use client";

import {
  PROJECT_STATUS_COLOURS,
} from "@/lib/constants";
import type { Project } from "@/types/db";

interface GanttBarProps {
  project: Pick<Project, "name" | "status" | "start_date" | "end_date">;
  milestoneProgress: number;
  now: number;
}

export function GanttBar({ project, milestoneProgress, now }: GanttBarProps) {
  const statusColour = PROJECT_STATUS_COLOURS[project.status] ?? "#abb2bf";

  if (!project.start_date || !project.end_date) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-medium text-text-primary">
          Project Timeline
        </h3>
        <p className="text-xs text-text-secondary">
          Set start and end dates to see the timeline bar.
        </p>
      </div>
    );
  }

  const start = new Date(project.start_date).getTime();
  const end = new Date(project.end_date).getTime();
  const totalDuration = end - start;

  const timeElapsedPct =
    totalDuration > 0
      ? Math.max(0, Math.min(100, ((now - start) / totalDuration) * 100))
      : 0;

  const daysRemaining = Math.ceil((end - now) / 86400000);
  const isOverdue = now > end && project.status !== "completed";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">
          Project Timeline
        </h3>
        <span
          className={`text-xs font-medium ${isOverdue ? "text-red-400" : "text-text-secondary"}`}
        >
          {isOverdue
            ? `${Math.abs(daysRemaining)} days overdue`
            : daysRemaining > 0
              ? `${daysRemaining} days remaining`
              : "Due today"}
        </span>
      </div>

      {/* Timeline bar */}
      <div className="relative mb-2 h-6 overflow-hidden rounded bg-surface-alt">
        {/* Elapsed time indicator */}
        <div
          className="absolute inset-y-0 left-0 rounded opacity-20"
          style={{
            width: `${timeElapsedPct}%`,
            backgroundColor: statusColour,
          }}
        />
        {/* Milestone progress */}
        <div
          className="absolute inset-y-0 left-0 rounded transition-all"
          style={{
            width: `${milestoneProgress}%`,
            backgroundColor: statusColour,
          }}
        />
        {/* Now marker */}
        {timeElapsedPct > 0 && timeElapsedPct < 100 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-text-primary"
            style={{ left: `${timeElapsedPct}%` }}
            title="Today"
          />
        )}
      </div>

      <div className="flex justify-between text-xs text-text-secondary">
        <span>
          {new Date(project.start_date).toLocaleDateString("en-ZA")}
        </span>
        <span>
          {milestoneProgress}% milestones complete
        </span>
        <span>
          {new Date(project.end_date).toLocaleDateString("en-ZA")}
        </span>
      </div>
    </div>
  );
}
