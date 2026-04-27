import type { EventCategory, PlaceCategory } from "@/types/db";

export type CategoryIconId =
  | "arts"
  | "bag"
  | "book"
  | "calendar"
  | "care"
  | "church"
  | "coffee"
  | "community"
  | "compass"
  | "couples"
  | "dumbbell"
  | "health"
  | "kids"
  | "lock"
  | "media"
  | "mens"
  | "music"
  | "pin"
  | "recovery"
  | "runner"
  | "tools"
  | "womens";

export const ICON_SVGS: Record<CategoryIconId, string> = {
  arts:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0 0 18h1.2a1.8 1.8 0 0 0 1.3-3.05 1.8 1.8 0 0 1 1.3-3.05H17a4 4 0 0 0 4-4c0-4.4-4-7.9-9-7.9Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="9.5" cy="7.5" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="17" cy="10.5" r="1"/></svg>',
  bag:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 13H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 12h6"/></svg>',
  book:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 5.5A2.5 2.5 0 0 1 6.5 8H20"/><path d="M12 3v16"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 10h18"/><path d="M8 15h3"/><path d="M14 15h2"/></svg>',
  care:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 7a3.4 3.4 0 0 0-5.8 2.4c0 2.6 3.1 4.8 5.8 6.4 2.7-1.6 5.8-3.8 5.8-6.4A3.4 3.4 0 0 0 11 7Z"/><path d="M3 18c1.6-1.4 3.5-2 5.8-2H15a2 2 0 1 1 0 4H9"/><path d="M15 20h2.5c1.3 0 2.4-.5 3.5-1.5"/></svg>',
  church:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v6"/><path d="M9.5 5.5h5"/><path d="M4 13l8-5 8 5"/><path d="M5 13v8h14v-8"/><path d="M10 21v-4a2 2 0 1 1 4 0v4"/></svg>',
  coffee:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10h10v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6Z"/><path d="M15 12h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 3c-.5 1 .5 2 0 3"/><path d="M12 3c-.5 1 .5 2 0 3"/><path d="M18 20H5"/></svg>',
  community:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2"/><circle cx="12" cy="8" r="3"/><path d="M4 18v-1a3 3 0 0 1 3-3"/><path d="M20 18v-1a3 3 0 0 0-3-3"/><path d="M9 20h6"/></svg>',
  compass:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 5-5 2.1 2.1-5 5-2.1Z"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>',
  couples:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="13" r="5"/><circle cx="15" cy="13" r="5"/><path d="M9 8l1.3-2h3.4L15 8"/></svg>',
  dumbbell:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7v10"/><path d="M18 7v10"/><path d="M3 9v6"/><path d="M21 9v6"/><path d="M6 12h12"/></svg>',
  health:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.6a5 5 0 0 0-8.8-3 5 5 0 0 0-8.8 3c0 4 5.1 7.4 8.8 10.3 3.7-2.9 8.8-6.3 8.8-10.3Z"/><path d="M8 12h3l1-3 2 6 1-3h2"/></svg>',
  kids:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3"/><path d="M8 14h8"/><path d="M9 21l1-7"/><path d="M15 21l-1-7"/><path d="M5 17l3-3"/><path d="M19 17l-3-3"/></svg>',
  lock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M12 15v2"/></svg>',
  media:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/></svg>',
  mens:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="5"/><path d="M14 10l5-5"/><path d="M15 5h4v4"/></svg>',
  music:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
  pin:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  recovery:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16"/><path d="M4 20v-4h4"/><path d="M12 15c0-2 1.5-3.5 4-4-1 3-2.4 4-4 4Z"/></svg>',
  runner:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4" r="2"/><path d="m12 7-3 5 4 2 3-4"/><path d="m13 14-2 7"/><path d="m13 14 4 3 2 4"/><path d="M9 12 5 13l1 3"/></svg>',
  tools:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 4.9 5.7l-7.5 7.5a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-5.7-4.9"/><path d="m5 5 4 4"/><path d="M4 8 2 6l4-4 2 2"/></svg>',
  womens:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"/><path d="M12 14v7"/><path d="M9 18h6"/></svg>',
};

export const DEFAULT_CATEGORY_ICON = ICON_SVGS.pin;

export const EVENT_CATEGORY_ICON_IDS: Record<EventCategory, CategoryIconId> = {
  entertainment: "music",
  "sport-fun": "runner",
  "social-fun": "coffee",
  "community-upliftment": "community",
  education: "book",
  church: "church",
  missional: "compass",
  "marriage-and-couples": "couples",
  mens: "mens",
  womens: "womens",
  kids: "kids",
  recovery: "recovery",
  equip: "tools",
  weekend: "calendar",
  "members-only": "lock",
  care: "care",
};

export const PLACE_CATEGORY_ICON_IDS: Record<PlaceCategory, CategoryIconId> = {
  church: "church",
  relax: "coffee",
  exercise: "dumbbell",
  media: "media",
  shopping: "bag",
  health: "health",
  education: "book",
  arts: "arts",
};

export const QUICK_ACCESS_ICON_IDS: Record<string, CategoryIconId> = {
  "bible-study": "book",
  coffee: "coffee",
  runs: "runner",
  churches: "church",
  outreaches: "community",
  entertainment: "music",
  missional: "compass",
  couples: "couples",
  mens: "mens",
  womens: "womens",
  kids: "kids",
  recovery: "recovery",
  care: "care",
  equip: "tools",
  weekend: "calendar",
  "members-only": "lock",
  media: "media",
  shopping: "bag",
  health: "health",
  arts: "arts",
};

export const SEARCH_INTENT_ICON_IDS: Record<string, CategoryIconId> = {
  youth: "kids",
  kids: "kids",
  students: "book",
  "young-adults": "community",
  couples: "couples",
  men: "mens",
  women: "womens",
  singles: "community",
  seniors: "care",
  entrepreneurs: "bag",
  professionals: "bag",
  seekers: "compass",
  hurting: "care",
  lonely: "community",
  community: "community",
  worship: "music",
  prayer: "care",
  "bible-study": "book",
  counselling: "care",
  healing: "health",
  "marriage-advice": "couples",
  mentorship: "tools",
  service: "community",
  fun: "music",
  fitness: "runner",
  "food-coffee": "coffee",
  shopping: "bag",
  business: "bag",
  learning: "book",
  recovery: "recovery",
  "finance-advice": "bag",
  career: "bag",
  creative: "arts",
  care: "care",
  quiet: "coffee",
  energetic: "runner",
  intimate: "couples",
  "family-friendly": "kids",
  charismatic: "music",
  traditional: "church",
  casual: "coffee",
  outdoor: "compass",
};

export function getIconSvg(iconId: CategoryIconId | null | undefined): string {
  return iconId ? ICON_SVGS[iconId] ?? DEFAULT_CATEGORY_ICON : DEFAULT_CATEGORY_ICON;
}

export function getEventCategoryIcon(category: EventCategory | null | undefined): string {
  return getIconSvg(category ? EVENT_CATEGORY_ICON_IDS[category] : "church");
}

export function getPlaceCategoryIcon(category: PlaceCategory | null | undefined): string {
  return getIconSvg(category ? PLACE_CATEGORY_ICON_IDS[category] : "pin");
}

export function getQuickAccessIcon(id: string): string {
  return getIconSvg(QUICK_ACCESS_ICON_IDS[id] ?? "pin");
}