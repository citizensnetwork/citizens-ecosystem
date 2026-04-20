import { describe, it, expect } from "vitest";
import { computeInterestPercentages } from "@/lib/personalization/percentages";

describe("computeInterestPercentages", () => {
  it("returns {} for a user with no signals", () => {
    expect(computeInterestPercentages({})).toEqual({});
  });

  it("weights user_interests at +30 per category", () => {
    const out = computeInterestPercentages({
      interestCategories: ["church", "mens"],
    });
    // 30 each — both under 60 so both get stretched to max=75 via rebucket.
    expect(out.church).toBe(75);
    expect(out.mens).toBe(75);
  });

  it("weights WYR answer +10 per matching category", () => {
    const out = computeInterestPercentages({
      preferences: {
        wyr: { crowd_size: "left" }, // left → entertainment + social-fun
      },
    });
    // 10 < 60 so stretched.  Both categories should be non-zero and equal.
    expect(out.entertainment).toBeDefined();
    expect(out.entertainment).toBe(out["social-fun"]);
  });

  it("weights gender at +20 for gendered events", () => {
    const male = computeInterestPercentages({ gender: "male" });
    const female = computeInterestPercentages({ gender: "female" });
    expect(male.mens).toBeGreaterThan(0);
    expect(male.womens).toBeUndefined();
    expect(female.womens).toBeGreaterThan(0);
    expect(female.mens).toBeUndefined();
  });

  it("weights relationship_status 'married' toward marriage-and-couples", () => {
    const out = computeInterestPercentages({ relationship_status: "married" });
    expect(out["marriage-and-couples"]).toBeGreaterThan(0);
  });

  it("applies love_language tag to category weights", () => {
    const out = computeInterestPercentages({
      preferences: {
        tags: {
          love_language: {
            value: "service",
            answered_at: "2026-04-18T00:00:00Z",
            expires_at: null,
          },
        },
      },
    });
    // service → community-upliftment + missional, +15 each.
    expect(out["community-upliftment"]).toBeGreaterThan(0);
    expect(out.missional).toBeGreaterThan(0);
  });

  it("clamps and rebuckets so the max is at least 75 when signals are weak", () => {
    const out = computeInterestPercentages({ gender: "male" }); // 20 raw
    // 20 < 60 → stretched to max=75.
    expect(out.mens).toBe(75);
  });

  it("preserves strong signals above the 60 threshold without stretching", () => {
    // user_interests:30×2 + gender:20 = 80 → no stretch.
    const out = computeInterestPercentages({
      gender: "male",
      interestCategories: ["mens", "mens"],
    });
    expect(out.mens).toBe(80);
  });

  it("ignores unknown tag keys", () => {
    const out = computeInterestPercentages({
      preferences: {
        tags: {
          unknown_tag: {
            value: "anything",
            answered_at: "2026-04-18T00:00:00Z",
            expires_at: null,
          },
        },
      },
    });
    expect(out).toEqual({});
  });
});
