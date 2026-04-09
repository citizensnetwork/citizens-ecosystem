import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock Recharts to avoid SVG rendering complexity in jsdom
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Legend: () => <div />,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie">{children}</div>
  ),
  Cell: () => <div data-testid="cell" />,
}));

import { TrendChart } from "@/components/dashboard/TrendChart";
import { DepartmentBarChart } from "@/components/dashboard/DepartmentBarChart";
import { TypePieChart } from "@/components/dashboard/TypePieChart";

describe("TrendChart", () => {
  it("shows empty state when no data", () => {
    render(<TrendChart data={[]} />);
    expect(
      screen.getByText("No trend data available for this period.")
    ).toBeInTheDocument();
  });

  it("renders chart with data", () => {
    render(
      <TrendChart
        data={[{ date: "2026-01-01", count: 5, participants: 10 }]}
      />
    );
    expect(
      screen.getByText("Activity Volume Over Time")
    ).toBeInTheDocument();
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
  });

  it("renders heading correctly", () => {
    render(
      <TrendChart
        data={[{ date: "2026-01-01", count: 1, participants: 2 }]}
      />
    );
    expect(
      screen.getByText("Activity Volume Over Time")
    ).toBeInTheDocument();
  });

  it("accepts custom height prop", () => {
    render(
      <TrendChart
        data={[{ date: "2026-01-01", count: 1, participants: 2 }]}
        height={400}
      />
    );
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
  });

  it("renders with multiple data points", () => {
    render(
      <TrendChart
        data={[
          { date: "2026-01-01", count: 5, participants: 10 },
          { date: "2026-01-02", count: 8, participants: 15 },
          { date: "2026-01-03", count: 3, participants: 6 },
        ]}
      />
    );
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
  });
});

describe("DepartmentBarChart", () => {
  it("shows empty state when no data", () => {
    render(<DepartmentBarChart data={[]} />);
    expect(
      screen.getByText("No department data available.")
    ).toBeInTheDocument();
  });

  it("renders chart with data", () => {
    render(
      <DepartmentBarChart
        data={[
          {
            department_id: "d1",
            department_name: "Engineering",
            activity_count: 10,
            participant_reach: 50,
            type_diversity: 3,
            rank_by_volume: 1,
          },
        ]}
      />
    );
    expect(screen.getByText("Department Comparison")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("truncates long department names", () => {
    render(
      <DepartmentBarChart
        data={[
          {
            department_id: "d1",
            department_name: "Very Long Department Name That Exceeds Limit",
            activity_count: 5,
            participant_reach: 20,
            type_diversity: 2,
            rank_by_volume: 1,
          },
        ]}
      />
    );
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });
});

describe("TypePieChart", () => {
  it("shows empty state when no data", () => {
    render(<TypePieChart data={[]} />);
    expect(
      screen.getByText("No type data available.")
    ).toBeInTheDocument();
  });

  it("renders chart with data", () => {
    render(
      <TypePieChart
        data={[
          { type: "event", count: 10 },
          { type: "meeting", count: 5 },
        ]}
      />
    );
    expect(
      screen.getByText("Activity Type Distribution")
    ).toBeInTheDocument();
    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
  });
});
