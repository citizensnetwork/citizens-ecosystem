// Analytics utility functions (Phase 10)

import type { TrendDataPoint } from "@/types/metrics";

/**
 * Compute linear regression on trend data points.
 * Returns slope, intercept, r_squared, and the regression line.
 */
export function computeLinearRegression(data: TrendDataPoint[]): {
  slope: number;
  intercept: number;
  r_squared: number;
  trend_line: { date: string; value: number }[];
} {
  const n = data.length;
  if (n < 2) {
    return {
      slope: 0,
      intercept: 0,
      r_squared: 0,
      trend_line: data.map((d) => ({ date: d.date, value: d.count })),
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = data[i].count;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const ssNum = n * sumXY - sumX * sumY;
  const ssDenX = n * sumX2 - sumX * sumX;
  const ssDenY = n * sumY2 - sumY * sumY;
  const r_squared =
    ssDenX === 0 || ssDenY === 0 ? 0 : (ssNum * ssNum) / (ssDenX * ssDenY);

  const trend_line = data.map((d, i) => ({
    date: d.date,
    value: Math.round((slope * i + intercept) * 100) / 100,
  }));

  return { slope, intercept, r_squared, trend_line };
}

/**
 * Compute moving average of counts over a window.
 */
export function computeMovingAverage(
  data: TrendDataPoint[],
  window: number = 3
): { date: string; value: number }[] {
  if (data.length === 0) return [];

  const result: { date: string; value: number }[] = [];

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(data.length, i + Math.ceil(window / 2));
    const slice = data.slice(start, end);
    const avg = slice.reduce((sum, d) => sum + d.count, 0) / slice.length;
    result.push({
      date: data[i].date,
      value: Math.round(avg * 100) / 100,
    });
  }

  return result;
}

/**
 * Compute percentage change between two values.
 */
export function computeChangePct(a: number, b: number): number {
  if (a === 0) return b === 0 ? 0 : 100;
  return Math.round(((b - a) / a) * 100 * 100) / 100;
}

/**
 * Generate CSV string from array of objects.
 */
export function generateCSV(
  data: Record<string, unknown>[],
  columns: { key: string; label: string }[]
): string {
  const header = columns.map((c) => escapeCSV(c.label)).join(",");
  const rows = data.map((row) =>
    columns.map((c) => escapeCSV(String(row[c.key] ?? ""))).join(",")
  );
  return [header, ...rows].join("\n");
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format trend direction label from slope.
 */
export function getTrendDirection(slope: number): "increasing" | "decreasing" | "stable" {
  if (slope > 0.5) return "increasing";
  if (slope < -0.5) return "decreasing";
  return "stable";
}

/**
 * Get trend direction colour.
 */
export function getTrendColour(direction: "increasing" | "decreasing" | "stable"): string {
  switch (direction) {
    case "increasing": return "#6bcf7f";
    case "decreasing": return "#ef4444";
    case "stable": return "#abb2bf";
  }
}
