"use client";

import {
  SlidersHorizontal,
  X,
  CalendarDays,
  TrendingUp,
  Activity,
  Share2,
} from "lucide-react";
import type { EventCategory } from "@/types/db";
import { CATEGORY_LABELS, CATEGORY_HEX } from "@/lib/categories";
import { getEventCategoryIcon } from "@/lib/categoryIcons";
import type { MapLayerKey, MapLayers } from "./mapLayers";

type Props = {
  /** All selectable event categories, in display order. */
  categories: EventCategory[];
  activeCategories: Set<EventCategory>;
  onToggleCategory: (cat: EventCategory) => void;
  /** Per-category event counts (slug → count) for the grid badges. */
  categoryCounts: Record<string, number>;
  onClear: () => void;
  weekendOnly: boolean;
  onToggleWeekend: () => void;
  /** Map visualisation layers, folded into the sheet (Figma has no separate
   *  Layers control). */
  layers: MapLayers;
  onToggleLayer: (key: MapLayerKey) => void;
  onClose: () => void;
};

const LAYER_ROWS: {
  key: MapLayerKey;
  label: string;
  desc: string;
  Icon: typeof TrendingUp;
}[] = [
  { key: "glow", label: "Impact Glow", desc: "Show organization reach", Icon: TrendingUp },
  { key: "pulse", label: "Activity Pulse", desc: "Animated activity rings", Icon: Activity },
  { key: "connections", label: "Connections", desc: "Show collaborations", Icon: Share2 },
];

/** hex → rgba helper for the soft category-tile backgrounds. */
function softBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

/**
 * Figma "Categories" bottom-sheet, wired to the real Citizens Connect filters.
 * Slides up from the bottom on mobile (centres on desktop) over a dimmed
 * backdrop. Multi-select category grid with live per-category counts, a
 * Weekends-only timing chip, and the map-visualisation layers folded in.
 */
export default function MapFiltersPanel({
  categories,
  activeCategories,
  onToggleCategory,
  categoryCounts,
  onClear,
  weekendOnly,
  onToggleWeekend,
  layers,
  onToggleLayer,
  onClose,
}: Props) {
  const activeCount = activeCategories.size;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-1100 flex items-end justify-center bg-black/30 backdrop-blur-sm md:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Filter the map"
      onClick={onClose}
    >
      <div
        className="cc-glass slide-up flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl shadow-2xl md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle (mobile) */}
        <div className="flex justify-center pt-2.5 md:hidden">
          <span className="h-1 w-10 rounded-full bg-black/15" />
        </div>

        <div className="flex items-start gap-3 px-5 pb-3 pt-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-(--gold)/15 text-(--gold)">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight text-black">
              Filter the Map
            </h2>
            <p className="text-xs text-black/50">Refine by category, timing &amp; layers</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-black/45 transition hover:bg-black/10 hover:text-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 scrollbar-hide">
          {/* Category grid */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/45">
            Categories
          </p>
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
            {categories.map((cat) => {
              const on = activeCategories.has(cat);
              const hex = CATEGORY_HEX[cat] ?? "#C9A84C";
              const count = categoryCounts[cat] ?? 0;
              return (
                <button
                  key={cat}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onToggleCategory(cat)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl p-2.5 text-center transition-all duration-200 ${
                    on ? "scale-105 shadow-lg" : "hover:scale-105"
                  }`}
                  style={{
                    background: on ? hex : softBg(hex),
                    color: on ? "#fff" : hex,
                  }}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: getEventCategoryIcon(cat) }}
                  />
                  <span className="text-[9px] font-bold leading-tight">
                    {CATEGORY_LABELS[cat]}
                  </span>
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${
                        on ? "bg-white/20 text-white" : "bg-white/70 text-black/70"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Timing */}
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-black/45">
            Timing
          </p>
          <button
            type="button"
            aria-pressed={weekendOnly}
            onClick={onToggleWeekend}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition"
            style={{
              borderColor: weekendOnly ? "var(--gold)" : "rgba(0,0,0,0.15)",
              background: weekendOnly ? "var(--gold)" : "transparent",
              color: weekendOnly ? "#000" : "rgba(0,0,0,0.7)",
            }}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Weekends only
          </button>

          {/* Map layers (folded in from the old Layers pill) */}
          <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-black/45">
            Map layers
          </p>
          <div className="flex flex-col gap-1">
            {LAYER_ROWS.map(({ key, label, desc, Icon }) => {
              const lon = layers[key];
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-black/[0.03]"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-(--gold)/10 text-(--gold)">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight text-black">{label}</p>
                    <p className="text-xs text-black/45">{desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={lon}
                    aria-label={`${label}: ${lon ? "on" : "off"}`}
                    data-on={lon}
                    onClick={() => onToggleLayer(key)}
                    className="cc-switch"
                  >
                    <span />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-black/5 p-3 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span className="text-xs text-black/45">
            {activeCount === 0 ? "Showing all" : `${activeCount} selected`}
          </span>
          <button
            type="button"
            onClick={onClear}
            disabled={activeCount === 0 && !weekendOnly}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-(--gold) transition hover:bg-(--gold)/10 disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}
