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
  presetFor: (c: unknown) => Preset | null;
  defaultKindFor: (c: unknown) => string | null;
  needsExtraReview: (c: unknown) => boolean;
  keepsOffMap: (f: unknown) => boolean;
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
