"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TrendDataPoint } from "@/types/metrics";

interface TrendChartProps {
  data: TrendDataPoint[];
  height?: number;
}

export function TrendChart({ data, height = 300 }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-surface p-8 text-sm text-text-secondary" style={{ height }}>
        No trend data available for this period.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4" role="img" aria-label="Activity volume over time chart">
      <h3 className="mb-3 text-sm font-medium text-text-primary">
        Activity Volume Over Time
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a52" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#a0a0b4" }}
            tickFormatter={(v: string) => {
              const d = new Date(v);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#a0a0b4" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#242438",
              border: "1px solid #3a3a52",
              borderRadius: "6px",
              fontSize: 12,
            }}
            labelStyle={{ color: "#f0f0f4" }}
            itemStyle={{ color: "#a0a0b4" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#a0a0b4" }} />
          <Line
            type="monotone"
            dataKey="count"
            name="Activities"
            stroke="#4a90d9"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#4a90d9" }}
          />
          <Line
            type="monotone"
            dataKey="participants"
            name="Participants"
            stroke="#6bcf7f"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#6bcf7f" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
