import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "@/components/dashboard/MetricCard";

describe("MetricCard", () => {
  it("renders label and value", () => {
    render(<MetricCard label="Total Activities" value={42} />);
    expect(screen.getByText("Total Activities")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("formats large numbers", () => {
    render(<MetricCard label="Participants" value={15000} />);
    expect(screen.getByText("15.0K")).toBeInTheDocument();
  });

  it("shows positive growth indicator", () => {
    render(<MetricCard label="Growth" value={100} growthPct={25.3} />);
    expect(screen.getByText("+25.3%")).toBeInTheDocument();
    expect(screen.getByLabelText("+25.3% growth")).toBeInTheDocument();
  });

  it("shows negative growth indicator", () => {
    render(<MetricCard label="Decline" value={50} growthPct={-12.5} />);
    expect(screen.getByText("-12.5%")).toBeInTheDocument();
  });

  it("shows neutral growth for zero", () => {
    render(<MetricCard label="Flat" value={100} growthPct={0} />);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
  });

  it("renders suffix when provided", () => {
    render(<MetricCard label="Growth Rate" value={25} suffix="%" />);
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("hides growth when not provided", () => {
    render(<MetricCard label="Count" value={10} />);
    expect(screen.queryByText("%")).not.toBeInTheDocument();
  });
});
