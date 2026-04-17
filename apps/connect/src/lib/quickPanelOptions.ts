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
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  },
  {
    id: "coffee",
    label: "Coffee",
    color: "#8B4513",
    eventCategories: ["social-fun"],
    placeCategories: ["relax"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  },
  {
    id: "runs",
    label: "Runs",
    color: "#2ECC71",
    eventCategories: ["sport-fun"],
    placeCategories: ["exercise"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="4" r="2"/><path d="M15.59 13.51l-3.45 4.95L8 15l-4 5"/><path d="M17.64 7.39L20 10l-2 2-3.5-2.5L11 13l-1.5-3L13 7l2.64.39z"/></svg>',
  },
  {
    id: "churches",
    label: "Churches",
    color: "#D4AF37",
    eventCategories: ["church"],
    placeCategories: ["church"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21H6a1 1 0 0 1-1-1v-7l7-5 7 5v7a1 1 0 0 1-1 1z"/><path d="M12 3v5"/><path d="M9 3h6"/></svg>',
  },
  {
    id: "outreaches",
    label: "Outreach",
    color: "#9B59B6",
    eventCategories: ["community-upliftment"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>',
  },
];
