import type { EventCategory, PlaceCategory } from "@/types/db";
import { CATEGORY_HEX, PLACE_CATEGORY_HEX } from "@/lib/categories";
import { getQuickAccessIcon } from "@/lib/categoryIcons";

export type QuickAccessItem = {
  id: string;
  label: string;
  color: string;
  eventCategories: EventCategory[];
  placeCategories: PlaceCategory[];
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
    color: CATEGORY_HEX.education,
    eventCategories: ["education"],
    placeCategories: ["education"],
  }),
  quickAccessItem({
    id: "coffee",
    label: "Coffee",
    color: PLACE_CATEGORY_HEX.relax,
    eventCategories: ["social-fun"],
    placeCategories: ["relax"],
  }),
  quickAccessItem({
    id: "runs",
    label: "Runs",
    color: CATEGORY_HEX["sport-fun"],
    eventCategories: ["sport-fun"],
    placeCategories: ["exercise"],
  }),
  quickAccessItem({
    id: "churches",
    label: "Churches",
    color: CATEGORY_HEX.church,
    eventCategories: ["church"],
    placeCategories: ["church"],
  }),
  quickAccessItem({
    id: "outreaches",
    label: "Outreach",
    color: CATEGORY_HEX["community-upliftment"],
    eventCategories: ["community-upliftment"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "entertainment",
    label: "Entertainment",
    color: CATEGORY_HEX.entertainment,
    eventCategories: ["entertainment"],
    placeCategories: ["arts"],
  }),
  quickAccessItem({
    id: "missional",
    label: "Missional",
    color: CATEGORY_HEX.missional,
    eventCategories: ["missional"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "couples",
    label: "Couples",
    color: CATEGORY_HEX["marriage-and-couples"],
    eventCategories: ["marriage-and-couples"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "mens",
    label: "Mens",
    color: CATEGORY_HEX.mens,
    eventCategories: ["mens"],
    placeCategories: [],
  }),
  quickAccessItem({
    id: "womens",
    label: "Womens",
    color: CATEGORY_HEX.womens,
    eventCategories: ["womens"],
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
    id: "recovery",
    label: "Recovery",
    color: CATEGORY_HEX.recovery,
    eventCategories: ["recovery"],
    placeCategories: ["health"],
  }),
  quickAccessItem({
    id: "care",
    label: "Care",
    color: CATEGORY_HEX.care,
    eventCategories: ["care"],
    placeCategories: ["health"],
  }),
  quickAccessItem({
    id: "equip",
    label: "Equip",
    color: CATEGORY_HEX.equip,
    eventCategories: ["equip"],
    placeCategories: ["education"],
  }),
  quickAccessItem({
    id: "weekend",
    label: "Weekend",
    color: CATEGORY_HEX.weekend,
    eventCategories: ["weekend"],
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
    id: "media",
    label: "Media",
    color: PLACE_CATEGORY_HEX.media,
    eventCategories: [],
    placeCategories: ["media"],
  }),
  quickAccessItem({
    id: "shopping",
    label: "Stores",
    color: PLACE_CATEGORY_HEX.shopping,
    eventCategories: [],
    placeCategories: ["shopping"],
  }),
  quickAccessItem({
    id: "health",
    label: "Health",
    color: PLACE_CATEGORY_HEX.health,
    eventCategories: [],
    placeCategories: ["health"],
  }),
  quickAccessItem({
    id: "arts",
    label: "Arts",
    color: PLACE_CATEGORY_HEX.arts,
    eventCategories: [],
    placeCategories: ["arts"],
  }),
];