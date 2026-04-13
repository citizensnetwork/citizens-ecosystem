"use client";

import { useState, useEffect, useCallback } from "react";
import type { TrendRegression } from "@/types/analytics";
import type { TrendDataPoint } from "@/types/metrics";

interface RegressionChartProps {
  orgId: string;
}

export function RegressionChart({ orgId }: RegressionChartProps) {
  const [data, setData] = useState<{
    regression: TrendRegression;
    direction: string;
    trend: TrendDataPoint[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("week");
  const [dateFrom, setDateFrom] = useState(
    new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date().toISOString().split("T")[0]
  );

  const fetchRegression = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      org_id: orgId,
      date_from: dateFrom,
      date_to: dateTo,
      granularity,
    });
    try {
      const res = await fetch(`/api/metrics/regression?${params}`);
      if (!res.ok) throw new Error("Failed to fetch regression");
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error(err);
      setError("Failed to load regression data");
    } finally {
      setLoading(false);
    }
  }, [orgId, dateFrom, dateTo, granularity]);

  useEffect(() => {
    fetchRegression();
  }, [fetchRegression]);

  const directionColour =
    data?.direction === "increasing"
      ? "text-green-400"
      : data?.direction === "decreasing"
      ? "text-red-400"
      : "text-text-secondary";

  const directionLabel =
    data?.direction === "increasing"
      ? "↑ Increasing"
      : data?.direction === "decreasing"
      ? "↓ Decreasing"
      : "→ Stable";

  return (
    <div className="rounded-lg bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Trend Analysis</h3>
        {data && (
          <span className={`text-sm font-medium ${directionColour}`}>
            {directionLabel}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Regression start date"
          className="rounded bg-background px-2 py-1 text-xs text-white border border-border"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Regression end date"
          className="rounded bg-background px-2 py-1 text-xs text-white border border-border"
        />
        <select
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as "day" | "week" | "month")}
          aria-label="Granularity"
          className="rounded bg-background px-2 py-1 text-xs text-white border border-border"
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </div>

      {loading && (
        <div className="text-center py-4 text-text-secondary text-sm">
          Computing regression…
        </div>
      )}

      {error && (
        <div className="text-center py-4 text-red-400 text-sm">{error}</div>
      )}

      {data && !loading && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-text-secondary">Slope</p>
              <p className="text-sm text-white font-medium">
                {data.regression.slope.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">R²</p>
              <p className="text-sm text-white font-medium">
                {data.regression.r_squared.toFixed(3)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Data Points</p>
              <p className="text-sm text-white font-medium">
                {data.regression.data_points}
              </p>
            </div>
          </div>

          {/* Simple text-based chart representation */}
          {data.trend.length > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center gap-4 text-xs text-text-secondary">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-blue-400 inline-block" /> Actual
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-green-400 inline-block" /> Trend Line
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-yellow-400 inline-block" /> Moving Avg
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {data.trend.map((point, i) => {
                  const tl = data.regression.trend_line[i];
                  const ma = data.regression.moving_average[i];
                  const maxVal = Math.max(
                    point.count,
                    tl?.value ?? 0,
                    ma?.value ?? 0,
                    1
                  );
                  return (
                    <div key={point.date} className="flex items-center gap-2 text-xs">
                      <span className="text-text-secondary w-20 shrink-0">
                        {point.date}
                      </span>
                      <div className="flex-1 flex gap-0.5 h-3">
                        <div
                          className="bg-blue-400 rounded-sm"
                          style={{ width: `${(point.count / maxVal) * 100}%` }}
                          title={`Actual: ${point.count}`}
                        />
                      </div>
                      <span className="text-text-secondary w-8 text-right">
                        {point.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-center text-text-secondary text-sm py-4">
              No data points for selected period.
            </p>
          )}
        </>
      )}
    </div>
  );
}
