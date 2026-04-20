import type { EventCategory, PlaceCategory } from "@/types/db";

export type QuickAccessItem = {
  id: string;
  label: string;
  color: string;
  eventCategories: EventCategory[];
  placeCategories: PlaceCategory[];
  svg: string;
};

/**
 * Canonical list of quick-access tools shown on the map under the burger button.
 * Users can pick up to 5 of these via the quick-panel preferences modal.
 * Stored centrally so the profile page's editor and EventsView stay in sync.
 */
export const QUICK_ACCESS_ITEMS: QuickAccessItem[] = [
  {
    id: "bible-study",
    label: "Bible Study",
    color: "#FF6B35",
    eventCategories: ["education"],
    placeCategories: ["education"],
    // Glasses — mirrors the EventMap `education` category marker so the
    // quick-access tool, burger filter and map marker share one visual.
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="15" r="3.5"/><circle cx="18" cy="15" r="3.5"/><path d="M9.5 15h5"/><path d="M3 12l2-6"/><path d="M21 12l-2-6"/></svg>',
  },
  {
    id: "coffee",
    label: "Coffee",
    color: "#8B4513",
    eventCategories: ["social-fun"],
    placeCategories: ["relax"],
    // Coffee mug with three steam lines — mirrors the EventMap `social-fun` marker.
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10h10v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6z"/><path d="M15 12h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M7 3c-.5 1 .5 2 0 3"/><path d="M10 3c-.5 1 .5 2 0 3"/><path d="M13 3c-.5 1 .5 2 0 3"/></svg>',
  },
  {
    id: "runs",
    label: "Runs",
    color: "#2ECC71",
    eventCategories: ["sport-fun"],
    placeCategories: ["exercise"],
    // Simple running stick figure — head, tilted torso, swinging arms, striding legs.
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4.5" r="2"/><path d="M14 6.5L11 11l3 3"/><path d="M14 14l-3 6"/><path d="M14 14l3 3 2 4"/><path d="M11 11L7.5 12l.5 3"/><path d="M11 11l4 1"/></svg>',
  },
  {
    id: "churches",
    label: "Churches",
    color: "#D4AF37",
    eventCategories: ["church"],
    placeCategories: ["church"],
    // Church silhouette with a proper cross (vertical stem + horizontal crossbar).
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21H6a1 1 0 0 1-1-1v-7l7-5 7 5v7a1 1 0 0 1-1 1z"/><path d="M12 2v7"/><path d="M10 4.5h4"/></svg>',
  },
  {
    id: "outreaches",
    label: "Outreach",
    color: "#9B59B6",
    eventCategories: ["community-upliftment"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>',
  },
  {
    id: "entertainment",
    label: "Entertainment",
    color: "#FF6B35",
    eventCategories: ["entertainment"],
    placeCategories: ["arts"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  },
  {
    id: "missional",
    label: "Missional",
    color: "#1ABC9C",
    eventCategories: ["missional"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  },
  {
    id: "couples",
    label: "Couples",
    color: "#E74C3C",
    eventCategories: ["marriage-and-couples"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  },
  {
    id: "mens",
    label: "Mens",
    color: "#34495E",
    eventCategories: ["mens"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="5"/><line x1="19" y1="5" x2="13.65" y2="10.35"/><polyline points="15 5 19 5 19 9"/></svg>',
  },
  {
    id: "womens",
    label: "Womens",
    color: "#F39C12",
    eventCategories: ["womens"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"/><line x1="12" y1="14" x2="12" y2="21"/><line x1="9" y1="18" x2="15" y2="18"/></svg>',
  },
  {
    id: "kids",
    label: "Kids",
    color: "#00BCD4",
    eventCategories: ["kids"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/></svg>',
  },
  {
    id: "recovery",
    label: "Recovery",
    color: "#8E44AD",
    eventCategories: ["recovery"],
    placeCategories: ["health"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
  },
  {
    // Hand-held heart — mirrors the "care" event category marker icon so the
    // quick-access tool, burger category, and map marker share one visual.
    id: "care",
    label: "Care",
    color: "#B59CD9",
    eventCategories: ["care"],
    placeCategories: ["health"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 6.5a3.5 3.5 0 0 0-6 2.4c0 2.7 3.3 5 6 6.6 2.7-1.6 6-3.9 6-6.6a3.5 3.5 0 0 0-6-2.4Z"/><path d="M3 18c1.5-1.5 3.5-2 5.5-2H15a2 2 0 0 1 0 4H9"/></svg>',
  },
  {
    id: "equip",
    label: "Equip",
    color: "#27AE60",
    eventCategories: ["equip"],
    placeCategories: ["education"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  },
  {
    id: "weekend",
    label: "Weekend",
    color: "#FF9800",
    eventCategories: ["weekend"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  },
  {
    id: "members-only",
    label: "Members",
    color: "#212121",
    eventCategories: ["members-only"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  },
  {
    id: "media",
    label: "Media",
    color: "#9B59B6",
    eventCategories: [],
    placeCategories: ["media"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
  },
  {
    id: "shopping",
    label: "Stores",
    color: "#E91E63",
    eventCategories: [],
    placeCategories: ["shopping"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  },
  {
    id: "health",
    label: "Health",
    color: "#E74C3C",
    eventCategories: [],
    placeCategories: ["health"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  },
  {
    id: "arts",
    label: "Arts",
    color: "#FF6B35",
    eventCategories: [],
    placeCategories: ["arts"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  },
];
