import { describe, it, expect } from "vitest";
import {
  CATEGORY_LABELS,
  CATEGORY_LABELS_SHORT,
  CATEGORY_BADGE_CLASSES,
  CATEGORY_COLORS,
  CATEGORY_HEX,
  EVENT_CATEGORIES,
  CATEGORY_FILTERS,
  EVENT_CATEGORY_KEYWORDS,
  PLACE_CATEGORY_KEYWORDS,
  PLACE_CATEGORY_LABELS,
  PLACE_CATEGORY_DESCRIPTIONS,
  PLACE_CATEGORY_HEX,
  PLACE_CATEGORIES,
} from "@/lib/categories";
import {
  EVENT_CATEGORY_ICON_IDS,
  PLACE_CATEGORY_ICON_IDS,
} from "@/lib/categoryIcons";
import type { EventCategory, PlaceCategory } from "@/types/db";

const ALL_CATEGORIES: EventCategory[] = [
  "worship-prayer",
  "church-services",
  "outreach-missions",
  "markets-expos",
  "sport-recreation",
  "arts-culture",
  "social-gatherings",
  "community-upliftment",
  "education-equipping",
  "marriage-family",
  "mens-community",
  "womens-community",
  "youth-students",
  "kids",
  "care-recovery",
  "members-only",
  "conferences-summits",
];

describe("CATEGORY_LABELS", () => {
  it("has an entry for every EventCategory", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_LABELS[cat]).toBeDefined();
      expect(typeof CATEGORY_LABELS[cat]).toBe("string");
      expect(CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
    }
  });
});

describe("CATEGORY_LABELS_SHORT", () => {
  it("has an entry for every EventCategory", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_LABELS_SHORT[cat]).toBeDefined();
    }
  });
});

describe("CATEGORY_BADGE_CLASSES", () => {
  it("has an entry for every EventCategory", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_BADGE_CLASSES[cat]).toBeDefined();
      expect(typeof CATEGORY_BADGE_CLASSES[cat]).toBe("string");
    }
  });

  it("uses gold-soft for church-services category", () => {
    expect(CATEGORY_BADGE_CLASSES["church-services"]).toContain("gold-soft");
  });
});

describe("CATEGORY_COLORS", () => {
  it("has a valid hex color for every EventCategory", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_COLORS[cat]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("uses brand gold for church-services", () => {
    expect(CATEGORY_COLORS["church-services"]).toBe("#D4AF37");
  });
});

describe("EVENT_CATEGORIES", () => {
  it("contains all 17 categories", () => {
    expect(EVENT_CATEGORIES).toHaveLength(17);
  });

  it("has value and label for each entry", () => {
    for (const entry of EVENT_CATEGORIES) {
      expect(ALL_CATEGORIES).toContain(entry.value);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});

describe("CATEGORY_FILTERS", () => {
  it("has 18 entries (all + 17 categories)", () => {
    expect(CATEGORY_FILTERS).toHaveLength(18);
  });

  it("starts with 'all' sentinel", () => {
    expect(CATEGORY_FILTERS[0].value).toBe("all");
    expect(CATEGORY_FILTERS[0].label).toBe("All categories");
  });

  it("includes all 17 real categories after 'all'", () => {
    const values = CATEGORY_FILTERS.slice(1).map((f) => f.value);
    for (const cat of ALL_CATEGORIES) {
      expect(values).toContain(cat);
    }
  });
});

describe("EVENT_CATEGORY_KEYWORDS", () => {
  it("has an entry for every EventCategory", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(EVENT_CATEGORY_KEYWORDS[cat]).toBeDefined();
      expect(Array.isArray(EVENT_CATEGORY_KEYWORDS[cat])).toBe(true);
    }
  });

  it("provides at least 30 keywords per category", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(EVENT_CATEGORY_KEYWORDS[cat].length).toBeGreaterThanOrEqual(30);
    }
  });

  it("keywords are lowercase strings with no empty entries", () => {
    for (const cat of ALL_CATEGORIES) {
      for (const kw of EVENT_CATEGORY_KEYWORDS[cat]) {
        expect(typeof kw).toBe("string");
        expect(kw.length).toBeGreaterThan(0);
        expect(kw).toBe(kw.toLowerCase());
      }
    }
  });
});

describe("PLACE_CATEGORY_KEYWORDS", () => {
  const ALL_PLACE_CATEGORIES: PlaceCategory[] = [
    "churches-ministries", "hospitality-cafes", "recreation-sport",
    "media-broadcasting", "retail-shopping", "health-wellness",
    "education-training", "arts-creative", "christian-businesses",
    "safe-spaces",
  ];

  it("provides at least 30 keywords per place category", () => {
    for (const cat of ALL_PLACE_CATEGORIES) {
      expect(PLACE_CATEGORY_KEYWORDS[cat].length).toBeGreaterThanOrEqual(30);
    }
  });
});

describe("PLACE_CATEGORY_LABELS", () => {
  it("renames retail-shopping to 'Retail & Shopping'", () => {
    expect(PLACE_CATEGORY_LABELS["retail-shopping"]).toBeDefined();
    expect(typeof PLACE_CATEGORY_LABELS["retail-shopping"]).toBe("string");
  });
});

/**
 * Drift guard — ensures every per-category map covers exactly the same set
 * of slugs. If a future PR adds a new event slug to one map and forgets the
 * others, this fails loudly. Pair test for the Edge Function map lives in
 * `category-interests.test.ts`.
 */
describe("category source-of-truth — key parity", () => {
  const EVENT_REFERENCE: EventCategory[] = [
    "worship-prayer",
    "church-services",
    "outreach-missions",
    "markets-expos",
    "sport-recreation",
    "arts-culture",
    "social-gatherings",
    "community-upliftment",
    "education-equipping",
    "marriage-family",
    "mens-community",
    "womens-community",
    "youth-students",
    "kids",
    "care-recovery",
    "members-only",
    "conferences-summits",
  ];

  const PLACE_REFERENCE: PlaceCategory[] = [
    "churches-ministries",
    "hospitality-cafes",
    "recreation-sport",
    "media-broadcasting",
    "retail-shopping",
    "health-wellness",
    "education-training",
    "arts-creative",
    "christian-businesses",
    "safe-spaces",
  ];

  const sortedKeys = (obj: Record<string, unknown>): string[] =>
    Object.keys(obj).slice().sort();

  it.each([
    ["CATEGORY_LABELS", CATEGORY_LABELS],
    ["CATEGORY_LABELS_SHORT", CATEGORY_LABELS_SHORT],
    ["CATEGORY_HEX", CATEGORY_HEX],
    ["CATEGORY_BADGE_CLASSES", CATEGORY_BADGE_CLASSES],
    ["CATEGORY_COLORS", CATEGORY_COLORS],
    ["EVENT_CATEGORY_KEYWORDS", EVENT_CATEGORY_KEYWORDS],
    ["EVENT_CATEGORY_ICON_IDS", EVENT_CATEGORY_ICON_IDS],
  ])("event map %s has exactly the 17 canonical slugs", (_name, map) => {
    expect(sortedKeys(map as Record<string, unknown>)).toEqual(
      EVENT_REFERENCE.slice().sort()
    );
  });

  it("EVENT_CATEGORIES.value list matches the 17 canonical slugs", () => {
    expect(EVENT_CATEGORIES.map((e) => e.value).slice().sort()).toEqual(
      EVENT_REFERENCE.slice().sort()
    );
  });

  it("CATEGORY_FILTERS has 'all' + the 17 canonical slugs", () => {
    expect(CATEGORY_FILTERS.map((f) => f.value).slice().sort()).toEqual(
      ["all", ...EVENT_REFERENCE].sort()
    );
  });

  it.each([
    ["PLACE_CATEGORY_LABELS", PLACE_CATEGORY_LABELS],
    ["PLACE_CATEGORY_DESCRIPTIONS", PLACE_CATEGORY_DESCRIPTIONS],
    ["PLACE_CATEGORY_HEX", PLACE_CATEGORY_HEX],
    ["PLACE_CATEGORY_KEYWORDS", PLACE_CATEGORY_KEYWORDS],
    ["PLACE_CATEGORY_ICON_IDS", PLACE_CATEGORY_ICON_IDS],
  ])("place map %s has exactly the 10 canonical slugs", (_name, map) => {
    expect(sortedKeys(map as Record<string, unknown>)).toEqual(
      PLACE_REFERENCE.slice().sort()
    );
  });

  it("PLACE_CATEGORIES.value list matches the 10 canonical slugs", () => {
    expect(PLACE_CATEGORIES.map((p) => p.value).slice().sort()).toEqual(
      PLACE_REFERENCE.slice().sort()
    );
  });

  it("CATEGORY_HEX values are valid 6-digit hex strings", () => {
    for (const slug of EVENT_REFERENCE) {
      expect(CATEGORY_HEX[slug]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("PLACE_CATEGORY_HEX values are valid 6-digit hex strings", () => {
    for (const slug of PLACE_REFERENCE) {
      expect(PLACE_CATEGORY_HEX[slug]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
