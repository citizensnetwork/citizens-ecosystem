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

/** South African provinces for calendar filter. */
const SA_PROVINCES = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
];

/** Convert hex colour to rgba string (used for category panel card backgrounds). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Quick access tool definitions — SVG icons, colour, and matching categories. */
type QuickAccessItem = {
  id: string;
  label: string;
  color: string;
  eventCategories: EventCategory[];
  placeCategories: PlaceCategory[];
  svg: string;
};

const QUICK_ACCESS_ITEMS: QuickAccessItem[] = [
  {
    id: "bible-study",
    label: "Bible Study",
    color: "#FF6B35",
    eventCategories: ["education"],
    placeCategories: ["education"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  },
  {
    id: "coffee",
    label: "Coffee",
    color: "#8B4513",
    eventCategories: ["social-fun"],
    placeCategories: ["relax"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  },
  {
    id: "runs",
    label: "Runs",
    color: "#2ECC71",
    eventCategories: ["sport-fun"],
    placeCategories: ["exercise"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="4" r="2"/><path d="M15.59 13.51l-3.45 4.95L8 15l-4 5"/><path d="M17.64 7.39L20 10l-2 2-3.5-2.5L11 13l-1.5-3L13 7l2.64.39z"/></svg>',
  },
  {
    id: "churches",
    label: "Churches",
    color: "#D4AF37",
    eventCategories: ["church"],
    placeCategories: ["church"],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21H6a1 1 0 0 1-1-1v-7l7-5 7 5v7a1 1 0 0 1-1 1z"/><path d="M12 3v5"/><path d="M9 3h6"/></svg>',
  },
  {
    id: "outreaches",
    label: "Outreach",
    color: "#9B59B6",
    eventCategories: ["community-upliftment"],
    placeCategories: [],
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>',
  },
];

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

  // Quick access state — only one at a time; null = none selected
  const [activeQuickAccess, setActiveQuickAccess] = useState<string | null>(null);
  // Derived: quick-access panel open state (auto-opens when quick access selected)
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [quickPanelPage, setQuickPanelPage] = useState(0);

  // Province filter for calendar view
  const [calendarProvince, setCalendarProvince] = useState("");

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  // User state for auth section in burger menu
  const [user, setUser] = useState<User | null>(null);
  const [rsvpEventIds, setRsvpEventIds] = useState<Set<string>>(new Set());
  const [considerVersion, setConsiderVersion] = useState(0);
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
    // Clear quick access when using regular category toggle
    if (activeQuickAccess) {
      setActiveQuickAccess(null);
      setQuickPanelOpen(false);
    }
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

  // Quick-access toggle: sets both event + place categories, clears regular selections
  function toggleQuickAccess(itemId: string) {
    if (activeQuickAccess === itemId) {
      // Deselect
      setActiveQuickAccess(null);
      setActiveCategories(new Set());
      setActivePlaceCategories(new Set());
      setQuickPanelOpen(false);
    } else {
      const item = QUICK_ACCESS_ITEMS.find((i) => i.id === itemId);
      if (!item) return;
      setActiveQuickAccess(itemId);
      setActiveCategories(new Set(item.eventCategories));
      setActivePlaceCategories(new Set(item.placeCategories));
      setQuickPanelOpen(true);
      setQuickPanelPage(0);
    }
  }

  // Active quick-access item (derived for convenience)
  const activeQuickItem = QUICK_ACCESS_ITEMS.find((i) => i.id === activeQuickAccess) ?? null;

  // Quick-access filtered events (both event + place items merged for the panel)
  const quickFilteredEvents = useMemo(() => {
    if (!activeQuickItem) return [];
    const cats = new Set(activeQuickItem.eventCategories);
    return events.filter((e) => e.category != null && cats.has(e.category));
  }, [events, activeQuickItem]);

  const quickFilteredPlaces = useMemo(() => {
    if (!activeQuickItem) return [];
    return places.filter((p) => {
      const text = `${p.name} ${p.description} ${p.address} ${p.categories?.name ?? ""}`.toLowerCase();
      return activeQuickItem.placeCategories.some((cat) =>
        PLACE_CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))
      );
    });
  }, [places, activeQuickItem]);

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

  // Calendar province-filtered events (applies province filter on top of category/search filter)
  const calendarEvents = useMemo(() => {
    if (!calendarProvince) return filtered;
    const prov = calendarProvince.toLowerCase();
    return filtered.filter((e) => e.location.toLowerCase().includes(prov));
  }, [filtered, calendarProvince]);

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
            if (res.ok) setConsiderVersion((v) => v + 1);
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
          markerOverrideColor={activeQuickItem?.color}
        />
      </div>

      {view === "calendar" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
          <div className="glass-calendar-overlay mx-3 my-4 flex h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden sm:mx-5 sm:my-6 sm:h-[calc(100dvh-3rem)]">
            {/* Province filter bar */}
            <div className="flex items-center gap-2 px-4 pt-16 pb-2 sm:px-6 sm:pt-16">
              <label htmlFor="province-filter" className="sr-only">Filter by province</label>
              <select
                id="province-filter"
                value={calendarProvince}
                onChange={(e) => setCalendarProvince(e.target.value)}
                className="rounded-xl border border-black/12 bg-white/80 px-3 py-1.5 text-xs font-medium text-black shadow-sm backdrop-blur-sm outline-none focus:border-(--gold)"
              >
                <option value="">All Provinces</option>
                {SA_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {calendarProvince && (
                <button
                  type="button"
                  onClick={() => setCalendarProvince("")}
                  className="rounded-lg px-2 py-1 text-[10px] font-medium text-black/50 transition hover:bg-black/5 hover:text-black/70"
                >
                  Clear
                </button>
              )}
              <span className="ml-auto text-[10px] text-black/40">
                {calendarEvents.length} event{calendarEvents.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div
              className="flex-1 overflow-auto touch-pan-x touch-pan-y touch-pinch-zoom px-4 pb-4 sm:px-6"
            >
              <EventCalendar
                events={calendarEvents}
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

      {/* ── Quick access tools (glass-like row below top bar) ── */}
      {view === "map" && (
        <div className="pointer-events-none absolute inset-x-0 top-[108px] z-999 flex justify-center px-3 sm:top-[116px] sm:px-4">
          <div className="pointer-events-auto flex items-center gap-2">
            {QUICK_ACCESS_ITEMS.map((item) => {
              const isActive = activeQuickAccess === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleQuickAccess(item.id)}
                  className="group flex h-9 w-9 items-center justify-center rounded-full shadow-md backdrop-blur-sm transition-all active:scale-90"
                  style={{
                    background: isActive ? hexToRgba(item.color, 0.25) : "rgba(192,192,192,0.80)",
                    border: isActive ? `2px solid ${item.color}` : "1px solid rgba(0,0,0,0.08)",
                  }}
                  aria-label={item.label}
                  aria-pressed={isActive}
                  title={item.label}
                >
                  <span
                    className="flex h-4 w-4 items-center justify-center"
                    style={{ color: isActive ? item.color : "rgba(30,30,30,0.7)" }}
                    dangerouslySetInnerHTML={{ __html: item.svg }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* ── Trending panel open button (only when panel is closed and no category selected) ────── */}
      {!hasDetail && !featuredOpen && activeCategories.size === 0 && !activeQuickAccess && (
        <button
          type="button"
          onClick={() => setFeaturedOpen(true)}
          className="absolute bottom-0 left-1/2 z-1005 -translate-x-1/2 rounded-t-xl border border-b-0 border-(--gold)/20 bg-white/20 px-4 py-1.5 text-xs font-bold tracking-wider text-(--gold) shadow-lg backdrop-blur transition-all active:scale-95 hover:bg-white/30"
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
          featuredOpen && !hasDetail && activeCategories.size === 0 && !activeQuickAccess ? "translate-y-0" : "translate-y-full"
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
            <h2 className="text-xs font-semibold uppercase tracking-widest text-(--gold)">
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

      {/* ── Category selection panel (when categories are active via burger menu, not quick access) ── */}
      {activeCategories.size > 0 && !hasDetail && !activeQuickAccess && (
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
            className={`absolute inset-x-0 bottom-0 z-1004 flex h-[45dvh] flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
              categoryPanelOpen ? "translate-y-0" : "translate-y-full"
            }`}
            aria-label="Category filter results"
            onTouchStart={(e) => { panelSwipeStartY.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              if (e.changedTouches[0].clientY - panelSwipeStartY.current > 60) setCategoryPanelOpen(false);
            }}
          >
            {/* Category title bar — same dimensions as trending, category-coloured */}
            <div
              className="flex-shrink-0 rounded-t-2xl backdrop-blur-md"
              style={{
                background: activeCategories.size === 1
                  ? hexToRgba(CATEGORY_HEX[[...activeCategories][0]], 0.6)
                  : "rgba(17,17,17,0.6)",
              }}
            >
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setCategoryPanelOpen(false)}
                  aria-label="Collapse category panel"
                  className="flex cursor-pointer items-center justify-center px-8 py-1.5 active:scale-95"
                >
                  <span className="block h-1 w-12 rounded-full bg-white/60 transition-colors hover:bg-white/80" />
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 px-4 pb-2">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-white">
                  {activeCategories.size === 1
                    ? CATEGORY_LABELS[[...activeCategories][0]]
                    : `${activeCategories.size} Categories Selected`}
                </h2>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {filtered.length}
                </span>
              </div>
            </div>

            {/* Horizontal swipeable event cards — category-coloured translucent background */}
            <div
              className="flex-1 overflow-y-auto backdrop-blur-md pb-4"
              style={{
                background: activeCategories.size === 1
                  ? hexToRgba(CATEGORY_HEX[[...activeCategories][0]], 0.6)
                  : "rgba(17,17,17,0.6)",
              }}
            >
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
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition disabled:opacity-25 hover:bg-white/20"
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
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition disabled:opacity-25 hover:bg-white/20"
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

      {/* ── Quick access panel (when quick-access tool is selected) ── */}
      {activeQuickItem && !hasDetail && (
        <>
          {/* Re-open tab when panel is collapsed */}
          {!quickPanelOpen && (
            <button
              type="button"
              onClick={() => setQuickPanelOpen(true)}
              className="absolute bottom-0 left-1/2 z-1005 -translate-x-1/2 rounded-t-xl border border-b-0 px-5 py-2 text-xs font-bold tracking-wider shadow-lg backdrop-blur transition-all active:scale-95 hover:brightness-110"
              style={{
                borderColor: `${activeQuickItem.color}60`,
                background: `${activeQuickItem.color}dd`,
                color: "#fff",
              }}
              aria-label={`Re-open ${activeQuickItem.label} panel`}
            >
              <span className="text-[10px]">{activeQuickItem.label}</span>
            </button>
          )}

          <aside
            className={`absolute inset-x-0 bottom-0 z-1004 flex h-[45dvh] flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
              quickPanelOpen ? "translate-y-0" : "translate-y-full"
            }`}
            aria-label={`${activeQuickItem.label} filter results`}
            onTouchStart={(e) => { panelSwipeStartY.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              if (e.changedTouches[0].clientY - panelSwipeStartY.current > 60) setQuickPanelOpen(false);
            }}
          >
            {/* Title bar — same as trending dimensions, quick-item coloured */}
            <div
              className="flex-shrink-0 rounded-t-2xl backdrop-blur-md"
              style={{ background: hexToRgba(activeQuickItem.color, 0.6) }}
            >
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setQuickPanelOpen(false)}
                  aria-label={`Collapse ${activeQuickItem.label} panel`}
                  className="flex cursor-pointer items-center justify-center px-8 py-1.5 active:scale-95"
                >
                  <span className="block h-1 w-12 rounded-full bg-white/60 transition-colors hover:bg-white/80" />
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 px-4 pb-2">
                <span
                  className="flex h-4 w-4 items-center justify-center text-white"
                  dangerouslySetInnerHTML={{ __html: activeQuickItem.svg }}
                />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-white">
                  {activeQuickItem.label}
                </h2>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {quickFilteredEvents.length + quickFilteredPlaces.length}
                </span>
              </div>
            </div>

            {/* Scrollable cards — quick-item coloured translucent background */}
            <div
              className="flex-1 overflow-y-auto backdrop-blur-md pb-4"
              style={{ background: hexToRgba(activeQuickItem.color, 0.6) }}
            >
              {quickFilteredEvents.length === 0 && quickFilteredPlaces.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-white/50">
                  No items found
                </div>
              ) : (
                <div className="relative px-10 py-3">
                  {/* Left arrow */}
                  <button
                    type="button"
                    onClick={() => setQuickPanelPage((p) => Math.max(0, p - 1))}
                    disabled={quickPanelPage === 0}
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition disabled:opacity-25 hover:bg-white/20"
                    aria-label="Previous items"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>

                  {/* Cards row */}
                  <div className="overflow-hidden">
                    <div
                      className="flex gap-3 transition-transform duration-300"
                      style={{ transform: `translateX(calc(-${quickPanelPage * 100}% - ${quickPanelPage * 12}px))` }}
                    >
                      {/* Event cards */}
                      {quickFilteredEvents.map((event) => (
                        <button
                          key={`e-${event.id}`}
                          type="button"
                          onClick={() => handleSelectEvent(event)}
                          className="flex-shrink-0 w-[calc(33.333%-8px)] min-w-[140px] rounded-xl border border-white/15 p-2.5 text-left transition-all active:scale-[0.97] hover:brightness-110"
                          style={{ background: hexToRgba(activeQuickItem.color, 0.35) }}
                        >
                          <div
                            className="mb-1 h-0.5 w-8 rounded-full"
                            style={{ background: activeQuickItem.color }}
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
                      ))}
                      {/* Place cards */}
                      {quickFilteredPlaces.map((place) => (
                        <button
                          key={`p-${place.id}`}
                          type="button"
                          onClick={() => handleSelectPlace(place)}
                          className="flex-shrink-0 w-[calc(33.333%-8px)] min-w-[140px] rounded-xl border border-white/15 p-2.5 text-left transition-all active:scale-[0.97] hover:brightness-110"
                          style={{ background: hexToRgba(activeQuickItem.color, 0.25) }}
                        >
                          <div
                            className="mb-1 h-0.5 w-8 rounded-full bg-white/40"
                          />
                          <h3 className="text-xs font-semibold leading-tight text-white line-clamp-2">
                            {place.name}
                          </h3>
                          <p className="mt-1 text-[10px] text-white/65 line-clamp-1">
                            {place.address}
                          </p>
                          <p className="mt-0.5 text-[10px] text-white/50">
                            Place
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right arrow */}
                  <button
                    type="button"
                    onClick={() => setQuickPanelPage((p) => Math.min(Math.ceil((quickFilteredEvents.length + quickFilteredPlaces.length) / CARDS_PER_PAGE) - 1, p + 1))}
                    disabled={quickPanelPage >= Math.ceil((quickFilteredEvents.length + quickFilteredPlaces.length) / CARDS_PER_PAGE) - 1}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition disabled:opacity-25 hover:bg-white/20"
                    aria-label="Next items"
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
        onClearCategories={() => { setActiveCategories(new Set()); setActiveQuickAccess(null); setQuickPanelOpen(false); }}
        activePlaceCategories={activePlaceCategories}
        onTogglePlaceCategory={togglePlaceCategory}
        onClearPlaceCategories={() => { setActivePlaceCategories(new Set()); setActiveQuickAccess(null); setQuickPanelOpen(false); }}
        trending={trending}
        favouriteOrgs={favouriteOrgs}
        friends={friends}
        menuProfile={menuProfile}
        menuLoading={menuLoading}
        onSelectEvent={handleSelectEvent}
        filteredCount={filtered.length}
        filteredPlacesCount={filteredPlaces.length}
        onLogout={handleLogout}
        considerVersion={considerVersion}
      />

      {/* ── Detail panel (event or place) ───────────────── */}
      {hasDetail && (
        <>
          <div
            className="absolute inset-0 z-1003 bg-black/40"
            role="presentation"
            onClick={closeDetail}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={selectedEvent ? selectedEvent.title : selectedPlace?.name ?? "Details"}
            className="fade-rise absolute inset-0 z-1004 flex items-center justify-center p-4 sm:p-8 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md max-h-[80dvh] overflow-y-auto rounded-2xl bg-white/90 p-5 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={closeDetail}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-black/60 hover:bg-black/5"
              aria-label="Close detail"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            {selectedEvent && (
              <div className="space-y-2 pt-1">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_BADGE_CLASSES[selectedEvent.category ?? "church"]}`}>
                  {CATEGORY_LABELS[selectedEvent.category ?? "church"]}
                </span>
                <h2 className="text-base font-bold text-black leading-tight">
                  {selectedEvent.title}
                </h2>
                <p className="text-xs text-black/60">
                  {new Date(selectedEvent.date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-xs text-black/60">
                  {selectedEvent.location}
                </p>
                <p className="text-xs leading-relaxed text-black/70 line-clamp-4">
                  {selectedEvent.description}
                </p>
                <Link
                  href={`/events/${selectedEvent.id}`}
                  className="mt-1 inline-block rounded-xl bg-(--gold) px-3 py-1.5 text-xs font-semibold text-black"
                >
                  View Details →
                </Link>
              </div>
            )}

            {selectedPlace && (
              <div className="space-y-2 pt-1">
                {selectedPlace.categories && (
                  <span className="inline-block rounded-full bg-(--gold-soft) px-2 py-0.5 text-[10px] font-semibold text-(--foreground-soft)">
                    {selectedPlace.categories.name}
                  </span>
                )}
                <h2 className="text-base font-bold text-black leading-tight">
                  {selectedPlace.name}
                </h2>
                <p className="text-xs text-black/60">
                  {selectedPlace.address}
                </p>
                {selectedPlace.phone && (
                  <p className="text-xs text-black/60">
                    {selectedPlace.phone}
                  </p>
                )}
                {selectedPlace.avg_rating != null && (
                  <p className="text-xs text-black/60">
                    {selectedPlace.avg_rating.toFixed(1)} / 5
                    {selectedPlace.reviews_count != null &&
                      ` · ${selectedPlace.reviews_count} review${selectedPlace.reviews_count !== 1 ? "s" : ""}`}
                  </p>
                )}
                {selectedPlace.verification_flagged && (
                  <p className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                    Possibly closed - awaiting owner verification
                  </p>
                )}
                {selectedPlace.website && /^https?:\/\//i.test(selectedPlace.website) && (
                  <a
                    href={selectedPlace.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-(--gold) underline"
                  >
                    Visit website
                  </a>
                )}
                <p className="text-xs leading-relaxed text-black/70 line-clamp-4">
                  {selectedPlace.description}
                </p>
                <Link
                  href={`/places/${selectedPlace.id}`}
                  className="mt-1 inline-block rounded-xl bg-(--gold) px-3 py-1.5 text-xs font-semibold text-black"
                >
                  View Details →
                </Link>
              </div>
            )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
