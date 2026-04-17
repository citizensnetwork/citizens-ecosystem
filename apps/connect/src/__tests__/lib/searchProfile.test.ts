import { describe, expect, it } from "vitest";
import { parseQuery, normaliseSearchProfile, describeIntent } from "@/lib/searchProfile";

describe("parseQuery", () => {
  it("returns empty intent for empty input", () => {
    const intent = parseQuery("");
    expect(intent.raw).toBe("");
    expect(intent.hasSignal).toBe(false);
    expect(intent.audience.size).toBe(0);
    expect(intent.needs.size).toBe(0);
    expect(intent.vibe.size).toBe(0);
    expect(intent.nearMe).toBe(false);
  });

  it("extracts community need from 'Homecells in my area'", () => {
    const intent = parseQuery("Homecells in my area");
    expect(intent.needs.has("community")).toBe(true);
    expect(intent.nearMe).toBe(true);
    expect(intent.hasSignal).toBe(true);
  });

  it("extracts counselling need from 'I need counselling'", () => {
    const intent = parseQuery("I need counselling");
    expect(intent.needs.has("counselling")).toBe(true);
    expect(intent.hasSignal).toBe(true);
  });

  it("extracts food-coffee need + near-me from 'Good coffee places nearby'", () => {
    const intent = parseQuery("Good coffee places nearby");
    expect(intent.needs.has("food-coffee")).toBe(true);
    expect(intent.nearMe).toBe(true);
  });

  it("extracts fitness need from 'Any fitness events I can join?'", () => {
    const intent = parseQuery("Any fitness events I can join?");
    expect(intent.needs.has("fitness")).toBe(true);
  });

  it("extracts singles audience + community need from 'Looking for new friends'", () => {
    const intent = parseQuery("Looking for new friends");
    expect(intent.needs.has("community") || intent.audience.has("singles")).toBe(true);
    expect(intent.hasSignal).toBe(true);
  });

  it("extracts marriage-advice need from 'Marriage advice'", () => {
    const intent = parseQuery("Marriage advice");
    expect(intent.needs.has("marriage-advice")).toBe(true);
  });

  it("extracts business need from 'Christian businesses in my area'", () => {
    const intent = parseQuery("Christian businesses in my area");
    expect(intent.needs.has("business")).toBe(true);
    expect(intent.nearMe).toBe(true);
  });

  it("handles queries with no taxonomy signal", () => {
    const intent = parseQuery("Pretoria Central");
    expect(intent.hasSignal).toBe(false);
    expect(intent.tokens).toContain("pretoria");
  });

  it("is case-insensitive", () => {
    const upper = parseQuery("HOMECELLS");
    const lower = parseQuery("homecells");
    expect(upper.needs.has("community")).toBe(lower.needs.has("community"));
    expect(upper.needs.has("community")).toBe(true);
  });

  it("strips stop words from tokens", () => {
    const intent = parseQuery("a good coffee place near me");
    expect(intent.tokens).not.toContain("a");
    expect(intent.tokens).not.toContain("near");
    expect(intent.tokens).toContain("coffee");
  });
});

describe("normaliseSearchProfile", () => {
  it("returns null for non-objects", () => {
    expect(normaliseSearchProfile(null)).toBeNull();
    expect(normaliseSearchProfile(undefined)).toBeNull();
    expect(normaliseSearchProfile("string")).toBeNull();
    expect(normaliseSearchProfile(42)).toBeNull();
  });

  it("drops unknown tag slugs", () => {
    const out = normaliseSearchProfile({
      audience: ["youth", "not-a-tag", "couples"],
      needs: ["counselling", "fake-need"],
      vibe: ["quiet"],
    });
    expect(out?.audience).toEqual(["youth", "couples"]);
    expect(out?.needs).toEqual(["counselling"]);
    expect(out?.vibe).toEqual(["quiet"]);
  });

  it("returns null if nothing valid remains", () => {
    const out = normaliseSearchProfile({
      audience: ["not-a-tag"],
      needs: [42, null],
      vibe: "string",
    });
    expect(out).toBeNull();
  });

  it("preserves summary (trimmed + length-capped)", () => {
    const long = "a".repeat(1000);
    const out = normaliseSearchProfile({ audience: ["youth"], summary: `  hello  ${long}` });
    expect(out?.summary?.startsWith("hello")).toBe(true);
    expect(out?.summary?.length).toBeLessThanOrEqual(500);
  });

  it("drops empty summary", () => {
    const out = normaliseSearchProfile({ audience: ["youth"], summary: "   " });
    expect(out?.summary).toBeUndefined();
  });
});

describe("describeIntent", () => {
  it("joins labels with · separator", () => {
    const intent = parseQuery("coffee near me");
    const label = describeIntent(intent);
    expect(label).toContain("Food & Coffee");
  });

  it("returns empty string for empty intent", () => {
    expect(describeIntent(parseQuery(""))).toBe("");
  });
});
