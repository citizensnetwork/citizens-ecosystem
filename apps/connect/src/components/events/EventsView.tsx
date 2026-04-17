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
import QuickPanelSettings, { type QuickPanelOption } from "./QuickPanelSettings";
import NotificationBell from "@/components/notifications/NotificationBell";
import { loadQuickIds } from "@/lib/quickPanelPrefs";
import { QUICK_ACCESS_ITEMS, type QuickAccessItem } from "@/lib/quickPanelOptions";
import { rankResults, type RankedResult } from "@/lib/aiSearch";
import { describeIntent } from "@/lib/searchProfile";
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

/** Glass-like inactive background for quick access buttons (white 60%). */
const QUICK_ACCESS_INACTIVE_BG = "rgba(255,255,255,0.60)";

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

  // Burger menu Event / Place tab (lifted here so placesMode can be wired to
  // the EventMap — when "places" is active, only place markers render).
  const [burgerTab, setBurgerTab] = useState<"events" | "places">("events");

  // Snapshot of the category/quick-access filters taken the moment the user
  // begins a search. Restored when the search input is cleared so the
  // previously-selected filters come back intact.
  const searchFilterSnapshotRef = useRef<{
    categories: Set<EventCategory>;
    placeCategories: Set<PlaceCategory>;
    quickAccess: string | null;
  } | null>(null);

  // Category panel state (shows when categories are selected)
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [categoryPanelPage, setCategoryPanelPage] = useState(0);

  // Quick access state — only one at a time; null = none selected
  const [activeQuickAccess, setActiveQuickAccess] = useState<string | null>(null);
  // Derived: quick-access panel open state (auto-opens when quick access selected)
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [quickPanelPage, setQuickPanelPage] = useState(0);
  // Quick-panel preferences (localStorage) — defaults to the first 4 tools
  const [quickPrefIds, setQuickPrefIds] = useState<string[]>(() =>
    QUICK_ACCESS_ITEMS.slice(0, 4).map((i) => i.id)
  );
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);

  // Load prefs on mount + listen for cross-tab updates (e.g. Profile page save)
  useEffect(() => {
    setQuickPrefIds(loadQuickIds());
    function refresh() { setQuickPrefIds(loadQuickIds()); }
    window.addEventListener("cc-quick-panel-prefs-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("cc-quick-panel-prefs-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Derive the visible quick-access items from saved preferences.
  const visibleQuickItems = useMemo(() => {
    const byId = new Map(QUICK_ACCESS_ITEMS.map((i) => [i.id, i]));
    return quickPrefIds
      .map((id) => byId.get(id))
      .filter((i): i is QuickAccessItem => !!i);
  }, [quickPrefIds]);

  // If the active quick-access tool was removed from prefs, clear selection.
  useEffect(() => {
    if (activeQuickAccess && !quickPrefIds.includes(activeQuickAccess)) {
      setActiveQuickAccess(null);
      setQuickPanelOpen(false);
      setActiveCategories(new Set());
      setActivePlaceCategories(new Set());
    }
  }, [quickPrefIds, activeQuickAccess]);

  // All quick-panel options (for the settings modal)
  const quickSettingsOptions = useMemo<QuickPanelOption[]>(
    () => QUICK_ACCESS_ITEMS.map((i) => ({ id: i.id, label: i.label, color: i.color, svg: i.svg })),
    []
  );

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
  const panelSwipeStartX = useRef(0);
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

  /** Clear quick-access selection and its derived state (shared by multiple handlers). */
  function clearQuickAccess() {
    setActiveQuickAccess(null);
    setQuickPanelOpen(false);
  }

  function toggleCategory(cat: EventCategory) {
    // Clear quick access when using regular category toggle
    if (activeQuickAccess) clearQuickAccess();
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

  // Quick-access toggle: sets both event + place categories, clears regular selections.
  // NOTE: Quick access items map to DB event categories by slug (e.g. "education", "church").
  // If category slugs are renamed in the DB, update QUICK_ACCESS_ITEMS accordingly.
  function toggleQuickAccess(itemId: string) {
    if (activeQuickAccess === itemId) {
      // Deselect
      clearQuickAccess();
      setActiveCategories(new Set());
      setActivePlaceCategories(new Set());
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

  // ── Semantic (AI) search ranking ─────────────────────────────────
  // Runs entirely client-side against the already-loaded events/places via
  // the deterministic scoring engine in src/lib/aiSearch.ts. When the user
  // query contains any taxonomy signal (needs/audience/vibe) or location
  // intent ("near me"), we trust the ranker and surface a match-reason
  // chip. Otherwise we fall back to the existing substring search so that
  // very short queries (e.g. a person's name) still work.
  //
  // Browser geolocation is requested lazily — only when the user types a
  // "near me" style query — so we never prompt on page load. The result
  // is cached in state for the session.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const geoRequestedRef = useRef(false);
  const parsedNearMe = useMemo(() => {
    const q = search.toLowerCase();
    return /(near me|nearby|in my area|close to me|around me|close by|around here)/.test(q);
  }, [search]);
  useEffect(() => {
    if (!parsedNearMe) return;
    if (userLocation) return;
    if (geoRequestedRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    geoRequestedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* user declined or error — we still rank without proximity */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, [parsedNearMe, userLocation]);

  const ranked = useMemo(
    () => rankResults(search, events, places, userLocation ?? undefined),
    [search, events, places, userLocation],
  );
  const rankedEventIds = useMemo(() => {
    if (!ranked.intent.hasSignal) return null;
    const m = new Map<string, RankedResult>();
    for (const r of ranked.events) m.set(r.id, r);
    return m;
  }, [ranked]);
  const rankedPlaceIds = useMemo(() => {
    if (!ranked.intent.hasSignal) return null;
    const m = new Map<string, RankedResult>();
    for (const r of ranked.places) m.set(r.id, r);
    return m;
  }, [ranked]);
  const intentLabel = useMemo(
    () => (ranked.intent.hasSignal ? describeIntent(ranked.intent) : ""),
    [ranked.intent],
  );

  // ── Search-vs-filter interplay ───────────────────────────────────
  // When the user types into the search bar we want BOTH events and places
  // to surface regardless of any currently-active category / quick-access
  // filters, so the search is a true free-text lookup. The filters they had
  // selected before searching are snapshotted and then silently restored the
  // moment the search input is cleared, so the user never loses context.
  const isSearching = search.trim().length > 0;
  useEffect(() => {
    if (isSearching) {
      // Snapshot once, when the user first starts typing.
      if (searchFilterSnapshotRef.current === null) {
        searchFilterSnapshotRef.current = {
          categories: new Set(activeCategories),
          placeCategories: new Set(activePlaceCategories),
          quickAccess: activeQuickAccess,
        };
      }
    } else if (searchFilterSnapshotRef.current) {
      // Search cleared — restore the previous filter configuration.
      const snap = searchFilterSnapshotRef.current;
      searchFilterSnapshotRef.current = null;
      setActiveCategories(snap.categories);
      setActivePlaceCategories(snap.placeCategories);
      setActiveQuickAccess(snap.quickAccess);
      if (snap.quickAccess) {
        setQuickPanelOpen(true);
        setQuickPanelPage(0);
      }
    }
    // activeCategories / activePlaceCategories / activeQuickAccess are
    // intentionally NOT in the dep list — we only want to snapshot once at
    // the start of a search session, not on every subsequent filter tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      // Bypass category filters while searching so search returns the full
      // cross-category match set (plus places below).
      const matchesCategory =
        isSearching ||
        activeCategories.size === 0 ||
        (e.category != null && activeCategories.has(e.category));
      if (!matchesCategory) return false;
      const q = search.toLowerCase().trim();
      if (!q) return true;
      // Prefer the AI ranker when the query has taxonomy signal.
      if (rankedEventIds) return rankedEventIds.has(e.id);
      // Fallback: plain substring match (names, descriptions, locations).
      return (
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      );
    });
  }, [events, search, activeCategories, rankedEventIds, isSearching]);

  const filteredPlaces = useMemo(() => {
    const q = search.toLowerCase().trim();
    return places.filter((p) => {
      // Bypass place-category filters while searching, mirroring events.
      if (!isSearching && activePlaceCategories.size > 0) {
        const text = `${p.name} ${p.description} ${p.address} ${p.categories?.name ?? ""}`.toLowerCase();
        const matchesPlaceCat = [...activePlaceCategories].some((cat) =>
          PLACE_CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))
        );
        if (!matchesPlaceCat) return false;
      }

      if (!q) return true;
      if (rankedPlaceIds) return rankedPlaceIds.has(p.id);
      return (
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [places, search, activePlaceCategories, rankedPlaceIds, isSearching]);

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

  // City search / geocoding fly-to state (declared inline so the focus helper
  // below can close over the setters). Kept in sync with the duplicate
  // declaration removed further down.
  const [mapFlyTo, setMapFlyTo] = useState<[number, number] | null>(null);
  const [mapFlyToZoom, setMapFlyToZoom] = useState<number | undefined>(undefined);
  // Monotonically-increasing token forces EventMap to re-run its flyTo effect
  // even when the lat/lng/zoom triplet is identical to the previous request
  // (fixes the "tapping the same card again does nothing / drifts" behaviour).
  const [mapFlyToToken, setMapFlyToToken] = useState(0);

  /**
   * Temporal-panel tap handler: instead of opening the full detail sheet
   * (`handleSelectEvent`), fly the map to the event's exact coordinates and
   * leave the brief in-map popup to convey the details. Falls back to the
   * full-detail behaviour when the event has no coordinates.
   */
  const handleFocusEventOnMap = useCallback((event: Event) => {
    if (view !== "map") setView("map");
    const lat = event.latitude;
    const lng = event.longitude;
    if (lat == null || lng == null) {
      // No coordinates — open the detail sheet so the user isn't left with nothing.
      handleSelectEvent(event);
      return;
    }
    setMapFlyTo([lat, lng]);
    setMapFlyToZoom(15);
    setMapFlyToToken((t) => t + 1);
  }, [view, handleSelectEvent]);

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

  // City search / geocoding state is declared above next to handleFocusEventOnMap.

  // ── Bottom floating search: auto-expand/collapse behaviour ────────
  // initial: collapsed icon button for 5s → expands to bar for 60s idle → collapses back.
  // While the user is focused/typing, the bar stays open and the idle timer resets.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const clearSearchIdleTimer = useCallback(() => {
    if (searchIdleTimerRef.current) {
      clearTimeout(searchIdleTimerRef.current);
      searchIdleTimerRef.current = null;
    }
  }, []);

  const scheduleSearchCollapse = useCallback((ms: number) => {
    clearSearchIdleTimer();
    searchIdleTimerRef.current = setTimeout(() => {
      // Only collapse if not focused (searchFocused is captured fresh via effect re-binding)
      if (searchFocused) return;
      setSearchOpen(false);
    }, ms);
  }, [clearSearchIdleTimer, searchFocused]);

  // Initial reveal: after 5s show the expanded search bar once, then stay for 60s idle.
  useEffect(() => {
    const revealId = setTimeout(() => {
      setSearchOpen(true);
      // After initial reveal, schedule collapse after 60s if idle
      scheduleSearchCollapse(60_000);
    }, 5_000);
    return () => {
      clearTimeout(revealId);
      clearSearchIdleTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the 60s idle timer on any interaction (typing / focus).
  useEffect(() => {
    if (!searchOpen) return;
    if (searchFocused || search.trim().length > 0) {
      clearSearchIdleTimer(); // locked open while focused / text present
      return;
    }
    scheduleSearchCollapse(60_000);
    return clearSearchIdleTimer;
  }, [searchOpen, searchFocused, search, scheduleSearchCollapse, clearSearchIdleTimer]);

  function openSearchBar() {
    setSearchOpen(true);
    // focus once the input mounts
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  // ── Rotating italic placeholder for bottom search bar ────────────
  const SEARCH_SUGGESTIONS = useMemo(
    () => [
      "Homecells in my area",
      "Good coffee places nearby",
      "Christian businesses in my area",
      "Any fitness events I can join?",
      "Looking for new friends",
      "I need counselling",
      "Marriage advice",
    ],
    []
  );
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  useEffect(() => {
    if (!searchOpen) return;
    const id = setInterval(() => {
      setSuggestionIdx((i) => (i + 1) % SEARCH_SUGGESTIONS.length);
    }, 3_000);
    return () => clearInterval(id);
  }, [searchOpen, SEARCH_SUGGESTIONS.length]);

  // ── Trending modal (replaces bottom slide-up panel) ──────────────
  // Top 5 attended events (by RSVP count), falling back to most-recent if trending data is sparse.
  const topAttendedEvents = useMemo(() => {
    const list = trending ?? [];
    // `trending` is already sorted by the API by popularity (see useBurgerMenuData).
    return list.slice(0, 5);
  }, [trending]);

  // "Citizens Connect" chip → zoom to all of South Africa
  function handleBrandClick() {
    // South Africa center, zoom 5.5 shows full country
    setMapFlyTo([-28.7, 25.5]);
    setMapFlyToZoom(5.5);
    setMapFlyToToken((t) => t + 1);
    if (view !== "map") setView("map");
  }

  async function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !search.trim() || view !== "map") return;
    // If the ranker extracted any taxonomy intent, the user meant a
    // semantic query ("homecells in my area", "I need counselling") — not
    // a city name, so skip geocoding and let the in-memory filter drive.
    if (ranked.intent.hasSignal) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}&limit=1`,
        { headers: { "User-Agent": "CitizensConnect/1.0" } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setMapFlyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        setMapFlyToZoom(undefined); // let EventMap use its default
        setMapFlyToToken((t) => t + 1);
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
          flyToToken={mapFlyToToken}
          activeCategories={activeCategories}
          activePlaceCategories={activePlaceCategories}
          markerOverrideColor={activeQuickItem?.color}
          placesMode={burgerTab === "places"}
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

      {/* ── Floating top bar (no search — search is a floating bottom control) ────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-1000 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
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
              {/* Trending round floating button (gold icon) — opens centered glass modal */}
              <button
                type="button"
                onClick={() => setFeaturedOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/95 text-(--gold) shadow-lg backdrop-blur transition-all active:scale-95 hover:bg-white"
                aria-label="Open trending events"
                aria-expanded={featuredOpen}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                  <polyline points="16 7 22 7 22 13"/>
                </svg>
              </button>
              {user && (
                <div className="rounded-full border border-black/10 bg-white/95 p-1 shadow-lg backdrop-blur">
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

      {/* ── Quick access tools (vertical stack under the burger button) ── */}
      {view === "map" && visibleQuickItems.length > 0 && (
        <div className="pointer-events-none absolute left-3 top-[108px] z-999 sm:left-4 sm:top-[116px]">
          <div className="pointer-events-auto flex flex-col items-center gap-2">
            {visibleQuickItems.map((item) => {
              const isActive = activeQuickAccess === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleQuickAccess(item.id)}
                  className="group flex h-9 w-9 items-center justify-center rounded-full shadow-md backdrop-blur-sm transition-all active:scale-90"
                  style={{
                    background: isActive ? hexToRgba(item.color, 0.25) : QUICK_ACCESS_INACTIVE_BG,
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
      {/* ── Bottom floating search — collapses to icon after 60s idle, re-expands on click ── */}
      {/* On mobile the outer container uses a 10% horizontal gutter so the
       *  bar itself is 80% of the viewport width (user reported the bar felt
       *  too wide on phones). Desktop keeps the previous px-4 gutter. */}
      {!hasDetail && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-1006 flex justify-center px-[10%] sm:bottom-6 sm:px-4">
          {searchOpen ? (
            <div className="pointer-events-auto flex w-full max-w-md flex-col items-center gap-1.5">
              {intentLabel && (
                <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-black/70 shadow-md backdrop-blur">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-(--gold)" aria-hidden="true">
                    <polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8 12 2"/>
                  </svg>
                  <span>Matching: {intentLabel}</span>
                </div>
              )}
              <div className="relative flex w-full items-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none absolute left-4 h-4 w-4 text-black/50"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="search"
                  aria-label="Search events, places, or city"
                  placeholder={search ? "" : SEARCH_SUGGESTIONS[suggestionIdx]}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onKeyDown={handleSearchKeyDown}
                  className="cc-bottom-search w-full rounded-full border border-black/10 bg-white/95 px-11 py-3 text-sm italic font-light text-black placeholder:italic placeholder:font-light placeholder:text-black/50 shadow-lg outline-none backdrop-blur focus:not-italic focus:border-black/30"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(""); searchInputRef.current?.focus(); }}
                    className="absolute right-3 rounded-full p-1 text-black/40 transition hover:bg-black/5 hover:text-black"
                    aria-label="Clear search"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openSearchBar}
              aria-label="Open search"
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/80 text-black/70 shadow-lg backdrop-blur transition hover:bg-white active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* ── Trending centered glass modal (replaces bottom slide-up panel) ───────────────── */}
      {featuredOpen && !hasDetail && activeCategories.size === 0 && !activeQuickAccess && (
        <div
          className="absolute inset-0 z-1009 flex items-center justify-center p-4"
          onClick={() => setFeaturedOpen(false)}
          role="presentation"
        >
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
            aria-hidden="true"
          />
          <aside
            ref={featuredRef}
            role="dialog"
            aria-modal="true"
            aria-label="Top attended events"
            onClick={(e) => e.stopPropagation()}
            className="glass-panel relative flex max-h-[78dvh] w-full max-w-lg flex-col overflow-hidden"
            style={{ background: "rgba(255,255,255,0.60)" }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                  <polyline points="16 7 22 7 22 13"/>
                </svg>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-(--gold)">
                  Top Attended
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFeaturedOpen(false)}
                aria-label="Close trending panel"
                className="flex h-8 w-8 items-center justify-center rounded-full text-black/60 transition hover:bg-black/5 hover:text-black active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              <FeaturedPanel
                trendingEvents={topAttendedEvents}
                onSelectEvent={handleSelectEvent}
                onSelectPlace={handleSelectPlace}
                onQuickAction={handleQuickAction}
                fallbackEvents={filtered}
              />
            </div>
          </aside>
        </div>
      )}

      {/* ── Category selection panel (when categories are active via burger menu, not quick access) ── */}
      {/* Hidden while the user is searching so search results aren't visually
       *  overridden by a category-scoped panel. Panel returns automatically
       *  when the search clears (category state is restored). */}
      {activeCategories.size > 0 && !hasDetail && !activeQuickAccess && !isSearching && (
        <>
          {/* Re-open tab when panel is collapsed */}
          {!categoryPanelOpen && (
            <button
              type="button"
              onClick={() => setCategoryPanelOpen(true)}
              className="absolute bottom-0 left-1/2 z-1008 -translate-x-1/2 rounded-t-xl border border-b-0 px-5 py-2 text-xs font-bold tracking-wider shadow-lg backdrop-blur transition-all active:scale-95 hover:brightness-110"
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
            className={`absolute inset-x-0 bottom-0 z-1007 flex h-[27dvh] flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
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

                  {/* Cards row — CARDS_PER_PAGE per page. Horizontal touch
                   *  swipe pages through the cards in addition to the
                   *  chevron buttons; a tap on a card flies the map to the
                   *  event and surfaces its in-map popup. */}
                  <div
                    className="overflow-hidden"
                    onTouchStart={(e) => {
                      panelSwipeStartX.current = e.touches[0].clientX;
                    }}
                    onTouchEnd={(e) => {
                      const dx = e.changedTouches[0].clientX - panelSwipeStartX.current;
                      const maxPage = Math.ceil(filtered.length / CARDS_PER_PAGE) - 1;
                      if (dx < -40) {
                        setCategoryPanelPage((p) => Math.min(maxPage, p + 1));
                      } else if (dx > 40) {
                        setCategoryPanelPage((p) => Math.max(0, p - 1));
                      }
                    }}
                  >
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
                            onClick={() => handleFocusEventOnMap(event)}
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
      {activeQuickItem && !hasDetail && !isSearching && (
        <>
          {/* Re-open tab when panel is collapsed */}
          {!quickPanelOpen && (
            <button
              type="button"
              onClick={() => setQuickPanelOpen(true)}
              className="absolute bottom-0 left-1/2 z-1008 -translate-x-1/2 rounded-t-xl border border-b-0 px-5 py-2 text-xs font-bold tracking-wider shadow-lg backdrop-blur transition-all active:scale-95 hover:brightness-110"
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
            className={`absolute inset-x-0 bottom-0 z-1007 flex h-[27dvh] flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
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
              className="relative flex-shrink-0 rounded-t-2xl backdrop-blur-md"
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
              {/* Settings gear (top-right) */}
              <button
                type="button"
                onClick={() => setQuickSettingsOpen(true)}
                aria-label="Edit quick-panel preferences"
                title="Quick-panel preferences"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white shadow-sm transition hover:bg-white/35 active:scale-90"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>

            {/* Scrollable cards — quick-item coloured translucent background (30%) */}
            <div
              className="flex-1 overflow-y-auto backdrop-blur-md pb-4"
              style={{ background: hexToRgba(activeQuickItem.color, 0.3) }}
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

                  {/* Cards row — horizontal swipe + tap-to-fly-to-map */}
                  <div
                    className="overflow-hidden"
                    onTouchStart={(e) => {
                      panelSwipeStartX.current = e.touches[0].clientX;
                    }}
                    onTouchEnd={(e) => {
                      const dx = e.changedTouches[0].clientX - panelSwipeStartX.current;
                      const total = quickFilteredEvents.length + quickFilteredPlaces.length;
                      const maxPage = Math.ceil(total / CARDS_PER_PAGE) - 1;
                      if (dx < -40) {
                        setQuickPanelPage((p) => Math.min(maxPage, p + 1));
                      } else if (dx > 40) {
                        setQuickPanelPage((p) => Math.max(0, p - 1));
                      }
                    }}
                  >
                    <div
                      className="flex gap-3 transition-transform duration-300"
                      style={{ transform: `translateX(calc(-${quickPanelPage * 100}% - ${quickPanelPage * 12}px))` }}
                    >
                      {/* Event cards */}
                      {quickFilteredEvents.map((event) => (
                        <button
                          key={`e-${event.id}`}
                          type="button"
                          onClick={() => handleFocusEventOnMap(event)}
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
        onClearCategories={() => { setActiveCategories(new Set()); clearQuickAccess(); }}
        activePlaceCategories={activePlaceCategories}
        onTogglePlaceCategory={togglePlaceCategory}
        onClearPlaceCategories={() => { setActivePlaceCategories(new Set()); clearQuickAccess(); }}
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
        activeTab={burgerTab}
        onTabChange={setBurgerTab}
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

      {/* ── Quick-panel settings modal (glass, centered) ────────────── */}
      <QuickPanelSettings
        open={quickSettingsOpen}
        options={quickSettingsOptions}
        onClose={() => setQuickSettingsOpen(false)}
        onSaved={(next) => setQuickPrefIds(next)}
      />
    </div>
  );
}
