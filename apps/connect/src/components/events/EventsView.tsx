"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Event, EventCategory, Place } from "@/types/db";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_LABELS, CATEGORY_BADGE_CLASSES } from "@/lib/categories";
import { share } from "@/lib/capacitor/share";
import { useBurgerMenuData } from "@/hooks/useBurgerMenuData";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import BurgerMenu from "./BurgerMenu";
import EventCalendar from "./EventCalendar";
import FeaturedPanel from "./FeaturedPanel";
import PostEventPrompt from "@/components/reviews/PostEventPrompt";
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

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  // User state for auth section in burger menu
  const [user, setUser] = useState<User | null>(null);
  const [rsvpEventIds, setRsvpEventIds] = useState<Set<string>>(new Set());
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const panelSwipeStartY = useRef(0);
  const router = useRouter();

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
      {view === "map" && (
        <EventMap
          events={filtered}
          places={filteredPlaces}
          onSelectPlace={handleSelectPlace}
          onQuickAction={handleQuickAction}
          autoLocate
          flyTo={mapFlyTo}
          flyToZoom={mapFlyToZoom}
        />
      )}

      {view === "calendar" && (
        <div className="h-full overflow-y-auto bg-(--surface) px-3 pb-6 pt-28 sm:px-5 sm:pt-24">
          <div className="mx-auto max-w-6xl">
            <PostEventPrompt />
            <EventCalendar
              events={filtered}
              rsvpEventIds={rsvpEventIds}
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

      {/* ── Featured panel open button (only when panel is closed) ────── */}
      {!hasDetail && !featuredOpen && (
        <button
          type="button"
          onClick={() => setFeaturedOpen(true)}
          className="absolute bottom-0 left-1/2 z-1005 -translate-x-1/2 rounded-t-xl border border-b-0 border-(--gold)/30 bg-black/90 px-5 py-2 text-xs font-bold tracking-wider text-(--gold) shadow-lg backdrop-blur transition-all active:scale-95 hover:bg-black"
          aria-label="Open featured panel"
        >
          <span className="text-[10px]">FEATURED</span>
        </button>
      )}

      {/* ── Featured panel slide-up from bottom ────────── */}
      <aside
        ref={featuredRef}
        role="dialog"
        aria-label="Featured content"
        className={`absolute inset-x-0 bottom-0 z-1004 flex h-[45dvh] flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
          featuredOpen && !hasDetail ? "translate-y-0" : "translate-y-full"
        }`}
        onTouchStart={(e) => { panelSwipeStartY.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          if (e.changedTouches[0].clientY - panelSwipeStartY.current > 60) setFeaturedOpen(false);
        }}
      >
        {/* Title bar — solid white, 100% opacity */}
        <div className="flex-shrink-0 rounded-t-2xl bg-white shadow-sm">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setFeaturedOpen(false)}
              aria-label="Close featured panel"
              className="flex cursor-pointer items-center justify-center px-8 py-3 active:scale-95"
            >
              <span className="block h-1.5 w-16 rounded-full border border-(--gold)/50 bg-black transition-colors hover:bg-black/70" />
            </button>
          </div>
          {/* Centred title */}
          <div className="flex items-center justify-center px-4 pb-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-black/70">
              Featured
            </h2>
          </div>
        </div>
        {/* Scrollable content — semi-transparent so map shows through */}
        <div className="flex-1 overflow-y-auto bg-white/30 backdrop-blur-sm">
          <FeaturedPanel
            onSelectEvent={handleSelectEvent}
            onSelectPlace={handleSelectPlace}
            fallbackEvents={filtered}
          />
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
        onLogout={handleLogout}
      />

      {/* ── Detail panel (event or place) ───────────────── */}
      {hasDetail && (
        <>
          <div
            className="absolute inset-0 z-1003 bg-black/20 sm:bg-transparent"
            onClick={closeDetail}
          />
          <aside className="fade-rise absolute bottom-0 right-0 z-1004 w-full max-h-[78dvh] overflow-y-auto bg-white/96 p-5 shadow-2xl backdrop-blur sm:top-0 sm:max-h-full sm:h-full sm:w-96 sm:border-l sm:border-black/10">
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
