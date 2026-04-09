"use client";

import { GOAL_STATUS_LABELS, GOAL_STATUS_COLOURS } from "@/lib/constants";
import { getAlignmentColour, getAlignmentLabel } from "@/lib/metrics/alignment";
import type { GoalWithVision } from "@/types/db";
import Link from "next/link";

interface GoalCardProps {
  goal: GoalWithVision;
  orgSlug: string;
  alignmentScore?: number;
}

export function GoalCard({ goal, orgSlug, alignmentScore }: GoalCardProps) {
  const statusColour = GOAL_STATUS_COLOURS[goal.status] ?? "#abb2bf";
  const score = alignmentScore ?? 0;
  const scoreColour = getAlignmentColour(score);

  return (
    <Link
      href={`/${orgSlug}/goals/${goal.id}`}
      className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-text-primary">
            {goal.title}
          </h3>
          {goal.vision_statements?.title && (
            <p className="mt-0.5 truncate text-xs text-text-secondary">
              {goal.vision_statements.title}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `${statusColour}20`, color: statusColour }}
        >
          {GOAL_STATUS_LABELS[goal.status] ?? goal.status}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {goal.deadline && (
            <span className="text-xs text-text-secondary">
              Due {new Date(goal.deadline).toLocaleDateString("en-ZA")}
            </span>
          )}
          {goal.priority_weight !== 1 && (
            <span className="text-xs text-text-secondary">
              Weight: {goal.priority_weight}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: scoreColour }}
          />
          <span className="text-xs font-medium" style={{ color: scoreColour }}>
            {score.toFixed(0)}% {getAlignmentLabel(score)}
          </span>
        </div>
      </div>

      {goal.target_value != null && goal.target_unit && (
        <p className="mt-2 text-xs text-text-secondary">
          Target: {goal.target_value} {goal.target_unit}
        </p>
      )}
    </Link>
  );
}
