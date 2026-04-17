import { describe, it, expect } from "vitest";
import { suggestCategory } from "@/lib/categorySuggest";

describe("suggestCategory", () => {
  it("returns null for empty input", () => {
    expect(suggestCategory()).toBe(null);
    expect(suggestCategory("", null, undefined)).toBe(null);
    expect(suggestCategory("   ")).toBe(null);
  });

  it("suggests 'care' for counseling / mental-health / restorative content", () => {
    expect(suggestCategory("Bereavement support group")).toBe("care");
    expect(suggestCategory("Mental health therapy session")).toBe("care");
    expect(suggestCategory("Pastoral care and soul care retreat")).toBe("care");
  });

  it("suggests 'church' for service / worship content", () => {
    expect(suggestCategory("Sunday morning service with communion")).toBe("church");
  });

  it("suggests 'marriage-and-couples' for marriage retreats (longer keywords win ties)", () => {
    expect(suggestCategory("Marriage retreat weekend away")).toBe("marriage-and-couples");
  });

  it("suggests 'kids' for youth / children content", () => {
    expect(suggestCategory("Kids Sunday school VBS week")).toBe("kids");
  });

  it("suggests 'education' for workshops / bible study", () => {
    expect(suggestCategory("Bible study workshop on Romans")).toBe("education");
  });

  it("suggests 'sport-fun' for sport events", () => {
    expect(suggestCategory("Saturday morning parkrun 5k")).toBe("sport-fun");
  });

  it("case insensitive", () => {
    expect(suggestCategory("MARRIAGE RETREAT")).toBe("marriage-and-couples");
    expect(suggestCategory("MaRrIaGe ReTrEaT")).toBe("marriage-and-couples");
  });

  it("combines multiple parts (title + description + location)", () => {
    expect(
      suggestCategory("Quiet day", "Time for rest and wholeness", "Retreat centre"),
    ).toBe("care");
  });

  it("returns null when nothing matches", () => {
    expect(suggestCategory("zzz unrelated xyz")).toBe(null);
  });
});
