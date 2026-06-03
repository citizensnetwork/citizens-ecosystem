"use client";

import type { ReactNode } from "react";
import { Menu, Search, X, Sparkles, CalendarDays, Map as MapIcon, SlidersHorizontal, Layers } from "lucide-react";

type Props = {
  brand: string;
  tagline: string;
  onBrandClick?: () => void;

  onMenuClick: () => void;
  menuOpen: boolean;

  search: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  searchPlaceholder?: string;
  /** Figma-styled results dropdown rendered under the input when searching. */
  resultsSlot?: ReactNode;

  /** NotificationBell, rendered only when signed in. */
  bell?: ReactNode;
  showPersonalize?: boolean;
  onPersonalize?: () => void;

  calendarOpen: boolean;
  onToggleCalendar: () => void;

  filtersOpen: boolean;
  onToggleFilters: () => void;
  layersOpen: boolean;
  onToggleLayers: () => void;
};

/**
 * Floating glass header for the Community Map (Figma: "Glassmorphism Community
 * Map"). Renders the brand mark + tagline, an integrated search bar wired to
 * the live map filter, and the Filters / Layers control pills. All actions map
 * to the existing Citizens Connect map behaviour.
 */
export default function GlassMapHeader({
  brand,
  tagline,
  onBrandClick,
  onMenuClick,
  menuOpen,
  search,
  onSearchChange,
  onSearchClear,
  onSearchFocus,
  onSearchBlur,
  searchPlaceholder = "Search organisations, events, or causes…",
  resultsSlot,
  bell,
  showPersonalize,
  onPersonalize,
  calendarOpen,
  onToggleCalendar,
  filtersOpen,
  onToggleFilters,
  layersOpen,
  onToggleLayers,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-1000 p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2.5">
        {/* Brand + search card */}
        <div className="cc-glass pointer-events-auto rounded-3xl p-2.5 sm:p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={onMenuClick}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-black/70 transition hover:bg-black/5 active:scale-95"
              >
                <Menu className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={onBrandClick}
                className="flex min-w-0 items-center gap-2.5 rounded-xl pr-2 text-left transition active:scale-[0.98]"
              >
                <span className="cc-hex-logo flex h-9 w-9 flex-shrink-0 items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold leading-tight text-black sm:text-base">
                    {brand}
                  </span>
                  <span className="hidden truncate text-[11px] leading-tight text-black/50 sm:block">
                    {tagline}
                  </span>
                </span>
              </button>
            </div>

            <div className="flex flex-shrink-0 items-center gap-1.5">
              {bell && (
                <div className="flex h-10 items-center rounded-full px-1">{bell}</div>
              )}
              {showPersonalize && (
                <button
                  type="button"
                  onClick={onPersonalize}
                  aria-label="Personalise your feed"
                  title="Tell us about you"
                  className="flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-black/5 active:scale-95"
                >
                  <span
                    className="text-xl font-extrabold leading-none"
                    style={{
                      background:
                        "linear-gradient(135deg, #ff4d4d 0%, #ffb400 25%, #3dd598 50%, #2f80ed 75%, #9b51e0 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    ?
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={onToggleCalendar}
                aria-label="Toggle calendar view"
                aria-pressed={calendarOpen}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-(--gold) transition hover:bg-black/5 active:scale-95"
              >
                {calendarOpen ? <MapIcon className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-2.5">
            <div className="flex items-center gap-2 rounded-2xl bg-black/[0.04] px-3.5 py-2.5">
              <Search className="h-4 w-4 flex-shrink-0 text-black/40" />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={onSearchFocus}
                onBlur={onSearchBlur}
                placeholder={searchPlaceholder}
                aria-label="Search the map"
                className="min-w-0 flex-1 bg-transparent text-sm text-black outline-none placeholder:text-black/40"
              />
              {search && (
                <button
                  type="button"
                  onClick={onSearchClear}
                  aria-label="Clear search"
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-black/40 transition hover:bg-black/10 hover:text-black"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {resultsSlot}
          </div>
        </div>

        {/* Filters / Layers control pills */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onToggleFilters}
            aria-pressed={filtersOpen}
            className="cc-glass pointer-events-auto flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium text-black transition active:scale-95"
            style={filtersOpen ? { background: "rgba(201, 168, 76,0.16)" } : undefined}
          >
            <SlidersHorizontal className="h-4 w-4 text-(--gold)" />
            Filters
          </button>
          <button
            type="button"
            onClick={onToggleLayers}
            aria-pressed={layersOpen}
            className="cc-glass pointer-events-auto flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium text-black transition active:scale-95"
            style={layersOpen ? { background: "rgba(201, 168, 76,0.16)" } : undefined}
          >
            <Layers className="h-4 w-4 text-(--gold)" />
            Layers
          </button>
        </div>
      </div>
    </div>
  );
}
