"use client";

import { COVERAGE_LEVEL_COLOURS, COVERAGE_LEVEL_LABELS } from "@/lib/constants";
import type { CoverageLevel } from "@/types/db";

interface CoverageOverlayProps {
  coverageSummary: {
    level: CoverageLevel;
    count: number;
  }[];
  totalBoundaries: number;
}

export function CoverageOverlay({ coverageSummary, totalBoundaries }: CoverageOverlayProps) {
  if (totalBoundaries === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface/90 p-3 shadow-lg backdrop-blur-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Coverage
      </h3>
      <div className="space-y-1.5">
        {coverageSummary.map(({ level, count }) => (
          <div key={level} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: COVERAGE_LEVEL_COLOURS[level] }}
            />
            <span className="text-text-secondary">
              {COVERAGE_LEVEL_LABELS[level]}
            </span>
            <span className="ml-auto font-medium text-text-primary">{count}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-border pt-2 text-xs text-text-secondary">
        {totalBoundaries} {totalBoundaries === 1 ? "boundary" : "boundaries"} total
      </div>
    </div>
  );
}
