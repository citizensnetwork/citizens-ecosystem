import { describe, it, expect } from "vitest";
import {
  getDefaultDateRange,
  formatMetricValue,
  getTrendDirection,
  formatGrowthPct,
  fillTrendGaps,
  computeTypeDistribution,
  autoGranularity,
  CHART_COLOURS,
} from "@/lib/metrics/utils";

describe("getDefaultDateRange", () => {
  it("returns from and to strings", () => {
    const range = getDefaultDateRange();
    expect(range.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("from is before to", () => {
    const range = getDefaultDateRange();
    expect(new Date(range.from).getTime()).toBeLessThan(
      new Date(range.to).getTime()
    );
  });
});

describe("formatMetricValue", () => {
  it("formats small numbers with locale", () => {
    expect(formatMetricValue(42)).toBe("42");
  });

  it("formats thousands with K suffix", () => {
    expect(formatMetricValue(15_000)).toBe("15.0K");
  });

  it("formats millions with M suffix", () => {
    expect(formatMetricValue(2_500_000)).toBe("2.5M");
  });

  it("formats numbers under 10K with locale separator", () => {
    const result = formatMetricValue(5_432);
    // en-ZA uses space or non-breaking space as thousands separator
    expect(result).toContain("5");
    expect(result).toContain("432");
  });
});

describe("getTrendDirection", () => {
  it("returns up for positive growth", () => {
    expect(getTrendDirection(15.5)).toBe("up");
  });

  it("returns down for negative growth", () => {
    expect(getTrendDirection(-8.2)).toBe("down");
  });

  it("returns neutral for zero growth", () => {
    expect(getTrendDirection(0)).toBe("neutral");
  });
});

describe("formatGrowthPct", () => {
  it("formats positive with + prefix", () => {
    expect(formatGrowthPct(12.5)).toBe("+12.5%");
  });

  it("formats negative without + prefix", () => {
    expect(formatGrowthPct(-8.3)).toBe("-8.3%");
  });

  it("formats zero", () => {
    expect(formatGrowthPct(0)).toBe("0.0%");
  });
});

describe("fillTrendGaps", () => {
  it("fills missing days with zeros", () => {
    const data = [{ date: "2026-01-01", count: 5, participants: 10 }];
    const filled = fillTrendGaps(data, "2026-01-01", "2026-01-03", "day");
    expect(filled).toHaveLength(3);
    expect(filled[0].count).toBe(5);
    expect(filled[1].count).toBe(0);
    expect(filled[2].count).toBe(0);
  });

  it("fills by month", () => {
    const data = [{ date: "2026-01-01", count: 3, participants: 6 }];
    const filled = fillTrendGaps(data, "2026-01-01", "2026-03-01", "month");
    expect(filled).toHaveLength(3);
    expect(filled[0].count).toBe(3);
    expect(filled[1].count).toBe(0);
  });

  it("returns empty for empty data and range", () => {
    const filled = fillTrendGaps([], "2026-01-01", "2025-12-31", "day");
    expect(filled).toHaveLength(0);
  });
});

describe("computeTypeDistribution", () => {
  it("aggregates type counts", () => {
    const activities = [
      { type: "event" },
      { type: "event" },
      { type: "meeting" },
    ];
    const dist = computeTypeDistribution(activities);
    expect(dist).toHaveLength(2);
    expect(dist[0]).toEqual({ type: "event", count: 2, label: "Event" });
    expect(dist[1]).toEqual({ type: "meeting", count: 1, label: "Meeting" });
  });

  it("sorts by count descending", () => {
    const activities = [
      { type: "other" },
      { type: "training" },
      { type: "training" },
      { type: "training" },
    ];
    const dist = computeTypeDistribution(activities);
    expect(dist[0].type).toBe("training");
    expect(dist[1].type).toBe("other");
  });

  it("returns empty for empty input", () => {
    expect(computeTypeDistribution([])).toEqual([]);
  });
});

describe("autoGranularity", () => {
  it("returns day for <= 31 days", () => {
    expect(autoGranularity("2026-01-01", "2026-01-30")).toBe("day");
  });

  it("returns week for 32..180 days", () => {
    expect(autoGranularity("2026-01-01", "2026-04-01")).toBe("week");
  });

  it("returns month for > 180 days", () => {
    expect(autoGranularity("2026-01-01", "2026-12-31")).toBe("month");
  });
});

describe("CHART_COLOURS", () => {
  it("has colour for each standard activity type", () => {
    const types = ["event", "meeting", "outreach", "workshop", "service", "training", "other"];
    for (const t of types) {
      expect(CHART_COLOURS[t]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
