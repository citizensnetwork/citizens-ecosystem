import { describe, it, expect } from "vitest";
import {
  CATEGORY_LABELS,
  CATEGORY_LABELS_SHORT,
  CATEGORY_BADGE_CLASSES,
  CATEGORY_COLORS,
  EVENT_CATEGORIES,
  CATEGORY_FILTERS,
  EVENT_CATEGORY_KEYWORDS,
  PLACE_CATEGORY_KEYWORDS,
  PLACE_CATEGORY_LABELS,
} from "@/lib/categories";
import type { EventCategory, PlaceCategory } from "@/types/db";

const ALL_CATEGORIES: EventCategory[] = [
  "entertainment",
  "sport-fun",
  "social-fun",
  "community-upliftment",
  "education",
  "church",
  "missional",
  "marriage-and-couples",
  "mens",
  "womens",
  "kids",
  "recovery",
  "equip",
  "weekend",
  "members-only",
  "care",
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

  it("uses gold-soft for church category", () => {
    expect(CATEGORY_BADGE_CLASSES.church).toContain("gold-soft");
  });
});

describe("CATEGORY_COLORS", () => {
  it("has a valid hex color for every EventCategory", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_COLORS[cat]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("uses brand gold for church", () => {
    expect(CATEGORY_COLORS.church).toBe("#D4AF37");
  });
});

describe("EVENT_CATEGORIES", () => {
  it("contains all 16 categories", () => {
    expect(EVENT_CATEGORIES).toHaveLength(16);
  });

  it("has value and label for each entry", () => {
    for (const entry of EVENT_CATEGORIES) {
      expect(ALL_CATEGORIES).toContain(entry.value);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});

describe("CATEGORY_FILTERS", () => {
  it("has 17 entries (all + 16 categories)", () => {
    expect(CATEGORY_FILTERS).toHaveLength(17);
  });

  it("starts with 'all' sentinel", () => {
    expect(CATEGORY_FILTERS[0].value).toBe("all");
    expect(CATEGORY_FILTERS[0].label).toBe("All categories");
  });

  it("includes all 16 real categories after 'all'", () => {
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

  it("provides at least 50 keywords per category", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(EVENT_CATEGORY_KEYWORDS[cat].length).toBeGreaterThanOrEqual(50);
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
    "church", "relax", "exercise", "media",
    "shopping", "health", "education", "arts",
  ];

  it("provides at least 50 keywords per place category", () => {
    for (const cat of ALL_PLACE_CATEGORIES) {
      expect(PLACE_CATEGORY_KEYWORDS[cat].length).toBeGreaterThanOrEqual(50);
    }
  });
});

describe("PLACE_CATEGORY_LABELS", () => {
  it("renames shopping to 'Stores' (slug preserved)", () => {
    expect(PLACE_CATEGORY_LABELS.shopping).toBe("Stores");
  });
});
