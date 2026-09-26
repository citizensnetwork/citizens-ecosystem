/**
 * The 12 Contributor types (founder, 2026-09-26) live in TWO places by
 * necessity — `src/lib/categories.ts` (server validation) and
 * `src/frontend/app/data.jsx` (pickers, pins, cards; no build step, so no
 * shared import). This pins them together and pins the resolution rules the
 * map and cards depend on.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRIBUTOR_TYPES, EVENT_CATEGORIES, isContributorType } from "@/lib/categories";
import { CONTRIBUTOR_KINDS, CONTRIBUTOR_KIND_LABELS, isContributorKind } from "@/types/db";

type Cat = { id: string; name: string; short: string; hex: string; icon: string };
type Data = {
  CONTRIBUTOR_TYPES: Cat[];
  FILTER_CATEGORIES: Cat[];
  getCategory: (id: string) => Cat | undefined;
  getItemCategory: (item: { type?: string; category?: string }) => Cat | undefined;
};

let DATA: Data;

beforeAll(() => {
  const src = readFileSync(join(process.cwd(), "src/frontend/app/data.jsx"), "utf8");
  const win: Record<string, unknown> = {};
  new Function("window", src)(win);
  DATA = win.DATA as Data;
});

describe("Contributor types", () => {
  it("are the founder's 12, with unique slugs and the 3 new ones", () => {
    const slugs = CONTRIBUTOR_TYPES.map((t) => t.value);
    expect(slugs).toHaveLength(12);
    expect(new Set(slugs).size).toBe(12);
    for (const fresh of ["retreat-healing", "clinic", "rehab-development"]) {
      expect(slugs).toContain(fresh);
    }
    for (const t of CONTRIBUTOR_TYPES) expect(t.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("leave the 17 event categories untouched", () => {
    expect(EVENT_CATEGORIES).toHaveLength(17);
    expect(EVENT_CATEGORIES.map((c) => c.value)).not.toContain("clinic");
  });

  it("validate new writes against the 12 only", () => {
    expect(isContributorType("clinic")).toBe(true);
    expect(isContributorType("churches-ministries")).toBe(true);
    expect(isContributorType("worship-prayer")).toBe(false); // event-only slug
    expect(isContributorType("")).toBe(false);
    expect(isContributorType(null)).toBe(false);
  });

  it("match the frontend list exactly (slug, label, colour, icon, order)", () => {
    expect(DATA.CONTRIBUTOR_TYPES.map((t) => [t.id, t.name, t.hex, t.icon])).toEqual(
      CONTRIBUTOR_TYPES.map((t) => [t.value, t.label, t.hex, t.icon]),
    );
  });

  it("resolve a contributor's reused slug to the contributor entry, events/places unchanged", () => {
    expect(DATA.getItemCategory({ type: "contributor", category: "churches-ministries" })?.name).toBe("Church");
    expect(DATA.getItemCategory({ type: "contributor", category: "churches-ministries" })?.icon).toBe("Church");
    expect(DATA.getItemCategory({ type: "place", category: "churches-ministries" })?.name).toBe("Churches & Ministries");
    expect(DATA.getItemCategory({ type: "event", category: "outreach-missions" })?.name).toBe("Outreach & Missions");
    // A legacy event slug on an existing contributor row still resolves.
    expect(DATA.getItemCategory({ type: "contributor", category: "worship-prayer" })?.name).toBe("Worship & Prayer");
    expect(DATA.getCategory("rehab-development")?.hex).toBe("#5B2C6F");
    expect(DATA.getItemCategory({ type: "contributor" })).toBeUndefined();
  });

  it("give every new type a map filter pill, without duplicating a reused slug", () => {
    const ids = DATA.FILTER_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fresh of ["retreat-healing", "clinic", "rehab-development"]) expect(ids).toContain(fresh);
  });
});

describe("Contributor kinds", () => {
  it("include Individual everywhere the kind list is read", () => {
    expect(CONTRIBUTOR_KINDS).toEqual(["ministry", "organization", "business", "individual"]);
    expect(isContributorKind("individual")).toBe(true);
    expect(isContributorKind("church")).toBe(false);
    expect(CONTRIBUTOR_KIND_LABELS.individual).toBe("Individual");
  });
});
