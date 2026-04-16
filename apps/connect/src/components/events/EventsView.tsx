"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Event, EventCategory, PlaceCategory, Place } from "@/types/db";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_LABELS, CATEGORY_BADGE_CLASSES, CATEGORY_HEX, PLACE_CATEGORY_KEYWORDS } from "@/lib/categories";
import { share } from "@/lib/capacitor/share";
import { useBurgerMenuData } from "@/hooks/useBurgerMenuData";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import BurgerMenu from "./BurgerMenu";
import EventCalendar from "./EventCalendar";
import FeaturedPanel from "./FeaturedPanel";
import NotificationBell from "@/components/notifications/NotificationBell";
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

/** Number of event cards shown per page in the category panel. */
const CARDS_PER_PAGE = 3;

/** Convert hex colour to rgba string (used for category panel card backgrounds). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function EventsView({
  events,
  places = [],
  isVendor = false,
}: Props) {
  const searchParams = useSearchParams();
  const initialView = searchParams.get("view") === "calendar" ? "calendar" : "map";
  const [view, setView] = useState<"map" | "calendar">(initialView);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    new Set()
  );
  const [activePlaceCategories, setActivePlaceCategories] = useState<Set<PlaceCategory>>(
    new Set()
  );

  // Category panel state (shows when categories are selected)
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [categoryPanelPage, setCategoryPanelPage] = useState(0);

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  // User state for auth section in burger menu
  const [user, setUser] = useState<User | null>(null);
  const [rsvpEventIds, setRsvpEventIds] = useState<Set<string>>(new Set());
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const panelSwipeStartY = useRef(0);
  const router = useRouter();

  // Lock document scroll while the full-screen map view is mounted.
  // Without this, any focus() call on an off-screen element (e.g. the
  // featured panel while it is still translated off-screen) can scroll the
  // page and push the map out of view.
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current!;
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        supabase
          .from("rsvps")
          .select("event_id")
          .eq("user_id", user.id)
          .then(({ data }) => {
            if (data) setRsvpEventIds(new Set(data.map((r) => r.event_id)));
          });
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setRsvpEventIds(new Set());
    });
    return () => subscription.unsubscribe();
  }, []);

  const displayName =
    user?.user_metadata?.full_name?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "Account";

  // Focus traps for drawers
  const burgerRef = useFocusTrap<HTMLElement>(filtersOpen);
  const featuredRef = useFocusTrap<HTMLElement>(featuredOpen && !selectedEvent && !selectedPlace);

  // Escape key closes drawers and detail panels
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (filtersOpen) { setFiltersOpen(false); return; }
      if (featuredOpen) { setFeaturedOpen(false); return; }
      if (selectedEvent || selectedPlace) { setSelectedEvent(null); setSelectedPlace(null); }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [filtersOpen, featuredOpen, selectedEvent, selectedPlace]);

  // Burger menu social data — load eagerly so trending data is available for the panel
  const {
    trending,
    favouriteOrgs,
    friends,
    profile: menuProfile,
    loading: menuLoading,
  } = useBurgerMenuData(user?.id ?? null, true);

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

  // Auto-open category panel when categories are selected; close when all deselected
  useEffect(() => {
    if (activeCategories.size > 0) {
      setCategoryPanelOpen(true);
      setCategoryPanelPage(0);
    } else {
      setCategoryPanelOpen(false);
    }
  }, [activeCategories]);

  function togglePlaceCategory(cat: PlaceCategory) {
    setActivePlaceCategories((prev) => {
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

      // Filter by place category keywords if any place categories are active
      if (activePlaceCategories.size > 0) {
        const text = `${p.name} ${p.description} ${p.address} ${p.categories?.name ?? ""}`.toLowerCase();
        const matchesPlaceCat = [...activePlaceCategories].some((cat) =>
          PLACE_CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))
        );
        if (!matchesPlaceCat) return false;
      }

      return matchesSearch;
    });
  }, [places, search, activePlaceCategories]);

  const handleSelectEvent = useCallback(
    (event: Event) => {
      setSelectedPlace(null);
      setSelectedEvent(event);
      setFeaturedOpen(false);
    },
    []
  );

  const handleQuickAction = useCallback(
    async (action: "view" | "join" | "share" | "consider" | "visit", event: Event) => {
      try {
        switch (action) {
          case "view":
            router.push(`/events/${event.id}`);
            break;
          case "join": {
            const res = await fetch("/api/rsvp", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_id: event.id }),
            });
            if (res.status === 401) { router.push("/login"); return; }
            if (res.ok) {
              setRsvpEventIds((prev) => new Set([...prev, event.id]));
            }
            break;
          }
          case "share": {
            const eventUrl = `${window.location.origin}/events/${event.id}`;
            await share({ title: event.title, url: eventUrl });
            break;
          }
          case "consider": {
            const res = await fetch("/api/consider", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_id: event.id }),
            });
            if (res.status === 401) router.push("/login");
            break;
          }
          case "visit":
            if (event.website_url && /^https?:\/\//i.test(event.website_url)) {
              window.open(event.website_url, "_blank", "noopener,noreferrer");
            }
            break;
        }
      } catch {
        /* network error — fail silently for quick actions */
      }
    },
    [router]
  );

  const handleSelectPlace = useCallback((place: Place) => {
    setSelectedEvent(null);
    setSelectedPlace(place);
    setFeaturedOpen(false);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedEvent(null);
    setSelectedPlace(null);
  }, []);

  // City search / geocoding state
  const [mapFlyTo, setMapFlyTo] = useState<[number, number] | null>(null);
  const [mapFlyToZoom, setMapFlyToZoom] = useState<number | undefined>(undefined);

  // "Citizens Connect" chip → zoom to all of South Africa
  function handleBrandClick() {
    // South Africa center, zoom 5.5 shows full country
    setMapFlyTo([-28.7, 25.5]);
    setMapFlyToZoom(5.5);
    if (view !== "map") setView("map");
  }

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
        setMapFlyToZoom(undefined); // let EventMap use its default
      }
    } catch {
      /* geocoding failed — ignore */
    }
  }

  // Close glance panel when detail opens
  const hasDetail = selectedEvent || selectedPlace;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-(--surface)">
      {/* Map is always rendered so it shows through transparent calendar */}
      <div className={`absolute inset-0${view === "calendar" ? " pointer-events-none" : ""}`}>
        <EventMap
          events={filtered}
          places={filteredPlaces}
          onSelectPlace={handleSelectPlace}
          onQuickAction={handleQuickAction}
          autoLocate
          flyTo={mapFlyTo}
          flyToZoom={mapFlyToZoom}
          activeCategories={activeCategories}
          activePlaceCategories={activePlaceCategories}
        />
      </div>

      {view === "calendar" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
          <div className="glass-calendar-overlay mx-3 my-4 flex h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden sm:mx-5 sm:my-6 sm:h-[calc(100dvh-3rem)]">
            <div
              className="flex-1 overflow-auto touch-pan-x touch-pan-y touch-pinch-zoom px-4 pb-4 pt-20 sm:px-6 sm:pt-20"
            >
              <EventCalendar
                events={filtered}
                rsvpEventIds={rsvpEventIds}
                onSelectEvent={handleSelectEvent}
                isVendor={isVendor}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Floating top bar ────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-1000 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          <input
            type="search"
            aria-label="Search events, places, or city"
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
                className="rounded-xl border border-black/10 bg-white/95 px-3 py-2 shadow-lg backdrop-blur transition-all active:scale-95 active:brightness-90 hover:bg-white"
                aria-label="Toggle menu"
                aria-expanded={filtersOpen}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={handleBrandClick}
                className="rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-sm font-semibold tracking-tight text-(--gold) shadow-lg backdrop-blur transition-all active:scale-95 active:brightness-90 sm:text-base"
              >
                Citizens Connect
              </button>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              {user && (
                <div className="rounded-xl border border-black/10 bg-white/95 p-1 shadow-lg backdrop-blur">
                  <NotificationBell userId={user.id} />
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setMapFlyTo(null);
                  setMapFlyToZoom(undefined);
                  setView((v) => (v === "map" ? "calendar" : "map"));
                }}
                className="rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-sm font-medium shadow-lg backdrop-blur transition-all active:scale-95 active:brightness-90 hover:bg-white"
                aria-label="Toggle view mode"
              >
                {view === "map" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-(--gold)"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Trending panel open button (only when panel is closed and no category selected) ────── */}
      {!hasDetail && !featuredOpen && activeCategories.size === 0 && (
        <button
          type="button"
          onClick={() => setFeaturedOpen(true)}
          className="absolute bottom-0 left-1/2 z-1005 -translate-x-1/2 rounded-t-xl border border-b-0 border-(--gold)/20 bg-white/20 px-4 py-1.5 text-xs font-bold tracking-wider text-black shadow-lg backdrop-blur transition-all active:scale-95 hover:bg-white/30"
          aria-label="Open trending panel"
        >
          <span className="text-[10px]">TRENDING</span>
        </button>
      )}

      {/* ── Trending panel slide-up from bottom ────────── */}
      <aside
        ref={featuredRef}
        role="dialog"
        aria-label="Trending content"
        className={`absolute inset-x-0 bottom-0 z-1004 flex h-[45dvh] flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
          featuredOpen && !hasDetail && activeCategories.size === 0 ? "translate-y-0" : "translate-y-full"
        }`}
        onTouchStart={(e) => { panelSwipeStartY.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          if (e.changedTouches[0].clientY - panelSwipeStartY.current > 60) setFeaturedOpen(false);
        }}
      >
        {/* Title bar */}
        <div className="flex-shrink-0 rounded-t-2xl bg-white/20 backdrop-blur-md">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setFeaturedOpen(false)}
              aria-label="Close trending panel"
              className="flex cursor-pointer items-center justify-center px-8 py-1.5 active:scale-95"
            >
              <span className="block h-1 w-12 rounded-full bg-white/60 transition-colors hover:bg-white/80" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 px-4 pb-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-(--gold)">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
              <polyline points="16 7 22 7 22 13"/>
            </svg>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-black">
              Trending
            </h2>
          </div>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto bg-white/20 backdrop-blur-md">
          <FeaturedPanel
            trendingEvents={trending}
            onSelectEvent={handleSelectEvent}
            onSelectPlace={handleSelectPlace}
            onQuickAction={handleQuickAction}
            fallbackEvents={filtered}
          />
        </div>
      </aside>

      {/* ── Category selection panel (when categories are active) ── */}
      {activeCategories.size > 0 && !hasDetail && (
        <>
          {/* Re-open tab when panel is collapsed */}
          {!categoryPanelOpen && (
            <button
              type="button"
              onClick={() => setCategoryPanelOpen(true)}
              className="absolute bottom-0 left-1/2 z-1005 -translate-x-1/2 rounded-t-xl border border-b-0 px-5 py-2 text-xs font-bold tracking-wider shadow-lg backdrop-blur transition-all active:scale-95 hover:brightness-110"
              style={{
                borderColor: `${CATEGORY_HEX[[...activeCategories][0]]}60`,
                background: `${CATEGORY_HEX[[...activeCategories][0]]}dd`,
                color: "#fff",
              }}
              aria-label="Re-open category panel"
            >
              <span className="text-[10px]">
                {activeCategories.size === 1
                  ? CATEGORY_LABELS[[...activeCategories][0]]
                  : `${activeCategories.size} Categories`}
              </span>
            </button>
          )}

          <aside
            className={`absolute inset-x-0 bottom-0 z-1004 flex flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
              categoryPanelOpen ? "translate-y-0" : "translate-y-full"
            }`}
            aria-label="Category filter results"
          >
            {/* Category title bar */}
            <div
              className="flex-shrink-0 rounded-t-2xl"
              style={{
                background: activeCategories.size === 1
                  ? `${CATEGORY_HEX[[...activeCategories][0]]}f0`
                  : "rgba(17,17,17,0.92)",
              }}
            >
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setCategoryPanelOpen(false)}
                  aria-label="Collapse category panel"
                  className="flex cursor-pointer items-center justify-center px-8 py-3 active:scale-95"
                >
                  <span className="block h-1.5 w-16 rounded-full bg-white/50 transition-colors hover:bg-white/70" />
                </button>
              </div>
              <div className="flex items-center justify-between px-4 pb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
                    Category
                  </p>
                  <h2 className="text-sm font-bold text-white">
                    {activeCategories.size === 1
                      ? CATEGORY_LABELS[[...activeCategories][0]]
                      : `${activeCategories.size} Categories Selected`}
                  </h2>
                </div>
                <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white">
                  {filtered.length} event{filtered.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Horizontal swipeable event cards */}
            <div className="bg-black/85 backdrop-blur-md pb-4">
              {filtered.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-white/50">
                  No events found
                </div>
              ) : (
                <div className="relative px-10 py-3">
                  {/* Left arrow */}
                  <button
                    type="button"
                    onClick={() => setCategoryPanelPage((p) => Math.max(0, p - 1))}
                    disabled={categoryPanelPage === 0}
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition disabled:opacity-25 hover:bg-white/20"
                    aria-label="Previous events"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>

                  {/* Cards row — CARDS_PER_PAGE per page */}
                  <div className="overflow-hidden">
                    <div
                      className="flex gap-3 transition-transform duration-300"
                      style={{ transform: `translateX(calc(-${categoryPanelPage * 100}% - ${categoryPanelPage * 12}px))` }}
                    >
                      {filtered.map((event) => {
                        const cat = (event.category ?? "church") as EventCategory;
                        const hex = CATEGORY_HEX[cat] ?? "#D4AF37";
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => handleSelectEvent(event)}
                            className="flex-shrink-0 w-[calc(33.333%-8px)] min-w-[140px] rounded-xl border border-white/15 p-2.5 text-left transition-all active:scale-[0.97] hover:brightness-110"
                            style={{
                              background: hexToRgba(hex, 0.35),
                            }}
                          >
                            <div
                              className="mb-1 h-0.5 w-8 rounded-full"
                              style={{ background: hex }}
                            />
                            <h3 className="text-xs font-semibold leading-tight text-white line-clamp-2">
                              {event.title}
                            </h3>
                            <p className="mt-1 text-[10px] text-white/65 line-clamp-1">
                              {event.location}
                            </p>
                            <p className="mt-0.5 text-[10px] text-white/50">
                              {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right arrow */}
                  <button
                    type="button"
                    onClick={() => setCategoryPanelPage((p) => Math.min(Math.ceil(filtered.length / CARDS_PER_PAGE) - 1, p + 1))}
                    disabled={categoryPanelPage >= Math.ceil(filtered.length / CARDS_PER_PAGE) - 1}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition disabled:opacity-25 hover:bg-white/20"
                    aria-label="Next events"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

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
        activePlaceCategories={activePlaceCategories}
        onTogglePlaceCategory={togglePlaceCategory}
        onClearPlaceCategories={() => setActivePlaceCategories(new Set())}
        trending={trending}
        favouriteOrgs={favouriteOrgs}
        friends={friends}
        menuProfile={menuProfile}
        menuLoading={menuLoading}
        onSelectEvent={handleSelectEvent}
        filteredCount={filtered.length}
        filteredPlacesCount={filteredPlaces.length}
        onLogout={handleLogout}
      />

      {/* ── Detail panel (event or place) ───────────────── */}
      {hasDetail && (
        <>
          <div
            className="absolute inset-0 z-1003 bg-black/20 sm:bg-transparent"
            onClick={closeDetail}
          />
          <aside className="fade-rise absolute bottom-0 right-0 z-1004 w-full max-h-[78dvh] overflow-y-auto bg-white/85 p-5 shadow-2xl backdrop-blur-md sm:top-0 sm:max-h-full sm:h-full sm:w-96 sm:border-l sm:border-black/10">
            <button
              type="button"
              onClick={closeDetail}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-black/60 hover:bg-black/5"
              aria-label="Close detail"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            {selectedEvent && (
              <div className="space-y-3 pt-2">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_BADGE_CLASSES[selectedEvent.category ?? "church"]}`}>
                  {CATEGORY_LABELS[selectedEvent.category ?? "church"]}
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
                  {selectedEvent.location}
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
                    {selectedPlace.categories.name}
                  </span>
                )}
                <h2 className="text-lg font-bold text-black">
                  {selectedPlace.name}
                </h2>
                <p className="text-sm text-black/70">
                  {selectedPlace.address}
                </p>
                {selectedPlace.phone && (
                  <p className="text-sm text-black/70">
                    {selectedPlace.phone}
                  </p>
                )}
                {selectedPlace.avg_rating != null && (
                  <p className="text-sm text-black/70">
                    {selectedPlace.avg_rating.toFixed(1)} / 5
                    {selectedPlace.reviews_count != null &&
                      ` · ${selectedPlace.reviews_count} review${selectedPlace.reviews_count !== 1 ? "s" : ""}`}
                  </p>
                )}
                {selectedPlace.verification_flagged && (
                  <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                    Possibly closed - awaiting owner verification
                  </p>
                )}
                {selectedPlace.website && /^https?:\/\//i.test(selectedPlace.website) && (
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
