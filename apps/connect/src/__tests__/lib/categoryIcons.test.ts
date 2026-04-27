import { describe, expect, it } from "vitest";
import { EVENT_CATEGORIES, PLACE_CATEGORIES } from "@/lib/categories";
import { QUICK_ACCESS_ITEMS } from "@/lib/quickPanelOptions";
import { ALL_TAGS } from "@/lib/searchProfile";
import {
  EVENT_CATEGORY_ICON_IDS,
  ICON_SVGS,
  PLACE_CATEGORY_ICON_IDS,
  QUICK_ACCESS_ICON_IDS,
  SEARCH_INTENT_ICON_IDS,
  getEventCategoryIcon,
  getPlaceCategoryIcon,
  getQuickAccessIcon,
} from "@/lib/categoryIcons";

describe("category icon registry", () => {
  it("covers every event category with an SVG", () => {
    for (const { value } of EVENT_CATEGORIES) {
      const iconId = EVENT_CATEGORY_ICON_IDS[value];
      expect(iconId).toBeDefined();
      expect(ICON_SVGS[iconId]).toMatch(/<svg/);
      expect(getEventCategoryIcon(value)).toBe(ICON_SVGS[iconId]);
    }
  });

  it("covers every place category with an SVG", () => {
    for (const { value } of PLACE_CATEGORIES) {
      const iconId = PLACE_CATEGORY_ICON_IDS[value];
      expect(iconId).toBeDefined();
      expect(ICON_SVGS[iconId]).toMatch(/<svg/);
      expect(getPlaceCategoryIcon(value)).toBe(ICON_SVGS[iconId]);
    }
  });

  it("keeps every quick-access item on the shared SVG registry", () => {
    for (const item of QUICK_ACCESS_ITEMS) {
      const iconId = QUICK_ACCESS_ICON_IDS[item.id];
      expect(iconId).toBeDefined();
      expect(item.svg).toBe(ICON_SVGS[iconId]);
      expect(getQuickAccessIcon(item.id)).toBe(item.svg);
    }
  });

  it("maps every AI search tag to an icon intent", () => {
    for (const tag of ALL_TAGS) {
      const iconId = SEARCH_INTENT_ICON_IDS[tag.slug];
      expect(iconId).toBeDefined();
      expect(ICON_SVGS[iconId]).toMatch(/<svg/);
    }
  });
});