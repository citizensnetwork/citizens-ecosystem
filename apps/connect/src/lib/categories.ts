import type { EventCategory } from "@/types/db";

/** Human-readable labels for each event category. */
export const CATEGORY_LABELS: Record<EventCategory, string> = {
  "church-service": "Church Service",
  youth: "Youth",
  "community-outreach": "Community Outreach",
  worship: "Worship Night",
  "bible-study": "Bible Study",
  prayer: "Prayer Meeting",
  social: "Social",
  other: "Other",
};

/** Shortened labels for constrained UI (e.g. cards). */
export const CATEGORY_LABELS_SHORT: Record<EventCategory, string> = {
  "church-service": "Church Service",
  youth: "Youth",
  "community-outreach": "Outreach",
  worship: "Worship",
  "bible-study": "Bible Study",
  prayer: "Prayer",
  social: "Social",
  other: "Other",
};

/** Tailwind class strings for category badges. */
export const CATEGORY_BADGE_CLASSES: Record<EventCategory, string> = {
  "church-service": "bg-[var(--gold-soft)] text-black",
  youth: "bg-[var(--gold-soft)] text-black",
  "community-outreach": "bg-[var(--gold-soft)] text-black",
  worship: "bg-[var(--gold-soft)] text-black",
  "bible-study": "bg-[var(--gold-soft)] text-black",
  prayer: "bg-[var(--gold-soft)] text-black",
  social: "bg-[var(--gold-soft)] text-black",
  other: "bg-black/5 text-black/70",
};

/**
 * Monochrome hex colours for calendar events.
 * Events use a unified dark palette — no rainbow category coding.
 */
export const CATEGORY_COLORS: Record<EventCategory, string> = {
  "church-service": "#1a1a1a",
  youth: "#2d2d2d",
  "community-outreach": "#3a3a3a",
  worship: "#111111",
  "bible-study": "#242424",
  prayer: "#333333",
  social: "#404040",
  other: "#6b7280",
};

/** Selectable list for forms (create / edit). */
export const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "church-service", label: "Church Service" },
  { value: "youth", label: "Youth" },
  { value: "community-outreach", label: "Community Outreach" },
  { value: "worship", label: "Worship Night" },
  { value: "bible-study", label: "Bible Study" },
  { value: "prayer", label: "Prayer Meeting" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];

/** Filter list including "all" sentinel. */
export const CATEGORY_FILTERS: { value: EventCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  ...EVENT_CATEGORIES,
];
