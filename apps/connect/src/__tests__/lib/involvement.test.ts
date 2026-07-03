import { describe, it, expect } from "vitest";
import {
  computeInvolvementLevel,
  involvementScore,
  INVOLVEMENT_COLORS,
} from "@/lib/contributors/involvement";

describe("involvement proxy", () => {
  it("gives a brand-new contributor the honest entry tier (Seed)", () => {
    expect(computeInvolvementLevel({ followers: 0, events: 0, places: 0, teamSize: 0 })).toBe(
      "Seed",
    );
    // A tiny presence is still Seed — never hidden, never negative.
    expect(computeInvolvementLevel({ followers: 5, events: 1, places: 0, teamSize: 0 })).toBe(
      "Seed",
    );
  });

  it("rises with real activity (events/places weighted over raw followers)", () => {
    // 4 events => 20 → Shepherd, even with no followers.
    expect(computeInvolvementLevel({ followers: 0, events: 4, places: 0, teamSize: 0 })).toBe(
      "Shepherd",
    );
    // Pillar threshold (>=80).
    expect(
      computeInvolvementLevel({ followers: 30, events: 8, places: 2, teamSize: 0 }),
    ).toBe("Pillar");
    // Beacon threshold (>=250).
    expect(
      computeInvolvementLevel({ followers: 120, events: 20, places: 4, teamSize: 4 }),
    ).toBe("Beacon");
  });

  it("weights events and places 5x and team 3x over followers", () => {
    expect(involvementScore({ followers: 10, events: 2, places: 1, teamSize: 1 })).toBe(
      10 + 2 * 5 + 1 * 5 + 1 * 3,
    );
  });

  it("clamps negative inputs to zero", () => {
    expect(involvementScore({ followers: -100, events: -5, places: -5, teamSize: -5 })).toBe(0);
  });

  it("exposes a colour for every tier", () => {
    expect(Object.keys(INVOLVEMENT_COLORS).sort()).toEqual(
      ["Beacon", "Pillar", "Seed", "Shepherd"].sort(),
    );
  });
});
