import { describe, it, expect } from "vitest";
import {
  inferGoalActivityLinks,
  getAlignmentColour,
  getAlignmentLabel,
} from "@/lib/metrics/alignment";

describe("inferGoalActivityLinks", () => {
  const activities = [
    {
      id: "a1",
      title: "Youth Outreach Workshop",
      description: "Teaching youth in ward 5 about community service",
      type: "workshop" as const,
    },
    {
      id: "a2",
      title: "Sunday Service",
      description: "Regular weekly service at main campus",
      type: "service" as const,
    },
    {
      id: "a3",
      title: "Community Outreach Day",
      description: "Blanket drive and food parcels for homeless",
      type: "outreach" as const,
    },
    {
      id: "a4",
      title: "Board Meeting",
      description: "Quarterly financials review",
      type: "meeting" as const,
    },
  ];

  it("matches activities by keyword overlap", () => {
    const goal = {
      id: "g1",
      title: "Expand youth outreach programs",
      description: "Increase youth engagement across all wards",
    };

    const results = inferGoalActivityLinks(goal, activities);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].activity_id).toBe("a1"); // best match: "youth outreach workshop"
  });

  it("returns empty for unrelated goal", () => {
    const goal = {
      id: "g2",
      title: "Renovate building roof",
      description: "Replace damaged roofing tiles on main campus",
    };

    const results = inferGoalActivityLinks(goal, activities, {
      threshold: 0.5,
    });
    expect(results.length).toBe(0);
  });

  it("respects threshold parameter", () => {
    const goal = {
      id: "g3",
      title: "Community service",
      description: null,
    };

    const highThreshold = inferGoalActivityLinks(goal, activities, {
      threshold: 0.8,
    });
    const lowThreshold = inferGoalActivityLinks(goal, activities, {
      threshold: 0.1,
    });
    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
  });

  it("respects maxResults parameter", () => {
    const goal = {
      id: "g4",
      title: "Community outreach service workshop",
      description: "All activities related to ministry",
    };

    const results = inferGoalActivityLinks(goal, activities, {
      maxResults: 2,
      threshold: 0.1,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("never returns confidence above 0.95", () => {
    const goal = {
      id: "g5",
      title: "Youth Outreach Workshop",
      description: "Youth Outreach Workshop exact match",
    };

    const results = inferGoalActivityLinks(goal, activities);
    for (const r of results) {
      expect(r.confidence).toBeLessThanOrEqual(0.95);
    }
  });

  it("returns empty for empty goal text", () => {
    const results = inferGoalActivityLinks(
      { id: "g6", title: "", description: null },
      activities
    );
    expect(results.length).toBe(0);
  });

  it("returns empty for empty activities array", () => {
    const results = inferGoalActivityLinks(
      { id: "g7", title: "Some goal", description: null },
      []
    );
    expect(results.length).toBe(0);
  });

  it("sorts results by confidence descending", () => {
    const goal = {
      id: "g8",
      title: "Community outreach youth service",
      description: "Focus on community and youth",
    };

    const results = inferGoalActivityLinks(goal, activities, {
      threshold: 0.1,
    });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].confidence).toBeGreaterThanOrEqual(
        results[i].confidence
      );
    }
  });

  it("includes reasons for the match", () => {
    const goal = {
      id: "g9",
      title: "Youth Outreach Workshop",
      description: null,
    };

    const results = inferGoalActivityLinks(goal, activities, {
      threshold: 0.1,
    });
    const match = results.find((r) => r.activity_id === "a1");
    expect(match).toBeDefined();
    expect(match!.reasons.length).toBeGreaterThan(0);
  });
});

describe("getAlignmentColour", () => {
  it('returns red for score < 30', () => {
    expect(getAlignmentColour(0)).toBe("#ef4444");
    expect(getAlignmentColour(29)).toBe("#ef4444");
  });

  it('returns yellow for score 30-69', () => {
    expect(getAlignmentColour(30)).toBe("#f5a623");
    expect(getAlignmentColour(69)).toBe("#f5a623");
  });

  it('returns green for score >= 70', () => {
    expect(getAlignmentColour(70)).toBe("#6bcf7f");
    expect(getAlignmentColour(100)).toBe("#6bcf7f");
  });
});

describe("getAlignmentLabel", () => {
  it('returns "Low" for score < 30', () => {
    expect(getAlignmentLabel(15)).toBe("Low");
  });

  it('returns "Moderate" for score 30-69', () => {
    expect(getAlignmentLabel(50)).toBe("Moderate");
  });

  it('returns "Strong" for score >= 70', () => {
    expect(getAlignmentLabel(85)).toBe("Strong");
  });
});
