/**
 * Onboarding presets (`src/frontend/app/onboarding-presets-lib.jsx`, issue #202).
 *
 * `config/onboarding-presets.json` is the reviewed source; the browser carries a copy of the part the Apply wizard reads, and
 * this file holds the two equal. It also pins the founder's Care / Recovery rules of 2026-10-21 (extra admin review, map
 * opt-in) against the server's own list in `src/lib/categories.ts`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";
import { CONTRIBUTOR_TYPES, EXTRA_REVIEW_CONTRIBUTOR_TYPES, needsExtraReview } from "@/lib/categories";
import { CONTRIBUTOR_KINDS } from "@/types/db";

type Preset = { id?: string; label: string; kind: string; extraReview: boolean };
type Api = {
  PRESETS: Record<string, Preset>;
  CATEGORY_PRESET: Record<string, string>;
  START_KIND: string;
  presetFor: (c: unknown) => Preset | null;
  defaultKindFor: (c: unknown) => string | null;
  autoKindFor: (c: unknown) => string;
  needsExtraReview: (c: unknown) => boolean;
  keepsOffMap: (f: unknown) => boolean;
  mapRowFor: (f: unknown, hasPin: boolean) => string;
  COPY: Record<string, unknown>;
};

const json = JSON.parse(readFileSync(join(process.cwd(), "config/onboarding-presets.json"), "utf8")) as {
  presets: Record<string, { label: string; creates: Record<string, unknown>; default_kind?: string; extra_admin_review?: boolean; map_opt_in?: boolean }>;
  contributor_categories: Record<string, string>;
};

let api: Api;
beforeAll(() => {
  api = loadFrontend("onboarding-presets-lib.jsx").CCPresets as Api;
});

describe("the browser's presets equal config/onboarding-presets.json", () => {
  const contributorPresets = Object.entries(json.presets).filter(([, p]) => p.creates.contributor === true);

  it("carries every Contributor preset, with its label, default Type and extra-review flag", () => {
    expect(Object.keys(api.PRESETS).sort()).toEqual(contributorPresets.map(([id]) => id).sort());
    for (const [id, p] of contributorPresets) {
      expect(api.PRESETS[id], id).toEqual({ label: p.label, kind: p.default_kind, extraReview: p.extra_admin_review === true });
    }
  });

  it("maps the same Contributor types to the same presets", () => {
    const fromJson = Object.fromEntries(Object.entries(json.contributor_categories).filter(([key]) => key !== "status"));
    expect(api.CATEGORY_PRESET).toEqual(fromJson);
  });

  it("every default Type is one the database accepts, and every mapped type is a real Contributor type", () => {
    for (const p of Object.values(api.PRESETS)) expect(CONTRIBUTOR_KINDS).toContain(p.kind);
    const slugs = CONTRIBUTOR_TYPES.map((t) => t.value) as string[];
    for (const c of Object.keys(api.CATEGORY_PRESET)) expect(slugs).toContain(c);
  });
});

describe("Care / Recovery: extra admin review, one list everywhere (founder decision 2026-10-21)", () => {
  it("the server's list is exactly the care_recovery preset's categories", () => {
    const careInJson = Object.entries(json.contributor_categories).filter(([, id]) => id === "care_recovery").map(([c]) => c);
    expect([...EXTRA_REVIEW_CONTRIBUTOR_TYPES].sort()).toEqual(careInJson.sort());
    expect(json.presets.care_recovery.extra_admin_review).toBe(true);
    expect(json.presets.care_recovery.map_opt_in).toBe(true);
  });

  it("the browser and the server agree on which types need extra review", () => {
    for (const t of CONTRIBUTOR_TYPES) expect(api.needsExtraReview(t.value), t.value).toBe(needsExtraReview(t.value));
    expect(api.needsExtraReview("clinic")).toBe(true);
    expect(api.needsExtraReview("churches-ministries")).toBe(false);
  });

  it("no other preset asks for extra review (child-facing Education is still open)", () => {
    for (const [id, p] of Object.entries(api.PRESETS)) expect(p.extraReview, id).toBe(id === "care_recovery");
  });
});

describe("the helpers the wizard calls", () => {
  it("offers a default Type for a mapped category and nothing for an unmapped, unknown or inherited one", () => {
    expect(api.defaultKindFor("christian-businesses")).toBe("business");
    expect(api.defaultKindFor("churches-ministries")).toBe("ministry");
    for (const c of ["markets-expos", "sport-recreation", "social-gatherings", "worship-prayer", "", null, undefined, "constructor", "__proto__"]) {
      expect(api.presetFor(c), String(c)).toBeNull();
      expect(api.defaultKindFor(c), String(c)).toBeNull();
    }
  });

  it("keeps a Care / Recovery applicant off the map until they turn it on; nobody else is affected", () => {
    expect(api.keepsOffMap({ category: "retreat-healing", showOnMap: false })).toBe(true);
    expect(api.keepsOffMap({ category: "clinic" })).toBe(true);
    expect(api.keepsOffMap({ category: "clinic", showOnMap: "yes" })).toBe(true);
    expect(api.keepsOffMap({ category: "clinic", showOnMap: true })).toBe(false);
    expect(api.keepsOffMap({ category: "churches-ministries", showOnMap: false })).toBe(false);
    expect(api.keepsOffMap(null)).toBe(false);
  });
});

// The design spec posted on #202 (2026-11-01): the Type follows the category, the review says one true thing, the copy
// promises only what is built.
describe("design spec on #202: the Type follows the category until the person picks one", () => {
  it("is the preset's default Type, or the starting Type when the category names no preset", () => {
    expect(api.START_KIND).toBe("ministry");
    expect(api.autoKindFor("christian-businesses")).toBe("business");
    expect(api.autoKindFor("clinic")).toBe("organization");
    // Business, then Market / Expo (no preset): back to the starting Type, not left on Business.
    expect(api.autoKindFor("markets-expos")).toBe(api.START_KIND);
    for (const c of ["", null, undefined, "constructor", "__proto__"]) expect(api.autoKindFor(c), String(c)).toBe(api.START_KIND);
  });
});

describe("design spec on #202: the review row 'On the map'", () => {
  const clinic = { category: "clinic" };

  it("says Yes only when the switch is on AND there is a pin", () => {
    expect(api.mapRowFor({ ...clinic, showOnMap: true }, true)).toBe(api.COPY.reviewMapOn);
    expect(api.mapRowFor({ ...clinic, showOnMap: true }, false)).toBe(api.COPY.reviewMapNoPin);
    expect(api.COPY.reviewMapOn).toBe("Yes");
    expect(api.COPY.reviewMapNoPin).toBe("No");
  });

  it("with the map off says what is true: no address or pin is stored, whatever hasPin says", () => {
    expect(api.mapRowFor({ ...clinic, showOnMap: false }, false)).toBe("No. We store no address or pin.");
    expect(api.mapRowFor(clinic, true)).toBe(api.COPY.reviewMapOff);
  });
});

describe("design spec on #202: the copy promises only what is built", () => {
  it("the Care note does not offer per-item public choice (not built), and says nothing is public before approval", () => {
    expect(api.COPY.careNote).toBe(
      "Care and recovery services get an extra look from an admin before anything is public. Nothing of yours is public until they approve it.",
    );
    expect(api.COPY.careNote).not.toMatch(/up to you|afterwards/i);
  });

  it("never calls the listing private (it is public in Kingdom Discovery; only the address and pin are withheld)", () => {
    for (const key of ["reviewMapOff", "reviewMapNoPin", "reviewNotOnMap"]) expect(String(api.COPY[key]), key).not.toMatch(/private/i);
    expect(api.COPY.reviewNotOnMap).toBe("Not on the map");
  });

  it("the admin note is a sentence-case heading plus what to read, and does not name the founder", () => {
    expect(api.COPY.adminHeading).toBe("Extra review: care or recovery");
    expect(api.COPY.adminHeading).not.toBe(String(api.COPY.adminHeading).toUpperCase());
    expect(api.COPY.adminCheck).toBe("Read the story, the website and their reason before you approve. Approve only when you are satisfied.");
    expect(JSON.stringify(api.COPY)).not.toMatch(/founder/i);
  });
});
