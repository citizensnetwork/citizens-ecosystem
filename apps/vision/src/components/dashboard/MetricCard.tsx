"use client";

import { formatMetricValue, formatGrowthPct, getTrendDirection } from "@/lib/metrics/utils";

interface MetricCardProps {
  label: string;
  value: number;
  growthPct?: number;
  suffix?: string;
}

export function MetricCard({ label, value, growthPct, suffix }: MetricCardProps) {
  const trend = growthPct !== undefined ? getTrendDirection(growthPct) : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-text-secondary">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-text-primary">
          {formatMetricValue(value)}
          {suffix ? <span className="ml-0.5 text-base text-text-secondary">{suffix}</span> : null}
        </span>
        {growthPct !== undefined && (
          <span
            className={`text-sm font-medium ${
              trend === "up"
                ? "text-green-400"
                : trend === "down"
                  ? "text-red-400"
                  : "text-text-secondary"
            }`}
            aria-label={`${formatGrowthPct(growthPct)} growth`}
          >
            {trend === "up" && (
              <svg className="mr-0.5 inline h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 2L10 7H2L6 2Z" fill="currentColor" />
              </svg>
            )}
            {trend === "down" && (
              <svg className="mr-0.5 inline h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 10L2 5H10L6 10Z" fill="currentColor" />
              </svg>
            )}
            {formatGrowthPct(growthPct)}
          </span>
        )}
      </div>
    </div>
  );
}
