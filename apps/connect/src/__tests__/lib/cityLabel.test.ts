import { describe, it, expect } from "vitest";
import { getCityLabel } from "@/lib/cityLabel";

describe("getCityLabel", () => {
  it("matches Pretoria text", () => {
    expect(getCityLabel("Centurion, Pretoria", null, null)).toBe("PTA");
  });

  it("matches alias 'JHB'", () => {
    expect(getCityLabel("Sandton, JHB", null, null)).toBe("JHB");
  });

  it("matches Cape Town text (multi-word)", () => {
    expect(getCityLabel("Sea Point, Cape Town", null, null)).toBe("CT");
  });

  it("falls back to radius match when text lacks city", () => {
    // ~Pretoria centre coords
    expect(getCityLabel("Some venue", -25.7479, 28.2293)).toBe("PTA");
  });

  it("returns null when text has no city and coords are far from known cities", () => {
    expect(getCityLabel("Unknown place", -33.0, 22.0)).toBe(null);
  });

  it("returns null when both inputs missing", () => {
    expect(getCityLabel(null, null, null)).toBe(null);
  });

  it("does not match short codes embedded in other words", () => {
    // "Capetown" without space should NOT match "CT" alias (padded boundary)
    expect(getCityLabel("Capricorn Park", null, null)).toBe(null);
  });

  it("resolves bare 'Stellenbosch' to STB (not CT)", () => {
    expect(getCityLabel("Stellenbosch", null, null)).toBe("STB");
  });

  it("resolves 'Centurion' to PTA", () => {
    expect(getCityLabel("Centurion Mall", null, null)).toBe("PTA");
  });

  it("resolves 'Sandton' to JHB", () => {
    expect(getCityLabel("Sandton City", null, null)).toBe("JHB");
  });

  it("text wins over coordinates when they disagree", () => {
    // Text says Pretoria, coords are Cape Town centre — text should win.
    expect(getCityLabel("Pretoria CBD", -33.9249, 18.4241)).toBe("PTA");
  });
});
