"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import { CHART_COLOURS } from "@/lib/metrics/utils";

interface TypePieChartProps {
  data: Array<{ type: string; count: number }>;
  height?: number;
}

export function TypePieChart({ data, height = 300 }: TypePieChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-border bg-surface p-8 text-sm text-text-secondary"
        style={{ height }}
      >
        No type data available.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: ACTIVITY_TYPE_LABELS[d.type] ?? d.type,
    value: d.count,
    type: d.type,
  }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4" role="img" aria-label="Activity type distribution chart">
      <h3 className="mb-3 text-sm font-medium text-text-primary">
        Activity Type Distribution
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.type}
                fill={CHART_COLOURS[entry.type] ?? "#abb2bf"}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#242438",
              border: "1px solid #3a3a52",
              borderRadius: "6px",
              fontSize: 12,
            }}
            itemStyle={{ color: "#a0a0b4" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#a0a0b4" }}
            formatter={(value: string) => (
              <span style={{ color: "#a0a0b4" }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
