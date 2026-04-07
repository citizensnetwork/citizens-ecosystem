import type { EventCategory } from "@/types/db";

/* ── Category colours & emoji ────────────────────────────── */

const CATEGORY_CONFIG: Record<
  EventCategory,
  { color: string; emoji: string }
> = {
  "church-service": { color: "#6366f1", emoji: "⛪" }, // indigo
  youth: { color: "#f59e0b", emoji: "🌟" }, // amber
  "community-outreach": { color: "#10b981", emoji: "🤝" }, // emerald
  worship: { color: "#D4AF37", emoji: "🎵" }, // brand gold
  "bible-study": { color: "#8b5cf6", emoji: "📖" }, // violet
  prayer: { color: "#ec4899", emoji: "🙏" }, // pink
  social: { color: "#06b6d4", emoji: "☕" }, // cyan
  other: { color: "#6b7280", emoji: "📌" }, // gray
};

const DEFAULT_CONFIG = CATEGORY_CONFIG.other;

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

export function getCategoryConfig(category: EventCategory | null) {
  return CATEGORY_CONFIG[category ?? "other"] ?? DEFAULT_CONFIG;
}

export function createCategoryMarkerEl(
  category: EventCategory | null,
  temporal: TemporalStyle
): HTMLDivElement {
  const { color, emoji } = getCategoryConfig(category);
  const size = Math.round(BASE_SIZE * temporal.scale);

  const el = document.createElement("div");
  el.className = `cc-marker${temporal.isLive ? " cc-marker-live" : ""}`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  el.innerHTML = `<span style="
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    background:${color};
    opacity:${temporal.opacity};
    border-radius:50%;
    border:2.5px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,.35);
    font-size:${Math.round(size * 0.48)}px;
    line-height:1;
    cursor:pointer;
    transition:transform 180ms ease;
  ">${emoji}</span>`;

  return el;
}

/** Place marker — always full opacity, square-ish with rounded corners */
export function createPlaceMarkerEl(
  emoji: string,
  color: string,
  options?: {
    avgRating?: number | null;
    isHighRated?: boolean;
    isFlagged?: boolean;
  }
): HTMLDivElement {
  const size = 34;
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
      background:#f59e0b;
      color:#111;
      border:1.5px solid #fff;
      font-size:11px;
      font-weight:700;
      display:flex;
      align-items:center;
      justify-content:center;
      line-height:1;
    ">!</span>`
    : "";

  const glow = isHighRated
    ? "0 0 0 4px rgba(212,175,55,.32), 0 2px 8px rgba(0,0,0,.35)"
    : "0 2px 6px rgba(0,0,0,.35)";

  const opacity = isFlagged ? 0.62 : 1;
  const lineDecoration = isFlagged ? "line-through" : "none";

  const el = document.createElement("div");
  el.className = "cc-marker";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  el.innerHTML = `<span style="
    position:relative;
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    background:${color};
    border-radius:8px;
    border:2.5px solid #fff;
    box-shadow:${glow};
    opacity:${opacity};
    font-size:16px;
    line-height:1;
    cursor:pointer;
    text-decoration:${lineDecoration};
  ">${emoji}${ratingBadge}${warningBadge}</span>`;

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
    background:rgba(212,175,55,0.3);
    border-radius:50%;
  "><div style="
    width:${size - 8}px;height:${size - 8}px;
    display:flex;align-items:center;justify-content:center;
    background:#D4AF37;
    border-radius:50%;
    color:#111;
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
