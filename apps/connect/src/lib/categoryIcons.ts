import type { EventCategory, PlaceCategory } from "@/types/db";

/**
 * Citizens Connect category icon registry — Batch S2 (Lucide redraw).
 *
 * Source of truth for every category / quick-access / search-intent icon
 * rendered as inline SVG (map markers, badges, quick panel, AI search chips).
 * Path data is extracted from `lucide-react` v0.441.0 source under
 * `node_modules/lucide-react/dist/esm/icons/*.js` so the visual language
 * stays consistent with the rest of the app (which renders Lucide React
 * components elsewhere) while map/marker code that needs an SVG string
 * still has one available without a React render.
 *
 * Four icons are hand-authored to fill gaps that Lucide does not cover
 * idiomatically: `praying-hands`, `soccer-ball`, `lollipop`, and the legacy
 * `pin` default-fallback. `weekend-tag` is an alias for `calendar-days`.
 *
 * Standard SVG attrs across the registry (Lucide convention):
 *   viewBox="0 0 24 24" fill="none" stroke="currentColor"
 *   stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
 *
 * Updates here must stay in sync with `src/lib/categories.ts`
 * (CATEGORY_HEX / PLACE_CATEGORY_HEX) and the migration
 * `supabase/migrations/064_refine_categories_v2.sql` category seed.
 */
export type CategoryIconId =
  | "book-open"
  | "calendar-days"
  | "church"
  | "coffee"
  | "dumbbell"
  | "flame"
  | "globe"
  | "graduation-cap"
  | "hand-heart"
  | "heart"
  | "heart-handshake"
  | "key-round"
  | "lollipop"
  | "martini"
  | "mic"
  | "palette"
  | "pin"
  | "praying-hands"
  | "radio"
  | "shirt"
  | "shopping-bag"
  | "soccer-ball"
  | "stethoscope"
  | "store"
  | "user"
  | "user-round"
  | "users"
  | "weekend-tag";

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';

const CALENDAR_DAYS_SVG =
  `${SVG_OPEN}<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>`;

export const ICON_SVGS: Record<CategoryIconId, string> = {
  // — Lucide BookOpen
  "book-open":
    `${SVG_OPEN}<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`,
  // — Lucide CalendarDays
  "calendar-days": CALENDAR_DAYS_SVG,
  // — Lucide Church
  church:
    `${SVG_OPEN}<path d="M10 9h4"/><path d="M12 7v5"/><path d="M14 22v-4a2 2 0 0 0-4 0v4"/><path d="M18 22V5.618a1 1 0 0 0-.553-.894l-4.553-2.277a2 2 0 0 0-1.788 0L6.553 4.724A1 1 0 0 0 6 5.618V22"/><path d="m18 7 3.447 1.724a1 1 0 0 1 .553.894V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.618a1 1 0 0 1 .553-.894L6 7"/></svg>`,
  // — Lucide Coffee
  coffee:
    `${SVG_OPEN}<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/></svg>`,
  // — Lucide Dumbbell
  dumbbell:
    `${SVG_OPEN}<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/></svg>`,
  // — Lucide Flame
  flame:
    `${SVG_OPEN}<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  // — Lucide Globe2 / Earth
  globe:
    `${SVG_OPEN}<path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/><path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/><path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/><circle cx="12" cy="12" r="10"/></svg>`,
  // — Lucide GraduationCap
  "graduation-cap":
    `${SVG_OPEN}<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`,
  // — Lucide HandHeart
  "hand-heart":
    `${SVG_OPEN}<path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16"/><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 15 6 6"/><path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z"/></svg>`,
  // — Lucide Heart
  heart:
    `${SVG_OPEN}<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  // — Lucide HeartHandshake
  "heart-handshake":
    `${SVG_OPEN}<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/></svg>`,
  // — Lucide KeyRound
  "key-round":
    `${SVG_OPEN}<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
  // — Custom Lollipop (stick + spiral candy)
  lollipop:
    `${SVG_OPEN}<circle cx="10" cy="9" r="6"/><path d="M10 5a4 4 0 0 1 4 4"/><path d="M10 7a2 2 0 0 1 2 2"/><path d="m14.5 13.5 6.5 8"/></svg>`,
  // — Lucide Martini
  martini:
    `${SVG_OPEN}<path d="M8 22h8"/><path d="M12 11v11"/><path d="m19 3-7 8-7-8Z"/></svg>`,
  // — Lucide MicVocal (Mic2)
  mic:
    `${SVG_OPEN}<path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12"/><path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5"/><circle cx="16" cy="7" r="5"/></svg>`,
  // — Lucide Palette
  palette:
    `${SVG_OPEN}<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`,
  // — Custom Pin (legacy default-fallback marker)
  pin:
    `${SVG_OPEN}<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  // — Custom PrayingHands (two stylised palms meeting at centre)
  "praying-hands":
    `${SVG_OPEN}<path d="M9 21V11a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6c0 2 1 4 3 4z"/><path d="M15 21V11a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v6c0 2-1 4-3 4z"/><path d="M9 9V5a1.5 1.5 0 0 1 3 0v4"/><path d="M15 9V5a1.5 1.5 0 0 0-3 0v4"/></svg>`,
  // — Lucide Radio
  radio:
    `${SVG_OPEN}<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>`,
  // — Lucide Shirt
  shirt:
    `${SVG_OPEN}<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>`,
  // — Lucide ShoppingBag
  "shopping-bag":
    `${SVG_OPEN}<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  // — Custom SoccerBall (pentagon + stitching cues)
  "soccer-ball":
    `${SVG_OPEN}<circle cx="12" cy="12" r="9"/><path d="M12 6.5 8.5 9.2l1.3 4.1h4.4l1.3-4.1Z"/><path d="M12 6.5V3"/><path d="m8.5 9.2-3.2-1"/><path d="m15.5 9.2 3.2-1"/><path d="m9.8 13.3-2 3"/><path d="m14.2 13.3 2 3"/></svg>`,
  // — Lucide Stethoscope
  stethoscope:
    `${SVG_OPEN}<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/></svg>`,
  // — Lucide Store
  store:
    `${SVG_OPEN}<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>`,
  // — Lucide User
  user:
    `${SVG_OPEN}<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  // — Lucide UserRound
  "user-round":
    `${SVG_OPEN}<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`,
  // — Lucide Users
  users:
    `${SVG_OPEN}<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  // — Weekend chip alias (CalendarDays)
  "weekend-tag": CALENDAR_DAYS_SVG,
};

export const DEFAULT_CATEGORY_ICON = ICON_SVGS.pin;

export const EVENT_CATEGORY_ICON_IDS: Record<EventCategory, CategoryIconId> = {
  "worship-prayer": "praying-hands",
  "church-services": "church",
  "outreach-missions": "globe",
  "markets-expos": "store",
  "sport-recreation": "soccer-ball",
  "arts-culture": "palette",
  "social-gatherings": "martini",
  "community-upliftment": "heart-handshake",
  "education-equipping": "graduation-cap",
  "marriage-family": "users",
  "mens-community": "user",
  "womens-community": "user-round",
  "youth-students": "flame",
  kids: "lollipop",
  "care-recovery": "hand-heart",
  "members-only": "key-round",
  "conferences-summits": "mic",
};

export const PLACE_CATEGORY_ICON_IDS: Record<PlaceCategory, CategoryIconId> = {
  "churches-ministries": "church",
  "hospitality-cafes": "coffee",
  "recreation-sport": "dumbbell",
  "media-broadcasting": "radio",
  "retail-shopping": "shopping-bag",
  "health-wellness": "stethoscope",
  "education-training": "book-open",
  "arts-creative": "palette",
  "christian-businesses": "store",
  "safe-spaces": "heart",
};

export const QUICK_ACCESS_ICON_IDS: Record<string, CategoryIconId> = {
  "bible-study": "book-open",
  coffee: "coffee",
  runs: "dumbbell",
  churches: "church",
  outreaches: "globe",
  "arts-culture": "palette",
  "outreach-missions": "globe",
  "marriage-family": "users",
  "mens-community": "user",
  "womens-community": "user-round",
  "youth-students": "flame",
  kids: "lollipop",
  "care-recovery": "hand-heart",
  care: "hand-heart",
  "conferences-summits": "mic",
  "members-only": "key-round",
  "media-broadcasting": "radio",
  "retail-shopping": "shopping-bag",
  "health-wellness": "stethoscope",
  "arts-creative": "palette",
  "markets-expos": "store",
  "worship-prayer": "praying-hands",
  "church-services": "church",
};

export const SEARCH_INTENT_ICON_IDS: Record<string, CategoryIconId> = {
  youth: "flame",
  kids: "lollipop",
  students: "book-open",
  "young-adults": "users",
  couples: "users",
  men: "user",
  women: "user-round",
  singles: "users",
  seniors: "hand-heart",
  entrepreneurs: "store",
  professionals: "shopping-bag",
  seekers: "globe",
  hurting: "hand-heart",
  lonely: "users",
  community: "users",
  worship: "praying-hands",
  prayer: "praying-hands",
  "bible-study": "book-open",
  counselling: "hand-heart",
  healing: "stethoscope",
  "marriage-advice": "users",
  mentorship: "key-round",
  service: "heart-handshake",
  fun: "martini",
  fitness: "dumbbell",
  "food-coffee": "coffee",
  shopping: "shopping-bag",
  business: "store",
  learning: "book-open",
  recovery: "hand-heart",
  "finance-advice": "shopping-bag",
  career: "shopping-bag",
  creative: "palette",
  care: "hand-heart",
  quiet: "coffee",
  energetic: "flame",
  intimate: "users",
  "family-friendly": "lollipop",
  charismatic: "flame",
  traditional: "church",
  casual: "coffee",
  outdoor: "globe",
};

export function getIconSvg(iconId: CategoryIconId | null | undefined): string {
  return iconId ? ICON_SVGS[iconId] ?? DEFAULT_CATEGORY_ICON : DEFAULT_CATEGORY_ICON;
}

export function getEventCategoryIcon(category: EventCategory | null | undefined): string {
  return getIconSvg(category ? EVENT_CATEGORY_ICON_IDS[category] : "church");
}

/** Backward-compat: lookup an icon by an arbitrary slug string
 *  (for callers that store user-supplied marker_icon strings).
 *  Returns the church icon for unknown slugs. */
export function getIconBySlug(slug: string | null | undefined): string {
  if (!slug) return ICON_SVGS.church;
  const id = (EVENT_CATEGORY_ICON_IDS as Record<string, CategoryIconId>)[slug]
    ?? (PLACE_CATEGORY_ICON_IDS as Record<string, CategoryIconId>)[slug]
    ?? (QUICK_ACCESS_ICON_IDS as Record<string, CategoryIconId>)[slug];
  return getIconSvg(id ?? "church");
}

export function getPlaceCategoryIcon(category: PlaceCategory | null | undefined): string {
  return getIconSvg(category ? PLACE_CATEGORY_ICON_IDS[category] : "pin");
}

export function getQuickAccessIcon(id: string): string {
  return getIconSvg(QUICK_ACCESS_ICON_IDS[id] ?? "pin");
}
