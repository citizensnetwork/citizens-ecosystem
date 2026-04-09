"use client";

import {
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DepartmentMetric } from "@/types/metrics";

interface DepartmentBarChartProps {
  data: DepartmentMetric[];
  height?: number;
}

export function DepartmentBarChart({
  data,
  height = 300,
}: DepartmentBarChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-border bg-surface p-8 text-sm text-text-secondary"
        style={{ height }}
      >
        No department data available.
      </div>
    );
  }

  const chartData = data.slice(0, 10).map((d) => ({
    name:
      d.department_name.length > 15
        ? d.department_name.slice(0, 13) + "…"
        : d.department_name,
    fullName: d.department_name,
    activities: d.activity_count,
    participants: d.participant_reach,
  }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4" role="img" aria-label="Department comparison chart">
      <h3 className="mb-3 text-sm font-medium text-text-primary">
        Department Comparison
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBar
          data={chartData}
          margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a52" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#a0a0b4" }}
            angle={-30}
            textAnchor="end"
            height={60}
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
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.fullName ?? ""
            }
          />
          <Bar
            dataKey="activities"
            name="Activities"
            fill="#4a90d9"
            radius={[4, 4, 0, 0]}
          />
        </RechartsBar>
      </ResponsiveContainer>
    </div>
  );
}
