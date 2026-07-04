import { describe, it, expect } from "vitest";
import { EASTER_EGGS } from "@/lib/easterEggs/registry";
import type { PreferenceTag } from "@/types/db";

const NOW = "2026-04-18T12:00:00Z";
const PAST = "2026-01-01T00:00:00Z";
const FUTURE = "2027-01-01T00:00:00Z";

function baseCtx(overrides: Partial<Parameters<(typeof EASTER_EGGS)[number]["shouldFire"]>[0]> = {}) {
  return {
    mapEntryCount: 0,
    tappedEventCategories: new Set<string>(),
    hasLeadershipInterest: false,
    contributorActionAttempted: false,
    nowIso: NOW,
    accountCreatedAtIso: PAST,
    ...overrides,
  };
}

function egg(id: string) {
  const e = EASTER_EGGS.find((x) => x.id === id);
  if (!e) throw new Error(`no egg ${id}`);
  return e;
}

describe("EASTER_EGGS registry", () => {
  it("WYR: fires on the first ever map entry when no answer recorded", () => {
    expect(egg("wyr_pool").shouldFire(baseCtx({ mapEntryCount: 1 }), undefined)).toBe(true);
  });

  it("WYR: does not fire on the first entry if an answer already exists", () => {
    const existing: PreferenceTag = {
      value: "ok",
      answered_at: PAST,
      expires_at: FUTURE,
    };
    expect(egg("wyr_pool").shouldFire(baseCtx({ mapEntryCount: 1 }), existing)).toBe(false);
  });

  it("WYR: re-surfaces on every second subsequent entry when the tag has expired", () => {
    const expired: PreferenceTag = {
      value: "ok",
      answered_at: PAST,
      expires_at: PAST,
    };
    expect(egg("wyr_pool").shouldFire(baseCtx({ mapEntryCount: 2 }), expired)).toBe(true);
    expect(egg("wyr_pool").shouldFire(baseCtx({ mapEntryCount: 3 }), expired)).toBe(false);
    expect(egg("wyr_pool").shouldFire(baseCtx({ mapEntryCount: 4 }), expired)).toBe(true);
  });

  it("gender: only fires after the user taps a gender-specific category", () => {
    expect(egg("gender").shouldFire(baseCtx(), undefined)).toBe(false);
    expect(
      egg("gender").shouldFire(
        baseCtx({ tappedEventCategories: new Set(["mens-community"]) }),
        undefined
      )
    ).toBe(true);
  });

  it("gender: never re-asks once answered (lifetime tag)", () => {
    const answered: PreferenceTag = {
      value: "female",
      answered_at: PAST,
      expires_at: null, // lifetime
    };
    expect(
      egg("gender").shouldFire(
        baseCtx({ tappedEventCategories: new Set(["mens-community"]) }),
        answered
      )
    ).toBe(false);
  });

  it("relationship_stance: fires on first couples-category tap, respects expiry", () => {
    const e = egg("relationship_stance");
    expect(
      e.shouldFire(
        baseCtx({ tappedEventCategories: new Set(["marriage-family"]) }),
        undefined
      )
    ).toBe(true);

    const future: PreferenceTag = {
      value: "single",
      answered_at: PAST,
      expires_at: FUTURE,
    };
    expect(
      e.shouldFire(
        baseCtx({ tappedEventCategories: new Set(["marriage-family"]) }),
        future
      )
    ).toBe(false);
  });

  it("leadership_interest: only fires after a contributor action attempt", () => {
    const e = egg("leadership_interest");
    expect(e.shouldFire(baseCtx(), undefined)).toBe(false);
    expect(
      e.shouldFire(baseCtx({ contributorActionAttempted: true }), undefined)
    ).toBe(true);
    // Already opted-in users should never see it again.
    expect(
      e.shouldFire(
        baseCtx({ contributorActionAttempted: true, hasLeadershipInterest: true }),
        undefined
      )
    ).toBe(false);
  });

  it("love_language / stage_of_life / time_availability: map-entry thresholds", () => {
    expect(egg("love_language").shouldFire(baseCtx({ mapEntryCount: 3 }), undefined)).toBe(false);
    expect(egg("love_language").shouldFire(baseCtx({ mapEntryCount: 4 }), undefined)).toBe(true);

    expect(egg("stage_of_life").shouldFire(baseCtx({ mapEntryCount: 2 }), undefined)).toBe(false);
    expect(egg("stage_of_life").shouldFire(baseCtx({ mapEntryCount: 3 }), undefined)).toBe(true);

    expect(egg("time_availability").shouldFire(baseCtx({ mapEntryCount: 4 }), undefined)).toBe(false);
    expect(egg("time_availability").shouldFire(baseCtx({ mapEntryCount: 5 }), undefined)).toBe(true);
  });

  it("WYR: honours an active cooldown tag and does NOT fire on the first entry", () => {
    // Simulates "user dismissed the quiz → 48h soft-skip written".
    const cooldown: PreferenceTag = {
      value: "skipped",
      answered_at: PAST,
      expires_at: FUTURE,
    };
    expect(egg("wyr_pool").shouldFire(baseCtx({ mapEntryCount: 1 }), cooldown)).toBe(false);
    expect(egg("wyr_pool").shouldFire(baseCtx({ mapEntryCount: 2 }), cooldown)).toBe(false);
    expect(egg("wyr_pool").shouldFire(baseCtx({ mapEntryCount: 4 }), cooldown)).toBe(false);
  });
});
