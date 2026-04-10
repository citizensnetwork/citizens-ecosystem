"use client";

import type { TimelineBucket } from "@/types/metrics";

interface DensityStripProps {
  buckets: TimelineBucket[];
  playbackCursor: string | null;
}

export function DensityStrip({ buckets, playbackCursor }: DensityStripProps) {
  if (buckets.length === 0) {
    return (
      <div className="h-6 rounded bg-surface-alt" aria-label="No activity density data" />
    );
  }

  const maxCount = Math.max(...buckets.map((b) => b.count));

  return (
    <div
      className="flex h-6 gap-px overflow-hidden rounded"
      role="img"
      aria-label="Activity density over time"
    >
      {buckets.map((bucket) => {
        const intensity = maxCount > 0 ? bucket.count / maxCount : 0;
        const isAtCursor = playbackCursor === bucket.date;
        return (
          <div
            key={bucket.date}
            className="flex-1 transition-colors"
            style={{
              backgroundColor: isAtCursor
                ? "#4a90d9"
                : `rgba(74, 144, 217, ${0.1 + intensity * 0.9})`,
            }}
            title={`${bucket.date}: ${bucket.count} activities`}
          />
        );
      })}
    </div>
  );
}
