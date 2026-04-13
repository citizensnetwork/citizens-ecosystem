import type { EventCategory } from "@/types/db";

/** Human-readable labels for each event category. */
export const CATEGORY_LABELS: Record<EventCategory, string> = {
  entertainment: "Entertainment",
  "sport-fun": "Sport Fun",
  "social-fun": "Social Fun",
  "community-upliftment": "Community Upliftment",
  education: "Education",
  church: "Church",
  missional: "Missional",
  "marriage-and-couples": "Marriage & Couples",
  mens: "Mens",
  womens: "Womens",
  kids: "Kids",
  recovery: "Recovery",
  equip: "Equip",
  weekend: "Weekend",
  "members-only": "Members Only",
};

/** Shortened labels for constrained UI (e.g. cards). */
export const CATEGORY_LABELS_SHORT: Record<EventCategory, string> = {
  entertainment: "Entertainment",
  "sport-fun": "Sport",
  "social-fun": "Social",
  "community-upliftment": "Upliftment",
  education: "Education",
  church: "Church",
  missional: "Missional",
  "marriage-and-couples": "Couples",
  mens: "Mens",
  womens: "Womens",
  kids: "Kids",
  recovery: "Recovery",
  equip: "Equip",
  weekend: "Weekend",
  "members-only": "Members",
};

/** Hex colour per category — used for calendar, map markers, badges. */
export const CATEGORY_HEX: Record<EventCategory, string> = {
  entertainment: "#FF6B35",
  "sport-fun": "#2ECC71",
  "social-fun": "#E91E63",
  "community-upliftment": "#9B59B6",
  education: "#3498DB",
  church: "#D4AF37",
  missional: "#1ABC9C",
  "marriage-and-couples": "#E74C3C",
  mens: "#34495E",
  womens: "#F39C12",
  kids: "#00BCD4",
  recovery: "#8E44AD",
  equip: "#27AE60",
  weekend: "#FF9800",
  "members-only": "#212121",
};

/** Tailwind class strings for category badges. */
export const CATEGORY_BADGE_CLASSES: Record<EventCategory, string> = {
  entertainment: "bg-[#FF6B35]/15 text-[#c44e1e]",
  "sport-fun": "bg-[#2ECC71]/15 text-[#1e8449]",
  "social-fun": "bg-[#E91E63]/15 text-[#ad1457]",
  "community-upliftment": "bg-[#9B59B6]/15 text-[#7d3c98]",
  education: "bg-[#3498DB]/15 text-[#21618c]",
  church: "bg-[var(--gold-soft)] text-black",
  missional: "bg-[#1ABC9C]/15 text-[#148f77]",
  "marriage-and-couples": "bg-[#E74C3C]/15 text-[#b03a2e]",
  mens: "bg-[#34495E]/15 text-[#2c3e50]",
  womens: "bg-[#F39C12]/15 text-[#b7710c]",
  kids: "bg-[#00BCD4]/15 text-[#00838f]",
  recovery: "bg-[#8E44AD]/15 text-[#6c3483]",
  equip: "bg-[#27AE60]/15 text-[#1e8449]",
  weekend: "bg-[#FF9800]/15 text-[#e65100]",
  "members-only": "bg-[#212121]/10 text-[#212121]",
};

/**
 * Category colours for calendar events.
 * RSVP'd events override to gold at render time.
 */
export const CATEGORY_COLORS: Record<EventCategory, string> = {
  ...CATEGORY_HEX,
};

/** Selectable list for forms (create / edit). */
export const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "entertainment", label: "Entertainment" },
  { value: "sport-fun", label: "Sport Fun" },
  { value: "social-fun", label: "Social Fun" },
  { value: "community-upliftment", label: "Community Upliftment" },
  { value: "education", label: "Education" },
  { value: "church", label: "Church" },
  { value: "missional", label: "Missional" },
  { value: "marriage-and-couples", label: "Marriage & Couples" },
  { value: "mens", label: "Mens" },
  { value: "womens", label: "Womens" },
  { value: "kids", label: "Kids" },
  { value: "recovery", label: "Recovery" },
  { value: "equip", label: "Equip" },
  { value: "weekend", label: "Weekend" },
  { value: "members-only", label: "Members Only" },
];

/** Filter list including "all" sentinel. */
export const CATEGORY_FILTERS: { value: EventCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  ...EVENT_CATEGORIES,
];
