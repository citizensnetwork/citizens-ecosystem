"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Event, EventCategory, PlaceCategory, Place, Profile } from "@/types/db";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_LABELS, CATEGORY_HEX, PLACE_CATEGORY_KEYWORDS, EVENT_CATEGORY_KEYWORDS } from "@/lib/categories";
import { isWeekendEvent } from "@/lib/weekendTag";
import { share } from "@/lib/capacitor/share";
import { useBurgerMenuData } from "@/hooks/useBurgerMenuData";
import GlassCalendar from "./GlassCalendar";
import QuickPanelSettings, { type QuickPanelOption } from "./QuickPanelSettings";
import { loadQuickIds } from "@/lib/quickPanelPrefs";
import { QUICK_ACCESS_ITEMS, type QuickAccessItem } from "@/lib/quickPanelOptions";
import { rankResults, distanceKm, type RankedResult } from "@/lib/aiSearch";
import { getCityLabel } from "@/lib/cityLabel";
import { DEFAULT_CENTER } from "@/lib/map/config";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import GlassMapHeader from "@/components/map/glass/GlassMapHeader";
import MapFiltersPanel from "@/components/map/glass/MapFiltersPanel";
import PlacePreviewCard from "@/components/map/glass/PlacePreviewCard";
import EventPreviewCard from "@/components/map/glass/EventPreviewCard";
import GlassSearchResults from "@/components/map/glass/GlassSearchResults";

const EventMap = dynamic(() => import("@/components/map/EventMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

type Props = {
  events: Event[];
  places?: Place[];
  /** Approved contributors fed into the free-text search ranker so the
   *  search bar can surface ministries / orgs / businesses alongside
   *  events + places. Kept optional so existing call sites don't break. */
  contributors?: Profile[];
};

/** Number of event cards shown per page in the category panel. */
const CARDS_PER_PAGE = 3;

/** All event categories in display order — drives the glass Filters panel. */
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as EventCategory[];

/** Convert hex colour to rgba string (used for category panel card backgrounds). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Rainbow sweep used for the thin "For me" personalisation pill outline
 *  (matches the rainbow "?" personalise control in the glass header). */
const RAINBOW_GRADIENT =
  "linear-gradient(135deg, #ff4d4d 0%, #ffb400 25%, #3dd598 50%, #2f80ed 75%, #9b51e0 100%)";

export default function EventsView({
  events,
  places = [],
  contributors = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Calendar is now a frosted overlay on top of the map (FEAT-02).
  // The `?view=calendar` URL param (emitted by the sidebar Calendar link)
  // auto-opens the overlay; the map stays mounted underneath.
  const [calendarOpen, setCalendarOpen] = useState(
    () => searchParams.get("view") === "calendar"
  );
  // Wrapper for closing the calendar that also strips the `?view=calendar`
  // URL param (Batch 2 N1). Using replace() avoids polluting browser
  // history while still keeping deep-links shareable when the calendar is
  // open. We keep the existing query string except for the `view` key.
  const closeCalendar = useCallback(() => {
    setCalendarOpen(false);
    if (searchParams.get("view") === "calendar") {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("view");
      const qs = next.toString();
      router.replace(qs.length > 0 ? `/events?${qs}` : "/events", {
        scroll: false,
      });
    }
  }, [router, searchParams]);
  // Open the calendar when the sidebar Calendar link adds `?view=calendar`
  // via a soft navigation (the useState initialiser above only runs on first
  // mount, so a client-side nav while already on /events needs this sync).
  useEffect(() => {
    if (searchParams.get("view") === "calendar") setCalendarOpen(true);
  }, [searchParams]);
  // Pre-populate search from ?q= param so contributor type-label links
  // land with the search box already filled.
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  // ── Glassmorphism Community Map overlay state ──
  const [mapFiltersOpen, setMapFiltersOpen] = useState(false);
  // Header search dropdown visibility (delayed blur so result clicks register).
  const [headerSearchFocused, setHeaderSearchFocused] = useState(false);
  const headerBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHeaderSearchFocus = useCallback(() => {
    if (headerBlurTimer.current) clearTimeout(headerBlurTimer.current);
    setHeaderSearchFocused(true);
  }, []);
  const onHeaderSearchBlur = useCallback(() => {
    headerBlurTimer.current = setTimeout(() => setHeaderSearchFocused(false), 150);
  }, []);
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    new Set()
  );
  const [activePlaceCategories, setActivePlaceCategories] = useState<Set<PlaceCategory>>(
    new Set()
  );

  // "Weekend only" derived filter — AND-combines with active category filters
  // (an event must match both selected categories AND be a weekend event).
  // Lives separately from `activeCategories` because weekend is a derived
  // attribute (see src/lib/weekendTag.ts), never a stored slug.
  const [weekendOnly, setWeekendOnly] = useState(false);
  const handleToggleWeekend = useCallback(() => setWeekendOnly((w) => !w), []);

  // Snapshot of the category/quick-access filters taken the moment the user
  // begins a search. Restored when the search input is cleared so the
  // previously-selected filters come back intact.
  const searchFilterSnapshotRef = useRef<{
    categories: Set<EventCategory>;
    placeCategories: Set<PlaceCategory>;
    quickAccess: string | null;
  } | null>(null);

  // ── "For me in this area" hard-filter pill (Easter-egg personalisation) ──
  // When toggled on, restricts visible events + places to those whose
  // category sits at ≥60% in the user's preferences.percentages roll-up.
  // Stashes the prior filter / search state into a ref so toggling off
  // returns the user to exactly where they were.
  const [forMeActive, setForMeActive] = useState(false);
  const forMeSnapshotRef = useRef<{
    categories: Set<EventCategory>;
    placeCategories: Set<PlaceCategory>;
    quickAccess: string | null;
    search: string;
  } | null>(null);

  // Category panel state (shows when categories are selected)
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [categoryPanelPage, setCategoryPanelPage] = useState(0);

  // Quick access state — only one at a time; null = none selected
  const [activeQuickAccess, setActiveQuickAccess] = useState<string | null>(null);
  // Derived: quick-access panel open state (auto-opens when quick access selected)
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [quickPanelPage, setQuickPanelPage] = useState(0);
  // Quick-panel preferences (localStorage) — defaults to the first 5 tools
  const [quickPrefIds, setQuickPrefIds] = useState<string[]>(() =>
    QUICK_ACCESS_ITEMS.slice(0, 5).map((i) => i.id)
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

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  // User state for auth section in burger menu
  const [user, setUser] = useState<User | null>(null);
  const [rsvpEventIds, setRsvpEventIds] = useState<Set<string>>(new Set());
  // Ref mirrors rsvpEventIds so handleQuickAction (useCallback) always reads
  // the latest value without needing it in its dep list.
  const rsvpEventIdsRef = useRef<Set<string>>(new Set());
  rsvpEventIdsRef.current = rsvpEventIds;
  const [considerEventIds, setConsiderEventIds] = useState<Set<string>>(new Set());
  const [followedCreatorIds, setFollowedCreatorIds] = useState<Set<string>>(new Set());
  const [followedPlaceIds, setFollowedPlaceIds] = useState<Set<string>>(new Set());
  // Active map update bubbles keyed by event id (newest non-dismissed per event).
  const [mapBubbles, setMapBubbles] = useState<Map<string, { id: string; body: string }>>(new Map());
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const panelSwipeStartY = useRef(0);
  const panelSwipeStartX = useRef(0);

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
        Promise.all([
          supabase.from("rsvps").select("event_id,status").eq("user_id", user.id),
          supabase.from("follows").select("followee_id").eq("follower_id", user.id),
          supabase.from("place_follows").select("place_id").eq("user_id", user.id),
        ]).then(([rsvpRes, followsRes, placeFollowsRes]) => {
          const rsvps = rsvpRes.data ?? [];
          setRsvpEventIds(
            new Set(
              rsvps
                .filter((r) => (r as { status?: string }).status !== "considering")
                .map((r) => r.event_id)
            )
          );
          setConsiderEventIds(
            new Set(
              rsvps
                .filter((r) => (r as { status?: string }).status === "considering")
                .map((r) => r.event_id)
            )
          );
          setFollowedCreatorIds(new Set((followsRes.data ?? []).map((r) => r.followee_id)));
          setFollowedPlaceIds(new Set((placeFollowsRes.data ?? []).map((r) => r.place_id)));
        });
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setRsvpEventIds(new Set());
        setConsiderEventIds(new Set());
        setFollowedCreatorIds(new Set());
        setFollowedPlaceIds(new Set());
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Active map update bubbles (z12+ speech banners above event markers).
  // Refetched whenever the signed-in user changes so per-user dismissals apply.
  useEffect(() => {
    const supabase = supabaseRef.current!;
    let cancelled = false;
    supabase
      .rpc("get_active_map_bubbles")
      .then(({ data }: { data: { id: string; event_id: string; body: string; created_at: string }[] | null }) => {
        if (cancelled) return;
        const next = new Map<string, { id: string; body: string; created_at: string }>();
        for (const row of data ?? []) {
          const existing = next.get(row.event_id);
          if (!existing || row.created_at > existing.created_at) {
            next.set(row.event_id, { id: row.id, body: row.body, created_at: row.created_at });
          }
        }
        const trimmed = new Map<string, { id: string; body: string }>();
        for (const [eventId, v] of next) trimmed.set(eventId, { id: v.id, body: v.body });
        setMapBubbles(trimmed);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleDismissBubble = useCallback((bubbleId: string) => {
    // Optimistically remove the bubble for its event, then persist.
    setMapBubbles((prev) => {
      const next = new Map(prev);
      for (const [eventId, b] of next) {
        if (b.id === bubbleId) {
          next.delete(eventId);
          break;
        }
      }
      return next;
    });
    fetch(`/api/map/bubbles/${bubbleId}/dismiss`, { method: "POST" }).catch(() => {
      /* best-effort; bubble already hidden locally and will not re-fetch this session */
    });
  }, []);

  // gold ring pulse (desktop affordance; silent no-op on touch devices).
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  const displayName =
    user?.user_metadata?.full_name?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "Account";

  const contributorUpcomingEventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      counts.set(event.created_by, (counts.get(event.created_by) ?? 0) + 1);
    }
    return counts;
  }, [events]);

  // Per-category event counts for the Filters bottom-sheet grid badges.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      if (e.category) counts[e.category] = (counts[e.category] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  // Escape key closes drawers and detail panels
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (mapFiltersOpen) { setMapFiltersOpen(false); return; }
      if (calendarOpen) { closeCalendar(); return; }
      if (selectedEvent || selectedPlace) { setSelectedEvent(null); setSelectedPlace(null); }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mapFiltersOpen, calendarOpen, selectedEvent, selectedPlace, closeCalendar]);

  // User profile + convince state (powers the map preview/quick panels and the
  // header avatar / personalisation). The wider social fields this hook also
  // returns are no longer surfaced on the map (the burger menu was retired).
  const {
    incomingConvinceEventIds,
    profile: menuProfile,
    refetch: refetchBurgerData,
  } = useBurgerMenuData(user?.id ?? null, true);

  // ── Personalisation: derive the categories the user is "into" ────
  // Anything ≥60% in their cached preferences.percentages roll-up. Split
  // into event-cat + place-cat sets so we can apply the right filter to
  // each list. If the user has no signal yet, both sets are empty and the
  // "For me" pill is hidden.
  const personalised = useMemo(() => {
    const prefs = menuProfile?.preferences as { percentages?: Record<string, number> } | undefined;
    const pcts = prefs?.percentages ?? {};
    const eventCats = new Set<EventCategory>();
    const placeCats = new Set<PlaceCategory>();
    // Lower bar (>=40) PLUS a top-3 fallback ensures the filter always has a
    // meaningful match pool — previously the >=60 threshold combined with
    // few events per top category surfaced a blank map.
    const sorted = Object.entries(pcts)
      .filter(([, pct]) => typeof pct === "number")
      .sort((a, b) => (b[1] as number) - (a[1] as number));
    const selected = new Set<string>();
    for (const [slug, pct] of sorted) {
      if ((pct as number) >= 40) selected.add(slug);
    }
    // Fallback: include the top 3 categories even if none clear 40, so the
    // pill is useful for brand-new users whose signals are still shallow.
    for (const [slug] of sorted.slice(0, 3)) selected.add(slug);
    for (const slug of selected) {
      if (slug in EVENT_CATEGORY_KEYWORDS) eventCats.add(slug as EventCategory);
      if (slug in PLACE_CATEGORY_KEYWORDS) placeCats.add(slug as PlaceCategory);
    }
    return { eventCats, placeCats, hasSignal: eventCats.size > 0 || placeCats.size > 0 };
  }, [menuProfile]);


  /** Clear quick-access selection and its derived state (shared by multiple handlers). */
  function clearQuickAccess() {
    setActiveQuickAccess(null);
    setQuickPanelOpen(false);
  }

  /**
   * Toggle the "For me in this area" hard-filter pill. Activating it
   * snapshots the current filter state and clears the active filters so
   * the personalised filter is the only one in effect.  Deactivating
   * restores the snapshot exactly.
   */
  function toggleForMe() {
    if (forMeActive) {
      const snap = forMeSnapshotRef.current;
      forMeSnapshotRef.current = null;
      setForMeActive(false);
      if (snap) {
        setActiveCategories(snap.categories);
        setActivePlaceCategories(snap.placeCategories);
        setActiveQuickAccess(snap.quickAccess);
        setSearch(snap.search);
        if (snap.quickAccess) {
          setQuickPanelOpen(true);
          setQuickPanelPage(0);
        }
      }
    } else {
      forMeSnapshotRef.current = {
        categories: new Set(activeCategories),
        placeCategories: new Set(activePlaceCategories),
        quickAccess: activeQuickAccess,
        search,
      };
      setActiveCategories(new Set());
      setActivePlaceCategories(new Set());
      setActiveQuickAccess(null);
      setQuickPanelOpen(false);
      setSearch("");
      setForMeActive(true);
    }
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

  // Quick-access toggle: sets both event + place categories, clears regular selections.
  // NOTE: Quick access items map to DB event categories by slug (e.g. "education-equipping", "church-services").
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

  // Browser geolocation: lazily requested only when the user types a
  // "near me" style query (effect declared further down). The cached
  // value also drives proximity sorting in the quick-search panel below
  // — never triggers a prompt on its own, so panel sorting silently
  // falls back to Pretoria when no location is known.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Quick-access filtered events (both event + place items merged for the panel).
  // Sorted by proximity to the user's location when known (cached, never
  // prompts), falling back to Pretoria so SA users see local results first.
  const quickFilteredEvents = useMemo(() => {
    if (!activeQuickItem) return [];
    const matched =
      activeQuickItem.specialFilter === "volunteer"
        ? events.filter((e) => e.volunteer_openings)
        : events.filter((e) => {
            const cats = new Set(activeQuickItem.eventCategories);
            return e.category != null && cats.has(e.category);
          });
    const origin: [number, number] = userLocation
      ? [userLocation.lat, userLocation.lng]
      : DEFAULT_CENTER;
    return [...matched].sort((a, b) => {
      const da = a.latitude != null && a.longitude != null
        ? distanceKm(origin, [a.latitude, a.longitude])
        : Number.POSITIVE_INFINITY;
      const db = b.latitude != null && b.longitude != null
        ? distanceKm(origin, [b.latitude, b.longitude])
        : Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [events, activeQuickItem, userLocation]);

  const quickFilteredPlaces = useMemo(() => {
    if (!activeQuickItem) return [];
    const matched =
      activeQuickItem.specialFilter === "volunteer"
        ? places.filter((p) => p.volunteer_openings)
        : places.filter((p) => {
            const text = `${p.name} ${p.description} ${p.address} ${p.categories?.name ?? ""}`.toLowerCase();
            return activeQuickItem.placeCategories.some((cat) =>
              PLACE_CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))
            );
          });
    const origin: [number, number] = userLocation
      ? [userLocation.lat, userLocation.lng]
      : DEFAULT_CENTER;
    return [...matched].sort((a, b) => {
      const da = a.latitude != null && a.longitude != null
        ? distanceKm(origin, [a.latitude, a.longitude])
        : Number.POSITIVE_INFINITY;
      const db = b.latitude != null && b.longitude != null
        ? distanceKm(origin, [b.latitude, b.longitude])
        : Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [places, activeQuickItem, userLocation]);

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
  // is cached in `userLocation` state (declared above) for the session.
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
    () => rankResults(search, events, places, userLocation ?? undefined, contributors),
    [search, events, places, userLocation, contributors],
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

  // Top contributors matching the current search — only shown while
  // searching, capped at 3 so the search bar doesn't get busy. Each chip
  // deep-links to /c/[slug] (which opens in a drawer on the map).
  const topContributorMatches = useMemo(() => {
    if (!ranked.intent.hasSignal) return [];
    const byId = new Map(contributors.map((c) => [c.id, c]));
    return ranked.contributors
      .slice(0, 3)
      .map((r) => byId.get(r.id))
      .filter((p): p is Profile => !!p && !!p.contributor_slug);
  }, [ranked.contributors, ranked.intent.hasSignal, contributors]);

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
      if (
        !isSearching &&
        activeQuickItem?.specialFilter === "volunteer" &&
        !e.volunteer_openings
      ) {
        return false;
      }
      // "For me" hard filter: applied before category logic so it always
      // wins. When active and the user has personalised categories, an
      // event matches if its category is in the set OR its text hits any
      // of those categories' keyword banks — this keeps the pill useful
      // for events that were seeded with broad categories (e.g. "church-services")
      // but belong thematically to "marriage-family" via their title.
      if (forMeActive && personalised.hasSignal) {
        const categoryHit =
          e.category != null && personalised.eventCats.has(e.category);
        if (!categoryHit) {
          const text = `${e.title} ${e.description} ${e.location}`.toLowerCase();
          const keywordHit = [...personalised.eventCats].some((cat) =>
            (EVENT_CATEGORY_KEYWORDS[cat] ?? []).some((kw) => text.includes(kw))
          );
          if (!keywordHit) return false;
        }
      }
      // Bypass category filters while searching so search returns the full
      // cross-category match set (plus places below).
      const matchesCategory =
        isSearching ||
        activeCategories.size === 0 ||
        (e.category != null && activeCategories.has(e.category));
      if (!matchesCategory) return false;
      // Weekend-only filter AND-combines with categories. Bypassed during
      // search so free-text lookup remains exhaustive.
      if (weekendOnly && !isSearching && !isWeekendEvent(e)) return false;
      const q = search.toLowerCase().trim();
      if (!q) return true;
      // Prefer the AI ranker when the query has taxonomy signal.
      if (rankedEventIds) return rankedEventIds.has(e.id);
      // Text fallback: substring match across title / location / description
      // PLUS the category keyword bank so queries like "home group" surface
      // events in education / social-fun / church whose description mentions
      // a home group, even if the word itself isn't in the title.
      if (
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      ) {
        return true;
      }
      if (e.category != null) {
        const bank = EVENT_CATEGORY_KEYWORDS[e.category];
        if (bank && bank.some((kw) => kw.includes(q) || q.includes(kw))) {
          // Guard against tiny queries: require ≥3 chars before keyword-only matches
          return q.length >= 3;
        }
      }
      return false;
    });
  }, [events, search, activeCategories, activeQuickItem, rankedEventIds, isSearching, forMeActive, personalised, weekendOnly]);

  const filteredPlaces = useMemo(() => {
    const q = search.toLowerCase().trim();
    return places.filter((p) => {
      if (
        !isSearching &&
        activeQuickItem?.specialFilter === "volunteer" &&
        !p.volunteer_openings
      ) {
        return false;
      }
      // "For me" hard filter: applied before category logic. Uses the same
      // keyword-bank text match as the existing place filter so a place
      // with category "church-services" surfaces for users into church services, etc.
      if (forMeActive && personalised.hasSignal) {
        if (personalised.placeCats.size === 0) return false;
        const text = `${p.name} ${p.description} ${p.address} ${p.categories?.name ?? ""}`.toLowerCase();
        const matches = [...personalised.placeCats].some((cat) =>
          PLACE_CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))
        );
        if (!matches) return false;
      }
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
  }, [places, search, activePlaceCategories, activeQuickItem, rankedPlaceIds, isSearching, forMeActive, personalised]);

  // Category-panel ordering: same proximity sort as the quick-access panel
  // so users see local results first. The underlying `filtered` array
  // remains untouched (it feeds the map, where marker order is irrelevant).
  const sortedCategoryPanelEvents = useMemo(() => {
    const origin: [number, number] = userLocation
      ? [userLocation.lat, userLocation.lng]
      : DEFAULT_CENTER;
    return [...filtered].sort((a, b) => {
      const da = a.latitude != null && a.longitude != null
        ? distanceKm(origin, [a.latitude, a.longitude])
        : Number.POSITIVE_INFINITY;
      const db = b.latitude != null && b.longitude != null
        ? distanceKm(origin, [b.latitude, b.longitude])
        : Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [filtered, userLocation]);

  // Quick-access panel scoping: quick-select shows BOTH events and places that
  // match the selected tool — no event/place exclusion. The map keeps both
  // marker types visible too (see `placesMode` on <EventMap>), so tapping any
  // tile flies to a marker that actually exists on the map.
  const quickPanelEvents = quickFilteredEvents;
  const quickPanelPlaces = quickFilteredPlaces;
  const quickPanelTotal = quickPanelEvents.length + quickPanelPlaces.length;

  const handleSelectEvent = useCallback(
    (event: Event) => {
      setSelectedPlace(null);
      setSelectedEvent(event);
      closeCalendar();
      // Let the Easter-egg orchestrator know which category was just
      // engaged with — powers the couples / gender-bucket prompts.
      if (event.category) {
        void import("@/lib/easterEggs/bus").then(({ publishEasterEggEvent }) => {
          publishEasterEggEvent({ type: "category_tapped", category: event.category as string });
        });
      }
    },
    [closeCalendar]
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
    // Close the calendar overlay so the fly-to is visible on the underlying map.
    closeCalendar();
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
  }, [handleSelectEvent, closeCalendar]);

  const handleQuickAction = useCallback(
    async (action: "view" | "join" | "share" | "consider" | "visit", event: Event) => {
      try {
        switch (action) {
          case "view":
            // Close the inline glass preview, then navigate to the full event
            // page (Figma model — detail opens full-page in the content column,
            // no drawer).
            setSelectedEvent(null);
            setSelectedPlace(null);
            router.push(`/events/${event.id}`);
            break;
          case "join": {
            const alreadyJoined = rsvpEventIdsRef.current.has(event.id);
            const res = await fetch("/api/rsvp", {
              method: alreadyJoined ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_id: event.id }),
            });
            if (res.status === 401) { router.push("/login"); return; }
            if (res.ok) {
              if (alreadyJoined) {
                setRsvpEventIds((prev) => { const next = new Set(prev); next.delete(event.id); return next; });
              } else {
                setRsvpEventIds((prev) => new Set([...prev, event.id]));
              }
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
            if (res.status === 401) { router.push("/login"); return; }
            if (res.ok) {
              const json = (await res
                .json()
                .catch(() => null)) as { action?: string } | null;
              const action = json?.action;
              if (action === "added") {
                setConsiderEventIds((prev) => new Set([...prev, event.id]));
              } else if (action === "removed") {
                setConsiderEventIds((prev) => {
                  const next = new Set(prev);
                  next.delete(event.id);
                  return next;
                });
              }
              refetchBurgerData();
            }
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
    [router, refetchBurgerData]
  );

  const handleSelectPlace = useCallback((place: Place) => {
    // Open the inline glass PlacePreviewCard; its "View" then navigates to the
    // full /places/[id] page (Figma model — no drawer).
    setSelectedEvent(null);
    setSelectedPlace(place);
    closeCalendar();
  }, [closeCalendar]);

  const closeDetail = useCallback(() => {
    setSelectedEvent(null);
    setSelectedPlace(null);
  }, []);

  // City search / geocoding state is declared above next to handleFocusEventOnMap.

  // ── Floating map chrome (Phase D — Google-Maps-inspired controls) ──
  // Compass button only appears when the map is rotated.
  const [mapBearing, setMapBearing] = useState(0);
  const [resetBearingToken, setResetBearingToken] = useState(0);
  // Locate-me FAB: increments a token the map watches.
  const [locateMeToken, setLocateMeToken] = useState(0);
  // Reset quick-panel pagination whenever filters change so a tab/category
  // switch doesn't leave the carousel scrolled off the end of a now-shorter
  // result set.
  useEffect(() => {
    setQuickPanelPage(0);
  }, [activeCategories, activePlaceCategories, activeQuickAccess, search]);

  // Close glance panel when detail opens
  const hasDetail = selectedEvent || selectedPlace;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-(--surface)">
      {/* Map is always rendered — calendar (when open) overlays it. */}
      <div
        className={`absolute inset-0${calendarOpen ? " pointer-events-none" : ""}`}
      >
        <EventMap
          events={filtered}
          places={filteredPlaces}
          onSelectPlace={handleSelectPlace}
          onSelectEvent={handleSelectEvent}
          onQuickAction={handleQuickAction}
          autoLocate
          flyTo={mapFlyTo}
          flyToZoom={mapFlyToZoom}
          flyToToken={mapFlyToToken}
          activeCategories={activeCategories}
          activePlaceCategories={activePlaceCategories}
          markerOverrideColor={activeQuickItem?.color}
          onBearingChange={setMapBearing}
          resetBearingToken={resetBearingToken}
          locateMeToken={locateMeToken}
          highlightedEventId={hoveredEventId}
          selectedEventId={selectedEvent?.id ?? null}
          selectedPlaceId={selectedPlace?.id ?? null}
          rsvpEventIds={rsvpEventIds}
          considerEventIds={considerEventIds}
          followedCreatorIds={followedCreatorIds}
          followedPlaceIds={followedPlaceIds}
          contributorUpcomingEventCounts={contributorUpcomingEventCounts}
          bubbles={mapBubbles}
          onDismissBubble={handleDismissBubble}
        />
      </div>

      {/* FEAT-02 — frosted glass-overlay calendar (no FullCalendar dep). */}
      {calendarOpen && (
        <GlassCalendar
          events={filtered}
          rsvpEventIds={rsvpEventIds}
          onSelectEvent={handleSelectEvent}
          onClose={closeCalendar}
        />
      )}

      {/* ── Glassmorphism Community Map header (search + filter + avatar) ── */}
      {!calendarOpen && (
        <GlassMapHeader
          search={search}
          onSearchChange={setSearch}
          onSearchClear={() => setSearch("")}
          onSearchFocus={onHeaderSearchFocus}
          onSearchBlur={onHeaderSearchBlur}
          resultsSlot={
            headerSearchFocused && search.trim().length > 0 ? (
              <GlassSearchResults
                query={search}
                events={filtered.slice(0, 5)}
                places={filteredPlaces.slice(0, 4)}
                contributors={topContributorMatches}
                onSelectEvent={(e) => {
                  setHeaderSearchFocused(false);
                  handleSelectEvent(e);
                }}
                onSelectPlace={(p) => {
                  setHeaderSearchFocused(false);
                  handleSelectPlace(p);
                }}
                onSelectContributor={(slug) => {
                  setHeaderSearchFocused(false);
                  router.push(`/c/${encodeURIComponent(slug)}`);
                }}
              />
            ) : undefined
          }
          filtersOpen={mapFiltersOpen}
          onToggleFilters={() => setMapFiltersOpen((o) => !o)}
          filterCount={activeCategories.size + (weekendOnly ? 1 : 0)}
          avatarUrl={menuProfile?.avatar_url ?? menuProfile?.logo_url ?? null}
          avatarInitial={displayName.charAt(0).toUpperCase()}
          onAvatarClick={() => router.push(user ? "/profile" : "/login")}
        />
      )}

      {/* Calendar-only minimal top bar so the map↔calendar toggle stays reachable. */}
      {calendarOpen && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-1000 flex justify-end p-3 sm:p-4">
          <button
            type="button"
            onClick={closeCalendar}
            className="cc-glass pointer-events-auto flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium text-(--gold) active:scale-95"
            aria-label="Back to map"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            Map
          </button>
        </div>
      )}

      {/* ── Filters bottom-sheet (Figma "Categories") — categories + timing,
           opened from the header Filters tile. ── */}
      {!calendarOpen && mapFiltersOpen && (
        <MapFiltersPanel
          categories={CATEGORY_ORDER}
          activeCategories={activeCategories}
          onToggleCategory={toggleCategory}
          categoryCounts={categoryCounts}
          onClear={() => {
            setActiveCategories(new Set());
            if (weekendOnly) handleToggleWeekend();
            clearQuickAccess();
          }}
          weekendOnly={weekendOnly}
          onToggleWeekend={handleToggleWeekend}
          onClose={() => setMapFiltersOpen(false)}
        />
      )}

      {/* ── Floating right-side FAB stack (Phase D) ─────────────────────
       *  Compass reset appears only when the map is rotated; locate-me FAB
       *  is always visible in map view. Kept on the right edge so it does
       *  not collide with the left-side burger / quick-access column. */}
      {!calendarOpen && !hasDetail && (
        <div className="pointer-events-none absolute right-3 bottom-24 z-999 flex flex-col items-center gap-2 sm:right-4 sm:bottom-28">
          {Math.abs(((mapBearing % 360) + 360) % 360) > 1 && (
            <button
              type="button"
              onClick={() => setResetBearingToken((t) => t + 1)}
              className="cc-glass pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-black/70 shadow-lg transition hover:text-black active:scale-95"
              aria-label="Reset map orientation to north"
              title="Reset north"
            >
              {/* Compass needle: rotates with the map bearing so users
                  see which way is north at a glance (mirrors Google Maps). */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                style={{ transform: `rotate(${-mapBearing}deg)`, transition: "transform 200ms ease" }}
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polygon points="12 5 15 13 12 11 9 13 12 5" fill="currentColor" stroke="none" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => setLocateMeToken((t) => t + 1)}
            className="cc-glass pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-(--gold) shadow-lg transition active:scale-95"
            aria-label="Find my location"
            title="Find my location"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Map Key legend (Figma "Kingdom Connect") ───────────────────
       *  Bottom-left glass card decoding the marker vocabulary. Offset above
       *  the mobile bottom-nav (bottom-28) and the desktop bottom edge. */}
      {!calendarOpen && !hasDetail && (
        <div className="pointer-events-none absolute bottom-28 left-3 z-999 sm:bottom-8 sm:left-4">
          <div className="cc-glass space-y-1.5 rounded-2xl px-3 py-2.5 shadow-lg">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-(--foreground-soft)">
              Map Key
            </p>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-[10px] text-(--foreground-soft)">Live now</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-(--gold) bg-white" />
              <span className="text-[10px] text-(--foreground-soft)">Event</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#111]" />
              <span className="text-[10px] text-(--foreground-soft)">Place</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick-filter pill row (Figma "quick filters") ──────────────
       *  Horizontal, scrollable strip beneath the header. Re-dresses the old
       *  vertical quick-access tools column into Figma pills, and folds the
       *  personalisation "For me" control in as a rainbow-outlined pill at the
       *  head of the row (replaces the former floating mid-screen pill).
       *  Tapping a category pill reuses the full quick-access behaviour
       *  (event + place filtering + the bottom card panel). */}
      {!calendarOpen && (personalised.hasSignal || visibleQuickItems.length > 0) && (
        <div className="pointer-events-none absolute inset-x-0 top-[130px] z-1004 sm:top-[140px]">
          <div className="mx-auto w-full max-w-5xl px-3 sm:px-4">
            <div className="scrollbar-hide pointer-events-auto flex items-center gap-2 overflow-x-auto pb-1">
              {/* "For me" — thin rainbow-outlined personalisation pill */}
              {personalised.hasSignal && (
                <button
                  type="button"
                  onClick={toggleForMe}
                  aria-pressed={forMeActive}
                  aria-label={
                    forMeActive
                      ? "Show everything — clear the For me filter"
                      : "Filter the map to what's For me"
                  }
                  className="relative flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap shadow-lg transition-all active:scale-95"
                  style={{
                    background: `linear-gradient(${
                      forMeActive ? "var(--gold-soft), var(--gold-soft)" : "#fff, #fff"
                    }) padding-box, ${RAINBOW_GRADIENT} border-box`,
                    border: "1.5px solid transparent",
                    color: "var(--foreground)",
                  }}
                >
                  <span aria-hidden="true">✨</span>
                  For me
                  {forMeActive && (
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full bg-black/15 text-[10px]"
                      aria-hidden="true"
                    >
                      ×
                    </span>
                  )}
                </button>
              )}

              {/* User's chosen quick-filter categories (Settings, ≤5) */}
              {visibleQuickItems.map((item) => {
                const isActive = activeQuickAccess === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleQuickAccess(item.id)}
                    aria-pressed={isActive}
                    title={item.label}
                    className={
                      isActive
                        ? "flex flex-shrink-0 scale-105 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap text-white shadow-xl transition-all active:scale-95"
                        : "cc-glass flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap text-black/70 shadow-lg transition-all active:scale-95"
                    }
                    style={isActive ? { background: item.color } : undefined}
                  >
                    <span
                      className="flex h-3.5 w-3.5 items-center justify-center"
                      style={{ color: isActive ? "#fff" : item.color }}
                      dangerouslySetInnerHTML={{ __html: item.svg }}
                    />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
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
              className="absolute bottom-0 left-1/2 z-1610 -translate-x-1/2 rounded-t-xl border border-b-0 px-5 py-2 text-xs font-bold tracking-wider shadow-lg backdrop-blur transition-all active:scale-95 hover:brightness-110"
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
            className={`absolute inset-x-0 bottom-0 z-1611 flex h-[27dvh] flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
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
                <div className="flex h-24 flex-col items-center justify-center gap-1 px-6 text-center text-sm text-white/60">
                  <p className="font-medium text-white/80">
                    {activeCategories.size === 1
                      ? `Nothing in ${CATEGORY_LABELS[[...activeCategories][0]] ?? "this category"} nearby yet`
                      : "No events match your filters"}
                  </p>
                  <p className="text-xs text-white/50">
                    Try widening your radius, clearing filters, or exploring a new area.
                  </p>
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
                      {sortedCategoryPanelEvents.map((event) => {
                        const cat = (event.category ?? "church-services") as EventCategory;
                        const hex = CATEGORY_HEX[cat] ?? "#C9A84C";
                        const isConvinced = incomingConvinceEventIds.has(event.id);
                        const cityCode = getCityLabel(event.location, event.latitude, event.longitude);
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => handleFocusEventOnMap(event)}
                            onMouseEnter={() => setHoveredEventId(event.id)}
                            onMouseLeave={() => setHoveredEventId((id) => (id === event.id ? null : id))}
                            className="relative flex-shrink-0 w-[calc(33.333%-8px)] min-w-[140px] rounded-xl border border-white/15 p-2.5 text-left transition-all active:scale-[0.97] hover:brightness-110"
                            style={{
                              background: hexToRgba(hex, 0.35),
                            }}
                          >
                            {isConvinced && (
                              <span
                                className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-(--gold) px-1.5 py-0.5 text-[9px] font-semibold text-black shadow"
                                aria-label="A friend wants you to come"
                                title="A friend wants you to come"
                              >
                                ✦ Convinced
                              </span>
                            )}
                            <div
                              className="mb-1 h-0.5 w-8 rounded-full"
                              style={{ background: hex }}
                            />
                            <h3 className="text-xs font-semibold leading-tight text-white line-clamp-2">
                              {event.title}
                            </h3>
                            <div className="mt-1 flex items-center gap-1.5">
                              {cityCode && (
                                <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white">
                                  {cityCode}
                                </span>
                              )}
                              <p className="text-[10px] text-white/65 line-clamp-1">
                                {event.location}
                              </p>
                            </div>
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
              className="absolute bottom-0 left-1/2 z-1610 -translate-x-1/2 rounded-t-xl border border-b-0 px-5 py-2 text-xs font-bold tracking-wider shadow-lg backdrop-blur transition-all active:scale-95 hover:brightness-110"
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
            className={`absolute inset-x-0 bottom-0 z-1611 flex h-[27dvh] flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
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
                  {quickPanelTotal}
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
              {quickPanelTotal === 0 ? (
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
                      const maxPage = Math.ceil(quickPanelTotal / CARDS_PER_PAGE) - 1;
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
                      {quickPanelEvents.map((event) => {
                        const isConvinced = incomingConvinceEventIds.has(event.id);
                        const cityCode = getCityLabel(event.location, event.latitude, event.longitude);
                        return (
                        <button
                          key={`e-${event.id}`}
                          type="button"
                          onClick={() => handleFocusEventOnMap(event)}
                          onMouseEnter={() => setHoveredEventId(event.id)}
                          onMouseLeave={() => setHoveredEventId((id) => (id === event.id ? null : id))}
                          className="relative flex-shrink-0 w-[calc(33.333%-8px)] min-w-[140px] rounded-xl border border-white/15 p-2.5 text-left transition-all active:scale-[0.97] hover:brightness-110"
                          style={{ background: hexToRgba(activeQuickItem.color, 0.35) }}
                        >
                          {isConvinced && (
                            <span
                              className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-(--gold) px-1.5 py-0.5 text-[9px] font-semibold text-black shadow"
                              aria-label="A friend wants you to come"
                              title="A friend wants you to come"
                            >
                              ✦ Convinced
                            </span>
                          )}
                          <div
                            className="mb-1 h-0.5 w-8 rounded-full"
                            style={{ background: activeQuickItem.color }}
                          />
                          <h3 className="text-xs font-semibold leading-tight text-white line-clamp-2">
                            {event.title}
                          </h3>
                          <div className="mt-1 flex items-center gap-1.5">
                            {cityCode && (
                              <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white">
                                {cityCode}
                              </span>
                            )}
                            <p className="text-[10px] text-white/65 line-clamp-1">
                              {event.location}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[10px] text-white/50">
                            {new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        </button>
                        );
                      })}
                      {/* Place cards */}
                      {quickPanelPlaces.map((place) => {
                        const cityCode = getCityLabel(place.address, place.latitude, place.longitude);
                        return (
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
                          <div className="mt-1 flex items-center gap-1.5">
                            {cityCode && (
                              <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white">
                                {cityCode}
                              </span>
                            )}
                            <p className="text-[10px] text-white/65 line-clamp-1">
                              {place.address}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[10px] text-white/50">
                            Place
                          </p>
                        </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right arrow */}
                  <button
                    type="button"
                    onClick={() => setQuickPanelPage((p) => Math.min(Math.ceil(quickPanelTotal / CARDS_PER_PAGE) - 1, p + 1))}
                    disabled={quickPanelPage >= Math.ceil(quickPanelTotal / CARDS_PER_PAGE) - 1}
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

      {/* ── Detail panel: events keep the full preview; places get the
           glass Community-Map preview card (Figma "Harvest Hope" panel). ── */}
      {selectedEvent && (
        <EventPreviewCard
          event={selectedEvent}
          joined={rsvpEventIds.has(selectedEvent.id)}
          considering={considerEventIds.has(selectedEvent.id)}
          onAction={handleQuickAction}
          onClose={closeDetail}
        />
      )}
      {selectedPlace && !selectedEvent && (
        <PlacePreviewCard place={selectedPlace} onClose={closeDetail} />
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
