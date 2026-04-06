"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Event, EventCategory, Place } from "@/types/db";
import { createClient } from "@/lib/supabase/client";
import { useBurgerMenuData } from "@/hooks/useBurgerMenuData";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import BurgerMenu from "./BurgerMenu";
import EventCalendar from "./EventCalendar";
import EventFeed from "./EventFeed";
import PostEventPrompt from "@/components/reviews/PostEventPrompt";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";

const EventMap = dynamic(() => import("@/components/map/EventMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

type Props = {
  events: Event[];
  places?: Place[];
  isVendor?: boolean;
};

export default function EventsView({
  events,
  places = [],
  isVendor = false,
}: Props) {
  const [view, setView] = useState<"map" | "calendar">("map");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [glanceOpen, setGlanceOpen] = useState(false);
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    new Set()
  );

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  // User state for auth section in burger menu
  const [user, setUser] = useState<User | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const router = useRouter();

  useEffect(() => {
    const supabase = supabaseRef.current!;
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const displayName =
    user?.user_metadata?.full_name?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "Account";

  // Focus traps for drawers
  const burgerRef = useFocusTrap<HTMLElement>(filtersOpen);
  const glanceRef = useFocusTrap<HTMLElement>(glanceOpen && !selectedEvent && !selectedPlace);

  // Escape key closes drawers and detail panels
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (filtersOpen) { setFiltersOpen(false); return; }
      if (glanceOpen) { setGlanceOpen(false); return; }
      if (selectedEvent || selectedPlace) { setSelectedEvent(null); setSelectedPlace(null); }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [filtersOpen, glanceOpen, selectedEvent, selectedPlace]);

  // Burger menu social data (lazy-loaded)
  const {
    trending,
    favouriteOrgs,
    friends,
    profile: menuProfile,
    loading: menuLoading,
  } = useBurgerMenuData(user?.id ?? null, filtersOpen);

  async function handleLogout() {
    await supabaseRef.current!.auth.signOut();
    setUser(null);
    setFiltersOpen(false);
    router.refresh();
  }

  function toggleCategory(cat: EventCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  const filtered = useMemo(() => {
    return events.filter((e) => {
      const matchesCategory =
        activeCategories.size === 0 ||
        (e.category != null && activeCategories.has(e.category));
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [events, search, activeCategories]);

  const filteredPlaces = useMemo(() => {
    const q = search.toLowerCase();
    return places.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [places, search]);

  const handleSelectEvent = useCallback(
    (event: Event) => {
      setSelectedPlace(null);
      setSelectedEvent(event);
      setGlanceOpen(false);
    },
    []
  );

  const handleSelectPlace = useCallback((place: Place) => {
    setSelectedEvent(null);
    setSelectedPlace(place);
    setGlanceOpen(false);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedEvent(null);
    setSelectedPlace(null);
  }, []);

  // City search / geocoding state
  const [mapFlyTo, setMapFlyTo] = useState<[number, number] | null>(null);

  async function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !search.trim() || view !== "map") return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}&limit=1`,
        { headers: { "User-Agent": "CitizensConnect/1.0" } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setMapFlyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      }
    } catch {
      /* geocoding failed — ignore */
    }
  }

  // Close glance panel when detail opens
  const hasDetail = selectedEvent || selectedPlace;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-(--surface)">
      {view === "map" && (
        <EventMap
          events={filtered}
          places={filteredPlaces}
          onSelectEvent={handleSelectEvent}
          onSelectPlace={handleSelectPlace}
          autoLocate
          flyTo={mapFlyTo}
        />
      )}
      {view === "calendar" && (
        <div className="h-full overflow-y-auto bg-(--surface) px-3 pb-6 pt-22 sm:px-5">
          <div className="mx-auto max-w-6xl">
            <PostEventPrompt />
            <EventCalendar
              events={filtered}
              onSelectEvent={handleSelectEvent}
              isVendor={isVendor}
            />
          </div>
        </div>
      )}

      {/* ── Floating top bar ────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-1000 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          <input
            type="search"
            placeholder="Search events or places — Enter to jump to city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pointer-events-auto w-full rounded-2xl border border-black/12 bg-white/95 px-4 py-2.5 text-sm shadow-lg outline-none backdrop-blur focus:border-black/30"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                className="rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-base shadow-lg backdrop-blur transition hover:bg-white"
                aria-label="Toggle menu"
                aria-expanded={filtersOpen}
              >
                ☰
              </button>
              <div className="rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-sm font-semibold tracking-tight text-black shadow-lg backdrop-blur sm:text-base">
                Citizens Connect
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setView((v) => (v === "map" ? "calendar" : "map"))
              }
              className="pointer-events-auto rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-sm font-medium text-black shadow-lg backdrop-blur transition hover:bg-white"
              aria-label="Toggle view mode"
            >
              {view === "map" ? "📅" : "🗺"}
            </button>
          </div>
        </div>
      </div>

      {/* ── "Events at a Glance" right-edge button ──────── */}
      {!hasDetail && (
        <button
          type="button"
          onClick={() => setGlanceOpen((o) => !o)}
          className="absolute right-0 top-1/2 z-1000 -translate-y-1/2 rounded-l-xl border border-r-0 border-black/10 bg-white/95 px-1.5 py-4 text-xs text-black/60 shadow-lg backdrop-blur transition hover:bg-white hover:text-black"
          aria-label={glanceOpen ? "Close events list" : "Events at a glance"}
        >
          {glanceOpen ? "▶" : "◀"}
        </button>
      )}

      {/* ── "Events at a Glance" slide-out panel ────────── */}
      <aside
        ref={glanceRef}
        role="dialog"
        aria-label="Events at a glance"
        className={`absolute right-0 top-0 z-999 flex h-full w-[84vw] max-w-sm flex-col bg-white/96 shadow-2xl backdrop-blur transition-transform duration-300 sm:w-96 ${
          glanceOpen && !hasDetail ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/8 px-4 py-3 pt-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-black/70">
            Events at a Glance
          </h2>
          <button
            type="button"
            onClick={() => setGlanceOpen(false)}
            className="rounded-lg px-2 py-1 text-black/60 hover:bg-black/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <EventFeed events={filtered} onSelectEvent={handleSelectEvent} />
        </div>
      </aside>

      {/* ── Burger Menu ──────────────────────────────── */}
      <BurgerMenu
        ref={burgerRef}
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        user={user}
        displayName={displayName}
        activeCategories={activeCategories}
        onToggleCategory={toggleCategory}
        onClearCategories={() => setActiveCategories(new Set())}
        trending={trending}
        favouriteOrgs={favouriteOrgs}
        friends={friends}
        menuProfile={menuProfile}
        menuLoading={menuLoading}
        onSelectEvent={handleSelectEvent}
        filteredCount={filtered.length}
        filteredPlacesCount={filteredPlaces.length}
        isVendor={isVendor}
        onLogout={handleLogout}
      />

      {/* ── Detail panel (event or place) ───────────────── */}
      {hasDetail && (
        <>
          <div
            className="absolute inset-0 z-1003 bg-black/20 sm:bg-transparent"
            onClick={closeDetail}
          />
          <aside className="fade-rise absolute bottom-0 right-0 z-1004 w-full bg-white/96 p-5 shadow-2xl backdrop-blur sm:top-0 sm:h-full sm:w-96 sm:border-l sm:border-black/10">
            <button
              type="button"
              onClick={closeDetail}
              className="absolute right-3 top-3 rounded-lg px-2 py-1 text-black/60 hover:bg-black/5"
              aria-label="Close detail"
            >
              ✕
            </button>

            {selectedEvent && (
              <div className="space-y-3 pt-2">
                <span className="inline-block rounded-full bg-(--gold-soft) px-2.5 py-0.5 text-xs font-semibold text-(--foreground-soft)">
                  {selectedEvent.category ?? "other"}
                </span>
                <h2 className="text-lg font-bold text-black">
                  {selectedEvent.title}
                </h2>
                <p className="text-sm text-black/70">
                  {new Date(selectedEvent.date).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-sm text-black/70">
                  📍 {selectedEvent.location}
                </p>
                <p className="text-sm leading-relaxed text-black/80">
                  {selectedEvent.description}
                </p>
                <Link
                  href={`/events/${selectedEvent.id}`}
                  className="mt-2 inline-block rounded-xl bg-(--gold) px-4 py-2 text-sm font-semibold text-black"
                >
                  View Details →
                </Link>
              </div>
            )}

            {selectedPlace && (
              <div className="space-y-3 pt-2">
                {selectedPlace.categories && (
                  <span className="inline-block rounded-full bg-(--gold-soft) px-2.5 py-0.5 text-xs font-semibold text-(--foreground-soft)">
                    {selectedPlace.categories.emoji}{" "}
                    {selectedPlace.categories.name}
                  </span>
                )}
                <h2 className="text-lg font-bold text-black">
                  {selectedPlace.name}
                </h2>
                <p className="text-sm text-black/70">
                  📍 {selectedPlace.address}
                </p>
                {selectedPlace.phone && (
                  <p className="text-sm text-black/70">
                    📞 {selectedPlace.phone}
                  </p>
                )}
                {selectedPlace.avg_rating != null && (
                  <p className="text-sm text-black/70">
                    ⭐ {selectedPlace.avg_rating.toFixed(1)} / 5
                    {selectedPlace.reviews_count != null &&
                      ` · ${selectedPlace.reviews_count} review${selectedPlace.reviews_count !== 1 ? "s" : ""}`}
                  </p>
                )}
                {selectedPlace.verification_flagged && (
                  <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                    Possibly closed - awaiting owner verification
                  </p>
                )}
                {selectedPlace.website && (
                  <a
                    href={selectedPlace.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-(--gold) underline"
                  >
                    Visit website
                  </a>
                )}
                <p className="text-sm leading-relaxed text-black/80">
                  {selectedPlace.description}
                </p>
                <Link
                  href={`/places/${selectedPlace.id}`}
                  className="mt-2 inline-block rounded-xl bg-(--gold) px-4 py-2 text-sm font-semibold text-black"
                >
                  View Details →
                </Link>
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
