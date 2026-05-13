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
    // QUICK_ACCESS_ICON_IDS only covers native quick-panel intents
    // (bible-study, coffee, runs, churches, outreaches, care). Quick-access
    // items that reuse a real event/place category slug (e.g. `arts-culture`,
    // `worship-prayer`, `media-broadcasting`) resolve through getQuickAccessIcon's
    // composition fall-through, so we assert against the resolver directly.
    for (const item of QUICK_ACCESS_ITEMS) {
      const svg = getQuickAccessIcon(item.id);
      expect(svg).toMatch(/<svg/);
      expect(item.svg).toBe(svg);
    }
  });

  it("registers a native quick-access mapping for every quick-only intent", () => {
    for (const id of ["bible-study", "coffee", "runs", "churches", "outreaches", "care"] as const) {
      const iconId = QUICK_ACCESS_ICON_IDS[id];
      expect(iconId).toBeDefined();
      expect(ICON_SVGS[iconId]).toMatch(/<svg/);
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