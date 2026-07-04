import { describe, it, expect } from "vitest";
import {
  computeLinearRegression,
  computeMovingAverage,
  computeChangePct,
  generateCSV,
  getTrendDirection,
  getTrendColour,
} from "@/lib/metrics/analytics";

describe("computeLinearRegression", () => {
  it("returns zeros for empty data", () => {
    const result = computeLinearRegression([]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
    expect(result.r_squared).toBe(0);
    expect(result.trend_line).toEqual([]);
  });

  it("returns zeros for single data point", () => {
    const result = computeLinearRegression([
      { date: "2026-01-01", count: 5, participants: 10 },
    ]);
    expect(result.slope).toBe(0);
    expect(result.trend_line).toHaveLength(1);
  });

  it("computes positive slope for increasing data", () => {
    const data = [
      { date: "2026-01-01", count: 1, participants: 2 },
      { date: "2026-01-02", count: 2, participants: 4 },
      { date: "2026-01-03", count: 3, participants: 6 },
      { date: "2026-01-04", count: 4, participants: 8 },
      { date: "2026-01-05", count: 5, participants: 10 },
    ];
    const result = computeLinearRegression(data);
    expect(result.slope).toBeGreaterThan(0);
    expect(result.r_squared).toBeCloseTo(1, 1);
    expect(result.trend_line).toHaveLength(5);
  });

  it("computes negative slope for decreasing data", () => {
    const data = [
      { date: "2026-01-01", count: 5, participants: 10 },
      { date: "2026-01-02", count: 4, participants: 8 },
      { date: "2026-01-03", count: 3, participants: 6 },
    ];
    const result = computeLinearRegression(data);
    expect(result.slope).toBeLessThan(0);
  });

  it("handles flat data", () => {
    const data = [
      { date: "2026-01-01", count: 3, participants: 6 },
      { date: "2026-01-02", count: 3, participants: 6 },
      { date: "2026-01-03", count: 3, participants: 6 },
    ];
    const result = computeLinearRegression(data);
    expect(result.slope).toBe(0);
  });
});

describe("computeMovingAverage", () => {
  it("returns empty for empty data", () => {
    expect(computeMovingAverage([])).toEqual([]);
  });

  it("computes moving average with default window", () => {
    const data = [
      { date: "2026-01-01", count: 1, participants: 0 },
      { date: "2026-01-02", count: 2, participants: 0 },
      { date: "2026-01-03", count: 3, participants: 0 },
      { date: "2026-01-04", count: 4, participants: 0 },
      { date: "2026-01-05", count: 5, participants: 0 },
    ];
    const result = computeMovingAverage(data, 3);
    expect(result).toHaveLength(5);
    // Middle point should be average of 2, 3, 4
    expect(result[2].value).toBeCloseTo(3, 0);
  });

  it("handles single data point", () => {
    const data = [{ date: "2026-01-01", count: 10, participants: 0 }];
    const result = computeMovingAverage(data, 3);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(10);
  });
});

describe("computeChangePct", () => {
  it("returns 0 for both zeros", () => {
    expect(computeChangePct(0, 0)).toBe(0);
  });

  it("returns 100 for zero to positive", () => {
    expect(computeChangePct(0, 5)).toBe(100);
  });

  it("returns positive for increase", () => {
    expect(computeChangePct(10, 20)).toBe(100);
  });

  it("returns negative for decrease", () => {
    expect(computeChangePct(20, 10)).toBe(-50);
  });

  it("returns 0 for no change", () => {
    expect(computeChangePct(10, 10)).toBe(0);
  });
});

describe("generateCSV", () => {
  it("generates header only for empty data", () => {
    const csv = generateCSV([], [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
    ]);
    expect(csv).toBe("Name,Value");
  });

  it("generates rows correctly", () => {
    const csv = generateCSV(
      [
        { name: "Alice", value: 42 },
        { name: "Bob", value: 17 },
      ],
      [
        { key: "name", label: "Name" },
        { key: "value", label: "Value" },
      ]
    );
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Name,Value");
    expect(lines[1]).toBe("Alice,42");
    expect(lines[2]).toBe("Bob,17");
  });

  it("escapes values with commas", () => {
    const csv = generateCSV(
      [{ name: "Smith, John", value: 1 }],
      [
        { key: "name", label: "Name" },
        { key: "value", label: "Value" },
      ]
    );
    expect(csv).toContain('"Smith, John"');
  });

  it("escapes values with quotes", () => {
    const csv = generateCSV(
      [{ name: 'Say "hello"', value: 1 }],
      [
        { key: "name", label: "Name" },
        { key: "value", label: "Value" },
      ]
    );
    expect(csv).toContain('"Say ""hello"""');
  });
});

describe("getTrendDirection", () => {
  it("returns increasing for positive slope", () => {
    expect(getTrendDirection(1.0)).toBe("increasing");
  });

  it("returns decreasing for negative slope", () => {
    expect(getTrendDirection(-1.0)).toBe("decreasing");
  });

  it("returns stable for near-zero slope", () => {
    expect(getTrendDirection(0.1)).toBe("stable");
    expect(getTrendDirection(-0.3)).toBe("stable");
  });
});

describe("getTrendColour", () => {
  it("returns green for increasing", () => {
    expect(getTrendColour("increasing")).toBe("#6bcf7f");
  });

  it("returns red for decreasing", () => {
    expect(getTrendColour("decreasing")).toBe("#ef4444");
  });

  it("returns grey for stable", () => {
    expect(getTrendColour("stable")).toBe("#abb2bf");
  });
});
