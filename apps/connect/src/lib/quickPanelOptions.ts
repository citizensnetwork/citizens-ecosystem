import type { EventCategory, PlaceCategory } from "@/types/db";
import { CATEGORY_HEX, PLACE_CATEGORY_HEX } from "@/lib/categories";
import { getQuickAccessIcon } from "@/lib/categoryIcons";

export type QuickAccessItem = {
  id: string;
  label: string;
  color: string;
  eventCategories: EventCategory[];
  placeCategories: PlaceCategory[];
  specialFilter?: "volunteer";
  svg: string;
};

type QuickAccessInput = Omit<QuickAccessItem, "svg">;

function quickAccessItem(item: QuickAccessInput): QuickAccessItem {
  return {
    ...item,
    svg: getQuickAccessIcon(item.id),
  };
}

/**
 * Canonical list of quick-access tools shown on the map under the burger button.
 * Users can pick up to 5 of these via the quick-panel preferences modal.
 * SVGs resolve through `categoryIcons.ts`, which also powers map markers and
 * search-intent icon coverage.
 */
export const QUICK_ACCESS_ITEMS: QuickAccessItem[] = [
  quickAccessItem({
    id: "bible-study",
    label: "Bible Study",
    color: CATEGORY_HEX["education-equipping"],
    eventCategories: ["education-equipping"],
    placeCategories: ["education-training"],
  }),
  quickAccessItem({
    id: "coffee",
    label: "Coffee",
    color: PLACE_CATEGORY_HEX["hospitality-cafes"],
    eventCategories: ["social-gatherings"],
    placeCategories: ["hospitality-cafes"],
  }),
  quickAccessItem({
    id: "runs",
    label: "Runs",
    color: CATEGORY_HEX["sport-recreation"],
    eventCategories: ["sport-recreation"],
    placeCategories: ["recreation-sport"],
  }),
  quickAccessItem({
    id: "churches",
    label: "Churches",
    color: CATEGORY_HEX["church-services"],
    eventCategories: ["church-services"],
    placeCategories: ["churches-ministries"],
  }),
  quickAccessItem({
    id: "where-to-serve",
    label: "Where to Serve",
    color: CATEGORY_HEX["community-upliftment"],
    eventCategories: [],
    placeCategories: [],
    specialFilter: "volunteer",
  }),
  quickAccessItem({
    id: "outreaches",
    label: "Outreach",
    color: CATEGORY_HEX["community-upliftment"],
    eventCategories: ["community-upliftment"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "arts-culture",
    label: "Arts & Culture",
    color: CATEGORY_HEX["arts-culture"],
    eventCategories: ["arts-culture"],
    placeCategories: ["arts-creative"],
  }),
  quickAccessItem({
    id: "outreach-missions",
    label: "Missions",
    color: CATEGORY_HEX["outreach-missions"],
    eventCategories: ["outreach-missions"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "marriage-family",
    label: "Marriage & Family",
    color: CATEGORY_HEX["marriage-family"],
    eventCategories: ["marriage-family"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "mens-community",
    label: "Men's",
    color: CATEGORY_HEX["mens-community"],
    eventCategories: ["mens-community"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "womens-community",
    label: "Women's",
    color: CATEGORY_HEX["womens-community"],
    eventCategories: ["womens-community"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "youth-students",
    label: "Youth & Students",
    color: CATEGORY_HEX["youth-students"],
    eventCategories: ["youth-students"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "kids",
    label: "Kids",
    color: CATEGORY_HEX.kids,
    eventCategories: ["kids"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "care-recovery",
    label: "Care & Recovery",
    color: CATEGORY_HEX["care-recovery"],
    eventCategories: ["care-recovery"],
    placeCategories: ["health-wellness", "safe-spaces"],
  }),
  quickAccessItem({
    id: "conferences-summits",
    label: "Conferences",
    color: CATEGORY_HEX["conferences-summits"],
    eventCategories: ["conferences-summits"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "members-only",
    label: "Members",
    color: CATEGORY_HEX["members-only"],
    eventCategories: ["members-only"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "media-broadcasting",
    label: "Media",
    color: PLACE_CATEGORY_HEX["media-broadcasting"],
    eventCategories: [],
    placeCategories: ["media-broadcasting"],
  }),
  quickAccessItem({
    id: "retail-shopping",
    label: "Stores",
    color: PLACE_CATEGORY_HEX["retail-shopping"],
    eventCategories: [],
    placeCategories: ["retail-shopping"],
  }),
  quickAccessItem({
    id: "markets-expos",
    label: "Markets & Expos",
    color: CATEGORY_HEX["markets-expos"],
    eventCategories: ["markets-expos"],
    placeCategories: ["retail-shopping"],
  }),
  quickAccessItem({
    id: "health-wellness",
    label: "Health",
    color: PLACE_CATEGORY_HEX["health-wellness"],
    eventCategories: [],
    placeCategories: ["health-wellness"],
  }),
  quickAccessItem({
    id: "worship-prayer",
    label: "Worship & Prayer",
    color: CATEGORY_HEX["worship-prayer"],
    eventCategories: ["worship-prayer"],
    placeCategories: [],
  }),
];
