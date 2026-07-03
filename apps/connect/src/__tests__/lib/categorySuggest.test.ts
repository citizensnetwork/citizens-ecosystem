import { describe, it, expect } from "vitest";
import { suggestCategory } from "@/lib/categorySuggest";

describe("suggestCategory", () => {
  it("returns null for empty input", () => {
    expect(suggestCategory()).toBe(null);
    expect(suggestCategory("", null, undefined)).toBe(null);
    expect(suggestCategory("   ")).toBe(null);
  });

  it("suggests 'care-recovery' for counseling / mental-health / restorative content", () => {
    expect(suggestCategory("Bereavement support group")).toBe("care-recovery");
    expect(suggestCategory("Mental health therapy session")).toBe("care-recovery");
    expect(suggestCategory("Pastoral care and soul care wellbeing day")).toBe("care-recovery");
  });

  it("suggests 'church-services' for service / worship content", () => {
    expect(suggestCategory("Sunday morning service with communion")).toBe("church-services");
  });

  it("suggests 'marriage-family' for marriage retreats (longer keywords win ties)", () => {
    expect(suggestCategory("Marriage retreat for couples")).toBe("marriage-family");
  });

  it("suggests 'kids' for children content", () => {
    expect(suggestCategory("Kids Sunday school VBS week")).toBe("kids");
  });

  it("suggests 'education-equipping' for workshops / bible study", () => {
    expect(suggestCategory("Bible study workshop on Romans")).toBe("education-equipping");
  });

  it("suggests 'sport-recreation' for sport events", () => {
    expect(suggestCategory("Saturday morning parkrun 5k")).toBe("sport-recreation");
  });

  it("case insensitive", () => {
    expect(suggestCategory("MARRIAGE RETREAT FOR COUPLES")).toBe("marriage-family");
    expect(suggestCategory("MaRrIaGe ReTrEaT for couples")).toBe("marriage-family");
  });

  it("combines multiple parts (title + description + location)", () => {
    expect(
      suggestCategory("Quiet day", "Time for rest and wholeness", "Wellbeing centre"),
    ).toBe("care-recovery");
  });

  it("returns null when nothing matches", () => {
    expect(suggestCategory("zzz unrelated xyz")).toBe(null);
  });
});
