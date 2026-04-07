import type { EventCategory } from "@/types/db";

/* ── Minimal SVG icons per category (monochrome, no emoji) ── */

const CATEGORY_ICONS: Record<EventCategory, string> = {
  "church-service":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21H6a1 1 0 0 1-1-1v-7l7-5 7 5v7a1 1 0 0 1-1 1z"/><path d="M12 3v5"/><path d="M9 3h6"/></svg>',
  youth:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/></svg>',
  "community-outreach":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  worship:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  "bible-study":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  prayer:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>',
  social:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  other:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
};

const DEFAULT_ICON = CATEGORY_ICONS.other;

/* ── Temporal encoding ───────────────────────────────────── */

export type TemporalStyle = {
  opacity: number;
  scale: number;
  isLive: boolean;
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

  if (start <= now && end > now) {
    return { opacity: 1, scale: 1.3, isLive: true };
  }

  const abs = Math.abs(start - now);
  const DAY = 86_400_000;

  if (abs < DAY) return { opacity: 1, scale: 1, isLive: false };
  if (abs < 7 * DAY) return { opacity: 0.9, scale: 0.95, isLive: false };
  if (abs < 30 * DAY) return { opacity: 0.7, scale: 0.9, isLive: false };
  if (abs < 90 * DAY) return { opacity: 0.55, scale: 0.85, isLive: false };
  return { opacity: 0.35, scale: 0.8, isLive: false };
}

/* ── MapLibre marker element builders ────────────────────── */

const BASE_SIZE = 36;

export function getCategoryIcon(category: EventCategory | null): string {
  return CATEGORY_ICONS[category ?? "other"] ?? DEFAULT_ICON;
}

/**
 * Event marker — gold icon on white circle with black outline.
 * Mature monochrome design; category distinguished only by icon shape.
 */
export function createCategoryMarkerEl(
  category: EventCategory | null,
  temporal: TemporalStyle
): HTMLDivElement {
  const icon = getCategoryIcon(category);
  const size = Math.round(BASE_SIZE * temporal.scale);
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
    border:2px solid #111;
    box-shadow:0 2px 6px rgba(0,0,0,.25);
    cursor:pointer;
    transition:transform 180ms ease;
  "><span style="
    width:${iconSize}px;height:${iconSize}px;
    color:#D4AF37;
    display:flex;align-items:center;justify-content:center;
    line-height:0;
  ">${icon}</span></span>`;

  return el;
}

/**
 * Place marker — black icon on gold rounded-square with black outline.
 * Distinguished from events by shape (square vs circle) and color inversion.
 */
export function createPlaceMarkerEl(
  _emoji: string,
  _color: string,
  options?: {
    avgRating?: number | null;
    isHighRated?: boolean;
    isFlagged?: boolean;
  }
): HTMLDivElement {
  const size = 34;
  const iconSize = 16;
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
    ? "0 0 0 4px rgba(212,175,55,.32), 0 2px 8px rgba(0,0,0,.25)"
    : "0 2px 6px rgba(0,0,0,.25)";

  const opacity = isFlagged ? 0.62 : 1;

  const placeIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  const el = document.createElement("div");
  el.className = "cc-marker";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  el.innerHTML = `<span style="
    position:relative;
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    background:#D4AF37;
    border-radius:8px;
    border:2px solid #111;
    box-shadow:${glow};
    opacity:${opacity};
    cursor:pointer;
  "><span style="
    width:${iconSize}px;height:${iconSize}px;
    color:#111;
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
