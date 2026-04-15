import type { EventCategory } from "@/types/db";
import type { MarkerType } from "@/types/db";
import { CATEGORY_HEX } from "@/lib/categories";

/* ── Minimal SVG icons per category (monochrome, no emoji) ── */

const CATEGORY_ICONS: Record<EventCategory, string> = {
  // Music note — entertainment covers concerts, arts, performances
  entertainment:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  // Trophy — unambiguous sport / competitive fun
  "sport-fun":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>',
  // Coffee cup — casual social gatherings
  "social-fun":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  // Hands holding (uplift / support) — community outreach
  "community-upliftment":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  // Open book — education / learning
  education:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  // Church building with cross
  church:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21H6a1 1 0 0 1-1-1v-7l7-5 7 5v7a1 1 0 0 1-1 1z"/><path d="M12 3v5"/><path d="M9 3h6"/></svg>',
  // Compass rose — navigation/direction, distinct from globe
  missional:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  // Two interlinked rings — marriage / couples
  "marriage-and-couples":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  // Mars symbol ♂ — circle with upward-right arrow
  mens:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="5"/><line x1="19" y1="5" x2="13.65" y2="10.35"/><polyline points="15 5 19 5 19 9"/></svg>',
  // Venus symbol ♀ — circle with cross below
  womens:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"/><line x1="12" y1="14" x2="12" y2="21"/><line x1="9" y1="18" x2="15" y2="18"/></svg>',
  // 4-point sparkle star — child wonder / playful
  kids:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/></svg>',
  // Refresh / rotate arrows — healing, renewal, recovery
  recovery:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
  // Wrench / tool — equip, training, practical skills
  equip:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  // Calendar — weekend / scheduled event
  weekend:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  // Lock — members only / exclusive access
  "members-only":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

// Generic map-pin fallback for unknown categories
const DEFAULT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

/* ── Temporal encoding ───────────────────────────────────── */

export type TemporalStyle = {
  opacity: number;
  scale: number;
  isLive: boolean;
  isToday: boolean;
  isInSession: boolean;
};

export function getTemporalStyle(
  dateStr: string,
  endDateStr?: string | null
): TemporalStyle {
  const now = Date.now();
  const start = new Date(dateStr).getTime();
  const end = endDateStr
    ? new Date(endDateStr).getTime()
    : start + 2 * 60 * 60 * 1000;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const isToday = start >= todayStart.getTime() && start <= todayEnd.getTime();

  // Live: event has started and not ended
  if (start <= now && end > now) {
    const durationMs = end - start;
    const isInSession = durationMs > 5 * 60 * 60 * 1000; // Over 5 hours
    return { opacity: 1, scale: 1.3, isLive: true, isToday: true, isInSession };
  }

  const abs = Math.abs(start - now);
  const DAY = 86_400_000;

  if (abs < DAY) return { opacity: 1, scale: isToday ? 1.1 : 1, isLive: false, isToday, isInSession: false };
  if (abs < 7 * DAY) return { opacity: 0.9, scale: 0.95, isLive: false, isToday: false, isInSession: false };
  if (abs < 30 * DAY) return { opacity: 0.7, scale: 0.9, isLive: false, isToday: false, isInSession: false };
  if (abs < 90 * DAY) return { opacity: 0.55, scale: 0.85, isLive: false, isToday: false, isInSession: false };
  return { opacity: 0.35, scale: 0.8, isLive: false, isToday: false, isInSession: false };
}

/* ── MapLibre marker element builders ────────────────────── */

const BASE_SIZE = 40;

export function getCategoryIcon(category: EventCategory | null): string {
  return CATEGORY_ICONS[category ?? "church"] ?? DEFAULT_ICON;
}

/**
 * Event marker — category icon on white circle with category-colour border.
 * Slightly larger for prominence on the map.
 */
export function createCategoryMarkerEl(
  category: EventCategory | null,
  temporal: TemporalStyle
): HTMLDivElement {
  const cat = category ?? "church";
  const icon = getCategoryIcon(cat);
  const borderColor = CATEGORY_HEX[cat] ?? "#D4AF37";
  const size = Math.round(BASE_SIZE * temporal.scale);
  const iconSize = Math.round(size * 0.48);

  const el = document.createElement("div");
  el.className = `cc-marker${temporal.isLive ? " cc-marker-live" : ""}${temporal.isToday && !temporal.isLive ? " cc-marker-today" : ""}`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  el.innerHTML = `<span style="
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    background:#fff;
    opacity:${temporal.opacity};
    border-radius:50%;
    border:2px solid ${borderColor};
    box-shadow:0 2px 6px rgba(0,0,0,.25);
    cursor:pointer;
    transition:transform 180ms ease;
  "><span style="
    width:${iconSize}px;height:${iconSize}px;
    color:#111;
    display:flex;align-items:center;justify-content:center;
    line-height:0;
  ">${icon}</span></span>`;

  return el;
}

/**
 * Custom marker — supports profile photo, custom icon/color, and logo image.
 * Falls back to category marker if no custom config.
 */
export function createCustomMarkerEl(
  options: {
    markerType: MarkerType;
    category: EventCategory | null;
    temporal: TemporalStyle;
    markerIcon?: string | null;
    markerColor?: string | null;
    markerImageUrl?: string | null;
    creatorAvatarUrl?: string | null;
  }
): HTMLDivElement {
  const { markerType, category, temporal, markerImageUrl, creatorAvatarUrl } = options;
  const size = Math.round(BASE_SIZE * temporal.scale);

  // Profile photo marker
  if (markerType === "profile" && creatorAvatarUrl) {
    const el = document.createElement("div");
    el.className = `cc-marker${temporal.isLive ? " cc-marker-live" : ""}`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    el.innerHTML = `<span style="
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      opacity:${temporal.opacity};
      border-radius:50%;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.25);
      cursor:pointer;
      overflow:hidden;
    "><img src="${escapeHtml(creatorAvatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" /></span>`;
    return el;
  }

  // Logo marker
  if (markerType === "logo" && markerImageUrl) {
    const el = document.createElement("div");
    el.className = `cc-marker${temporal.isLive ? " cc-marker-live" : ""}`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    el.innerHTML = `<span style="
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      opacity:${temporal.opacity};
      border-radius:50%;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.25);
      cursor:pointer;
      overflow:hidden;
      background:#fff;
    "><img src="${escapeHtml(markerImageUrl)}" alt="" style="width:80%;height:80%;object-fit:contain;" /></span>`;
    return el;
  }

  // Custom icon with color
  if (markerType === "icon" && options.markerIcon) {
    const fillColor = options.markerColor ?? "#D4AF37";
    const iconSvg = CATEGORY_ICONS[options.markerIcon as EventCategory] ?? DEFAULT_ICON;
    const iconSize = Math.round(size * 0.48);

    const el = document.createElement("div");
    el.className = `cc-marker${temporal.isLive ? " cc-marker-live" : ""}`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    el.innerHTML = `<span style="
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      background:#fff;
      opacity:${temporal.opacity};
      border-radius:50%;
      border:2px solid ${escapeHtml(fillColor)};
      box-shadow:0 2px 6px rgba(0,0,0,.25);
      cursor:pointer;
    "><span style="
      width:${iconSize}px;height:${iconSize}px;
      color:${escapeHtml(fillColor)};
      display:flex;align-items:center;justify-content:center;
      line-height:0;
    ">${iconSvg}</span></span>`;
    return el;
  }

  // Default: category marker
  return createCategoryMarkerEl(category, temporal);
}

/**
 * Place marker — gold filled SVG icon with white outline, no bubble/background.
 * Slightly smaller than event markers to avoid hiding events.
 */
export function createPlaceMarkerEl(
  options?: {
    avgRating?: number | null;
    isHighRated?: boolean;
    isFlagged?: boolean;
  }
): HTMLDivElement {
  const size = 36;
  const iconSize = 24;
  const avgRating = options?.avgRating ?? null;
  const isHighRated = options?.isHighRated ?? false;
  const isFlagged = options?.isFlagged ?? false;

  const ratingBadge =
    avgRating != null
      ? `<span style="
        position:absolute;
        right:-7px;
        bottom:-7px;
        min-width:18px;
        height:18px;
        padding:0 4px;
        border-radius:10px;
        background:${isHighRated ? "#D4AF37" : "#111"};
        color:${isHighRated ? "#111" : "#fff"};
        border:1.5px solid #fff;
        font-size:10px;
        font-weight:700;
        display:flex;
        align-items:center;
        justify-content:center;
        line-height:1;
      ">${avgRating.toFixed(1)}</span>`
      : "";

  const warningBadge = isFlagged
    ? `<span style="
      position:absolute;
      left:-8px;
      top:-8px;
      width:18px;
      height:18px;
      border-radius:50%;
      background:#111;
      color:#D4AF37;
      border:1.5px solid #D4AF37;
      font-size:11px;
      font-weight:700;
      display:flex;
      align-items:center;
      justify-content:center;
      line-height:1;
    ">!</span>`
    : "";

  const glow = isHighRated
    ? "drop-shadow(0 0 4px rgba(212,175,55,.5))"
    : "drop-shadow(0 1px 3px rgba(0,0,0,.3))";

  const opacity = isFlagged ? 0.62 : 1;

  const placeIcon =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#3d3d3d" stroke="#D4AF37" stroke-width="2.5"/><circle cx="12" cy="12" r="3.5" fill="#D4AF37"/></svg>';

  const el = document.createElement("div");
  el.className = "cc-marker";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  el.innerHTML = `<span style="
    position:relative;
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    opacity:${opacity};
    cursor:pointer;
    filter:${glow};
  "><span style="
    width:${iconSize}px;height:${iconSize}px;
    display:flex;align-items:center;justify-content:center;
    line-height:0;
  ">${placeIcon}</span>${ratingBadge}${warningBadge}</span>`;

  return el;
}

/** Cluster badge element */
export function createClusterEl(count: number): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "cc-cluster";

  const size = count < 10 ? 36 : count < 100 ? 42 : 48;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  el.innerHTML = `<div style="
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    background:rgba(17,17,17,0.15);
    border-radius:50%;
  "><div style="
    width:${size - 8}px;height:${size - 8}px;
    display:flex;align-items:center;justify-content:center;
    background:#111;
    border-radius:50%;
    border:2px solid #D4AF37;
    color:#D4AF37;
    font-weight:600;
    font-size:13px;
    line-height:1;
    cursor:pointer;
  ">${count}</div></div>`;

  return el;
}

/* ── HTML escaping for popup content ─────────────────────── */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
