"use client";

import type { ReactNode } from "react";
import { Search, X, SlidersHorizontal, User } from "lucide-react";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  searchPlaceholder?: string;
  /** Figma-styled results dropdown rendered under the input when searching. */
  resultsSlot?: ReactNode;

  /** Filters bottom-sheet (categories + timing). */
  filtersOpen: boolean;
  onToggleFilters: () => void;
  /** Number of active filters — shows a small gold badge on the Filters tile. */
  filterCount?: number;

  /** Profile avatar tile (Figma top-bar). Opens the user's profile. */
  avatarUrl?: string | null;
  avatarInitial?: string;
  onAvatarClick?: () => void;
};

/**
 * Floating glass header for the Community Map (Figma "Glassmorphism Community
 * Map" / Home). Matches the current Figma map exactly: a single row of
 * `[search] [filter] [avatar]`. Brand, navigation, notifications and calendar
 * all live in the global app shell (sidebar + bottom nav), so they are NOT
 * duplicated here.
 */
export default function GlassMapHeader({
  search,
  onSearchChange,
  onSearchClear,
  onSearchFocus,
  onSearchBlur,
  searchPlaceholder = "Search organisations, events, or causes…",
  resultsSlot,
  filtersOpen,
  onToggleFilters,
  filterCount = 0,
  avatarUrl,
  avatarInitial = "?",
  onAvatarClick,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-1000 p-3 sm:p-4">
      <div className="mx-auto w-full max-w-5xl">
        {/* Search + Filters + Avatar row (Figma: [search] [filter] [avatar]) */}
        <div className="flex items-stretch gap-2">
          <div className="relative min-w-0 flex-1">
            <div className="cc-glass pointer-events-auto flex h-full items-center gap-2 rounded-2xl px-3.5 py-3">
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

          <button
            type="button"
            onClick={onToggleFilters}
            aria-label="Filter the map"
            aria-pressed={filtersOpen}
            className="cc-glass pointer-events-auto relative flex w-12 flex-shrink-0 items-center justify-center rounded-2xl text-black/60 transition active:scale-95"
            style={
              filtersOpen || filterCount > 0
                ? { background: "rgba(201, 168, 76,0.16)", color: "var(--gold)" }
                : undefined
            }
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--gold) px-1 text-[9px] font-bold text-black shadow">
                {filterCount > 9 ? "9+" : filterCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onAvatarClick}
            aria-label="Your profile"
            title="Your profile"
            className="cc-glass pointer-events-auto flex w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl text-black/60 ring-1 ring-(--gold)/30 transition hover:ring-(--gold)/60 active:scale-95"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : avatarInitial && avatarInitial !== "?" ? (
              <span className="text-sm font-bold uppercase text-black/70">{avatarInitial}</span>
            ) : (
              <User className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
