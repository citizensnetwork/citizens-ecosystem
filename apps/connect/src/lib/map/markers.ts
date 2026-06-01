import type { EventCategory, PlaceCategory } from "@/types/db";
import type { MarkerType } from "@/types/db";
import { CATEGORY_HEX, PLACE_CATEGORY_HEX } from "@/lib/categories";
import { getEventCategoryIcon, getPlaceCategoryIcon } from "@/lib/categoryIcons";

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

  // Brightness is now constant at full opacity — users preferred the
  // "illuminous" look of the bright-flash state over time-decayed icons.
  // Scale still encodes temporal proximity (today/week/month) so time is
  // communicated by size, not dimness.
  if (abs < DAY) return { opacity: 1, scale: isToday ? 1.1 : 1, isLive: false, isToday, isInSession: false };
  if (abs < 7 * DAY) return { opacity: 1, scale: 0.95, isLive: false, isToday: false, isInSession: false };
  if (abs < 30 * DAY) return { opacity: 1, scale: 0.9, isLive: false, isToday: false, isInSession: false };
  if (abs < 90 * DAY) return { opacity: 1, scale: 0.85, isLive: false, isToday: false, isInSession: false };
  return { opacity: 1, scale: 0.8, isLive: false, isToday: false, isInSession: false };
}

/* ── MapLibre marker element builders ────────────────────── */

// Event marker base diameter in CSS pixels.  Reduced from 40→32 (−20%)
// on 2026-04-23 to lower visual dominance on the map.  Markers reveal
// progressively on zoom-in (dot → mid → full) rather than being grouped
// into counted bubbles.
const BASE_SIZE = 32;

export function getCategoryIcon(category: EventCategory | null): string {
  return getEventCategoryIcon(category ?? "church-services");
}

/**
 * Event marker — category icon on white circle with category-colour border.
 * Slightly larger for prominence on the map.
 */
export function createCategoryMarkerEl(
  category: EventCategory | null,
  temporal: TemporalStyle,
  overrideColor?: string
): HTMLDivElement {
  const cat = category ?? "church-services";
  const icon = getCategoryIcon(cat);
  // Events read as GOLD (places are black) so type is instant; the category is
  // still conveyed by the glyph and the category-tinted pulse (--cc-pulse-color).
  const borderColor = overrideColor ?? "#D4AF37";
  const pulseColor = CATEGORY_HEX[cat] ?? "#D4AF37";
  const size = Math.round(BASE_SIZE * temporal.scale);
  const iconSize = Math.round(size * 0.48);

  const el = document.createElement("div");
  el.className = `cc-marker${temporal.isLive ? " cc-marker-live" : ""}`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  el.innerHTML = `<span class="cc-marker-outer" style="
    --cc-marker-color:${borderColor};
    --cc-pulse-color:${pulseColor};
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    background:#fff;
    opacity:${temporal.opacity};
    border-radius:50%;
    border:2px solid ${borderColor};
    box-shadow:0 2px 6px rgba(0,0,0,.25);
    cursor:pointer;
    transition:transform 180ms ease;
  "><span class="cc-marker-icon" style="
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
    /** Colour used when dot-mode kicks in at far zoom. Defaults to category hex. */
    overrideColor?: string;
  }
): HTMLDivElement {
  const { markerType, category, temporal, markerImageUrl, creatorAvatarUrl } = options;
  const size = Math.round(BASE_SIZE * temporal.scale);
  // Events read as GOLD across every marker variant (matches
  // createCategoryMarkerEl) so type is instant on the map; the category is
  // carried by the category-tinted pulse (--cc-pulse-color), not the ring.
  // A quick-tool override colour still wins for the ring + dot when set.
  const ringColor = options.overrideColor ?? "#D4AF37";
  const categoryPulse = CATEGORY_HEX[category ?? "church-services"] ?? "#D4AF37";

  // Profile photo marker
  if (markerType === "profile" && creatorAvatarUrl) {
    const el = document.createElement("div");
    el.className = `cc-marker${temporal.isLive ? " cc-marker-live" : ""}`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    el.innerHTML = `<span class="cc-marker-outer" style="
      --cc-marker-color:${ringColor};
      --cc-pulse-color:${categoryPulse};
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      opacity:${temporal.opacity};
      border-radius:50%;
      border:2px solid ${ringColor};
      box-shadow:0 2px 6px rgba(0,0,0,.25);
      cursor:pointer;
      overflow:hidden;
      background:#fff;
    "><img class="cc-marker-icon" src="${escapeHtml(creatorAvatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" /></span>`;
    return el;
  }

  // Logo marker
  if (markerType === "logo" && markerImageUrl) {
    const el = document.createElement("div");
    el.className = `cc-marker${temporal.isLive ? " cc-marker-live" : ""}`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    el.innerHTML = `<span class="cc-marker-outer" style="
      --cc-marker-color:${ringColor};
      --cc-pulse-color:${categoryPulse};
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      opacity:${temporal.opacity};
      border-radius:50%;
      border:2px solid ${ringColor};
      box-shadow:0 2px 6px rgba(0,0,0,.25);
      cursor:pointer;
      overflow:hidden;
      background:#fff;
    "><img class="cc-marker-icon" src="${escapeHtml(markerImageUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" /></span>`;
    return el;
  }

  // Custom icon with color
  if (markerType === "icon" && options.markerIcon) {
    const fillColor = options.markerColor ?? "#D4AF37";
    const iconSvg = getEventCategoryIcon(options.markerIcon as EventCategory);
    const iconSize = Math.round(size * 0.48);

    const el = document.createElement("div");
    el.className = `cc-marker${temporal.isLive ? " cc-marker-live" : ""}`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    el.innerHTML = `<span class="cc-marker-outer" style="
      --cc-marker-color:${ringColor};
      --cc-pulse-color:${escapeHtml(fillColor)};
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      background:#fff;
      opacity:${temporal.opacity};
      border-radius:50%;
      border:2px solid ${ringColor};
      box-shadow:0 2px 6px rgba(0,0,0,.25);
      cursor:pointer;
    "><span class="cc-marker-icon" style="
      width:${iconSize}px;height:${iconSize}px;
      color:${escapeHtml(fillColor)};
      display:flex;align-items:center;justify-content:center;
      line-height:0;
    ">${iconSvg}</span></span>`;
    return el;
  }

  // Default: category marker
  return createCategoryMarkerEl(category, temporal, options.overrideColor);
}

/** Place marker sizing — exported so EventMap can use the same values for
 * zoom-scaling the inner icon proportionally to the outer circle. */
// Reduced from 40→32 / 54→44 / 24→20 / 32→26 (−20%) on 2026-04-23 so place
// markers stay visually balanced against the now-smaller event markers.
export const PLACE_MARKER_SIZE = 32;
export const PLACE_MARKER_SIZE_HIGHLIGHTED = 44;
export const PLACE_ICON_SIZE = 20;
export const PLACE_ICON_SIZE_HIGHLIGHTED = 26;
export const PLACE_ICON_RATIO = PLACE_ICON_SIZE / PLACE_MARKER_SIZE;

/**
 * Place marker — minimalist solid-gold category icon with white outline.
 * Slightly smaller than event markers to avoid hiding events.
 */
export function createPlaceMarkerEl(
  options?: {
    avgRating?: number | null;
    isHighRated?: boolean;
    isFlagged?: boolean;
    highlighted?: boolean;
    highlightColor?: string;
    category?: string | null;
  }
): HTMLDivElement {
  const highlighted = options?.highlighted ?? false;
  const size = highlighted ? PLACE_MARKER_SIZE_HIGHLIGHTED : PLACE_MARKER_SIZE;
  const iconSize = highlighted ? PLACE_ICON_SIZE_HIGHLIGHTED : PLACE_ICON_SIZE;
  const avgRating = options?.avgRating ?? null;
  const isHighRated = options?.isHighRated ?? false;
  const isFlagged = options?.isFlagged ?? false;
  const category = options?.category ?? null;

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

  // Place markers keep a subtle 1px drop-shadow only — never the halo/glow
  // rectangles that previously surrounded highlighted or high-rated icons,
  // which read as "blocks around the place icons" on the map.
  const glow = "drop-shadow(0 1px 1px rgba(0,0,0,.25))";

  const opacity = 1;

  // Solid gold category glyph — white stroke provides the outline against the map
  const icon = getPlaceCategoryIcon(category as PlaceCategory | null);

  // Places read as BLACK (events are gold). Category still drives the pulse
  // tint and the icon colour when a place-category filter highlights it.
  const pulseColor =
    (category ? PLACE_CATEGORY_HEX[category as PlaceCategory] : undefined) ?? "#D4AF37";
  const dotColor = options?.highlightColor ?? "#111";

  const el = document.createElement("div");
  el.className = "cc-marker cc-place-marker";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  el.innerHTML = `<span class="cc-marker-outer" style="
    --cc-marker-color:${dotColor};
    --cc-pulse-color:${pulseColor};
    position:relative;
    width:${size}px;height:${size}px;
    display:flex;align-items:center;justify-content:center;
    opacity:${opacity};
    cursor:pointer;
    filter:${glow};
  "><span class="cc-marker-icon" style="
    width:${iconSize}px;height:${iconSize}px;
    display:flex;align-items:center;justify-content:center;
    line-height:0;
    color:${escapeHtml(dotColor)};
    stroke:#ffffff;
    stroke-width:1.2px;
    paint-order:stroke fill;
  ">${icon}</span>${ratingBadge}${warningBadge}</span>`;

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
