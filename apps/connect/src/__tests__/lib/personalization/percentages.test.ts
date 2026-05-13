import { describe, it, expect } from "vitest";
import { computeInterestPercentages } from "@/lib/personalization/percentages";

describe("computeInterestPercentages", () => {
  it("returns {} for a user with no signals", () => {
    expect(computeInterestPercentages({})).toEqual({});
  });

  it("weights user_interests at +30 per category", () => {
    const out = computeInterestPercentages({
      interestCategories: ["church-services", "mens-community"],
    });
    // 30 each — both under 60 so both get stretched to max=75 via rebucket.
    expect(out["church-services"]).toBe(75);
    expect(out["mens-community"]).toBe(75);
  });

  it("weights WYR answer +10 per matching category", () => {
    const out = computeInterestPercentages({
      preferences: {
        wyr: { crowd_size: "left" }, // left → arts-culture + social-gatherings
      },
    });
    // 10 < 60 so stretched.  Both categories should be non-zero and equal.
    expect(out["arts-culture"]).toBeDefined();
    expect(out["arts-culture"]).toBe(out["social-gatherings"]);
  });

  it("weights gender at +20 for gendered events", () => {
    const male = computeInterestPercentages({ gender: "male" });
    const female = computeInterestPercentages({ gender: "female" });
    expect(male["mens-community"]).toBeGreaterThan(0);
    expect(male["womens-community"]).toBeUndefined();
    expect(female["womens-community"]).toBeGreaterThan(0);
    expect(female["mens-community"]).toBeUndefined();
  });

  it("weights relationship_status 'married' toward marriage-family", () => {
    const out = computeInterestPercentages({ relationship_status: "married" });
    expect(out["marriage-family"]).toBeGreaterThan(0);
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
    // service → community-upliftment + outreach-missions, +15 each.
    expect(out["community-upliftment"]).toBeGreaterThan(0);
    expect(out["outreach-missions"]).toBeGreaterThan(0);
  });

  it("clamps and rebuckets so the max is at least 75 when signals are weak", () => {
    const out = computeInterestPercentages({ gender: "male" }); // 20 raw
    // 20 < 60 → stretched to max=75.
    expect(out["mens-community"]).toBe(75);
  });

  it("preserves strong signals above the 60 threshold without stretching", () => {
    // user_interests:30×2 + gender:20 = 80 → no stretch.
    const out = computeInterestPercentages({
      gender: "male",
      interestCategories: ["mens-community", "mens-community"],
    });
    expect(out["mens-community"]).toBe(80);
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

  /**
   * Regression pin for the S1 → S3 transition. `time_availability: 'weekends'`
   * currently maps to `conferences-summits` because the legacy `weekend`
   * category was removed in migration 064. When S3 ships the derived
   * weekend tag (`src/lib/weekendTag.ts`), this test MUST fail loudly so
   * the migration to the new `{ weekendOnly: true }` API is not skipped.
   * See TODO in src/lib/personalization/percentages.ts.
   */
  it("S1 stopgap: weekends time_availability maps to conferences-summits", () => {
    const out = computeInterestPercentages({
      preferences: {
        tags: {
          time_availability: {
            value: "weekends",
            answered_at: "2026-04-18T00:00:00Z",
            expires_at: null,
          },
        },
      },
    });
    expect(out["conferences-summits"]).toBeGreaterThan(0);
  });
});
