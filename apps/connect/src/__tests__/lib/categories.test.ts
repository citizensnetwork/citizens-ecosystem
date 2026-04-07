import { describe, it, expect } from "vitest";
import {
  CATEGORY_LABELS,
  CATEGORY_LABELS_SHORT,
  CATEGORY_BADGE_CLASSES,
  CATEGORY_COLORS,
  EVENT_CATEGORIES,
  CATEGORY_FILTERS,
} from "@/lib/categories";
import type { EventCategory } from "@/types/db";

const ALL_CATEGORIES: EventCategory[] = [
  "church-service",
  "youth",
  "community-outreach",
  "worship",
  "bible-study",
  "prayer",
  "social",
  "other",
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

  it("uses gold-soft for most categories and black/5 for other", () => {
    expect(CATEGORY_BADGE_CLASSES.other).toContain("bg-black/5");
    expect(CATEGORY_BADGE_CLASSES["church-service"]).toContain("gold-soft");
  });
});

describe("CATEGORY_COLORS", () => {
  it("has a valid hex color for every EventCategory", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_COLORS[cat]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("uses gold (#D4AF37) for worship", () => {
    expect(CATEGORY_COLORS.worship).toBe("#D4AF37");
  });
});

describe("EVENT_CATEGORIES", () => {
  it("contains all 8 categories", () => {
    expect(EVENT_CATEGORIES).toHaveLength(8);
  });

  it("has value and label for each entry", () => {
    for (const entry of EVENT_CATEGORIES) {
      expect(ALL_CATEGORIES).toContain(entry.value);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});

describe("CATEGORY_FILTERS", () => {
  it("has 9 entries (all + 8 categories)", () => {
    expect(CATEGORY_FILTERS).toHaveLength(9);
  });

  it("starts with 'all' sentinel", () => {
    expect(CATEGORY_FILTERS[0].value).toBe("all");
    expect(CATEGORY_FILTERS[0].label).toBe("All categories");
  });

  it("includes all 8 real categories after 'all'", () => {
    const values = CATEGORY_FILTERS.slice(1).map((f) => f.value);
    for (const cat of ALL_CATEGORIES) {
      expect(values).toContain(cat);
    }
  });
});
