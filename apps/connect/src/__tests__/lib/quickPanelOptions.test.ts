import { describe, it, expect } from "vitest";
import { QUICK_ACCESS_ITEMS } from "@/lib/quickPanelOptions";
import { CATEGORY_HEX, CATEGORY_LABELS } from "@/lib/categories";
import type { EventCategory } from "@/types/db";

describe("QUICK_ACCESS_ITEMS", () => {
  it("includes a Care & Recovery quick-access item wired to the `care-recovery` event category", () => {
    const care = QUICK_ACCESS_ITEMS.find((i) => i.id === "care-recovery");
    expect(care).toBeDefined();
    expect(care?.eventCategories).toContain("care-recovery");
    // Care uses the same hex as the care-recovery event category so the
    // quick-access chip, burger-menu label, and map marker share a palette.
    expect(care?.color).toBe(CATEGORY_HEX["care-recovery"]);
  });

  it("every quick-access item has a non-empty SVG glyph and colour", () => {
    for (const item of QUICK_ACCESS_ITEMS) {
      expect(item.svg).toMatch(/<svg/);
      expect(item.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("every event category referenced by a quick-access item is a known category", () => {
    const knownCats = new Set<EventCategory>(
      Object.keys(CATEGORY_LABELS) as EventCategory[]
    );
    for (const item of QUICK_ACCESS_ITEMS) {
      for (const cat of item.eventCategories) {
        expect(knownCats.has(cat)).toBe(true);
      }
    }
  });

  it("every first-class event category with a custom colour is reachable by at least one quick-access tool", () => {
    // Soft audit to flag future drift: if a category gains no quick-access
    // surface the test fails and we update either the categories list or
    // QUICK_ACCESS_ITEMS. Excludes `members-only` which is intentionally
    // reachable only via an explicit quick-access chip (included below).
    const reachable = new Set<EventCategory>();
    for (const item of QUICK_ACCESS_ITEMS) {
      for (const cat of item.eventCategories) reachable.add(cat);
    }
    for (const cat of Object.keys(CATEGORY_LABELS) as EventCategory[]) {
      expect(reachable.has(cat)).toBe(true);
    }
  });
});
