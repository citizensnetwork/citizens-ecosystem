"use client";

import { SlidersHorizontal, X, Check, CalendarDays } from "lucide-react";
import type { EventCategory } from "@/types/db";
import { CATEGORY_LABELS, CATEGORY_HEX } from "@/lib/categories";

type Props = {
  /** All selectable event categories, in display order. */
  categories: EventCategory[];
  activeCategories: Set<EventCategory>;
  onToggleCategory: (cat: EventCategory) => void;
  onClear: () => void;
  weekendOnly: boolean;
  onToggleWeekend: () => void;
  onClose: () => void;
};

/**
 * Glass "Filter Organizations" panel from the Figma design, wired to the real
 * Citizens Connect category filter. Categories drive the live map filter
 * (multi-select); the Weekends-only chip mirrors the existing real toggle.
 */
export default function MapFiltersPanel({
  categories,
  activeCategories,
  onToggleCategory,
  onClear,
  weekendOnly,
  onToggleWeekend,
  onClose,
}: Props) {
  const activeCount = activeCategories.size;

  return (
    <div
      className="cc-glass cc-glass-enter-left pointer-events-auto flex max-h-[min(70vh,560px)] w-80 max-w-[86vw] flex-col rounded-3xl"
      role="dialog"
      aria-label="Filter the map"
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-(--gold)/15 text-(--gold)">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-black">Filter the Map</h2>
          <p className="text-xs text-black/50">Refine by category and timing</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className="flex h-6 w-6 items-center justify-center rounded-full text-black/40 transition hover:bg-black/5 hover:text-black"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 scrollbar-hide">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/45">
          Categories
        </p>
        <div className="flex flex-col gap-0.5">
          {categories.map((cat) => {
            const on = activeCategories.has(cat);
            const hex = CATEGORY_HEX[cat];
            return (
              <button
                key={cat}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggleCategory(cat)}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[0.03]"
              >
                <span
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition"
                  style={{
                    borderColor: on ? hex : "rgba(0,0,0,0.2)",
                    background: on ? hex : "transparent",
                  }}
                >
                  {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </span>
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ background: hex }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-sm text-black">{CATEGORY_LABELS[cat]}</span>
              </button>
            );
          })}
        </div>

        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-black/45">
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
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-black/5 p-3">
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
  );
}
