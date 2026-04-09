"use client";

import { getAlignmentColour, getAlignmentLabel } from "@/lib/metrics/alignment";

interface GoalProgressBarProps {
  goalTitle: string;
  score: number;
  priorityWeight: number;
  deadline?: string | null;
}

export function GoalProgressBar({
  goalTitle,
  score,
  priorityWeight,
  deadline,
}: GoalProgressBarProps) {
  const colour = getAlignmentColour(score);
  const label = getAlignmentLabel(score);

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="truncate text-sm font-medium text-text-primary">
          {goalTitle}
        </span>
        <span className="shrink-0 text-sm font-medium" style={{ color: colour }}>
          {score.toFixed(0)}% — {label}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-alt">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(score, 100)}%`, backgroundColor: colour }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-text-secondary">
        <span>Weight: {priorityWeight}</span>
        {deadline && (
          <span>Due {new Date(deadline).toLocaleDateString("en-ZA")}</span>
        )}
      </div>
    </div>
  );
}
