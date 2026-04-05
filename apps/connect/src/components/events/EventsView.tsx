"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { Event, EventCategory, Place } from "@/types/db";
import EventCalendar from "./EventCalendar";
import PostEventPrompt from "@/components/reviews/PostEventPrompt";
import dynamic from "next/dynamic";

const EventMap = dynamic(() => import("@/components/map/EventMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

const CATEGORIES: { value: EventCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "church-service", label: "Church Service" },
  { value: "youth", label: "Youth" },
  { value: "community-outreach", label: "Outreach" },
  { value: "worship", label: "Worship" },
  { value: "bible-study", label: "Bible Study" },
  { value: "prayer", label: "Prayer" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];

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
  const [activeCategory, setActiveCategory] = useState<EventCategory | "all">(
    "all"
  );

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      const matchesCategory =
        activeCategory === "all" || e.category === activeCategory;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [events, search, activeCategory]);

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

  const handleSelectEvent = useCallback((event: Event) => {
    setSelectedPlace(null);
    setSelectedEvent(event);
  }, []);

  const handleSelectPlace = useCallback((place: Place) => {
    setSelectedEvent(null);
    setSelectedPlace(place);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedEvent(null);
    setSelectedPlace(null);
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[var(--surface)]">
      {view === "map" ? (
        <EventMap
          events={filtered}
          places={filteredPlaces}
          onSelectEvent={handleSelectEvent}
          onSelectPlace={handleSelectPlace}
        />
      ) : (
        <div className="h-full overflow-y-auto bg-[var(--surface)] px-3 pb-6 pt-22 sm:px-5">
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
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          <input
            type="search"
            placeholder="Search events or places"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pointer-events-auto w-full rounded-2xl border border-black/12 bg-white/95 px-4 py-2.5 text-sm shadow-lg outline-none backdrop-blur focus:border-black/30"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                className="rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-base shadow-lg backdrop-blur transition hover:bg-white"
                aria-label="Toggle filters"
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
              onClick={() => setView((v) => (v === "map" ? "calendar" : "map"))}
              className="pointer-events-auto rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-sm font-medium text-black shadow-lg backdrop-blur transition hover:bg-white"
              aria-label="Toggle map or calendar view"
            >
              {view === "map" ? "📅" : "🗺"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter drawer backdrop ──────────────────────── */}
      {filtersOpen && (
        <div
          className="absolute inset-0 z-[1001] bg-black/25"
          onClick={() => setFiltersOpen(false)}
        />
      )}

      {/* ── Filter drawer ───────────────────────────────── */}
      <aside
        className={`absolute left-0 top-0 z-[1002] h-full w-[84vw] max-w-xs bg-white/96 p-4 shadow-2xl backdrop-blur transition-transform duration-300 sm:w-80 ${
          filtersOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-black/70">
            Filters
          </h2>
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="rounded-lg px-2 py-1 text-black/60 hover:bg-black/5"
            aria-label="Close filters"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2 overflow-y-auto pb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => {
                setActiveCategory(c.value);
                setFiltersOpen(false);
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                activeCategory === c.value
                  ? "bg-[var(--gold)] text-black"
                  : "bg-black/5 text-black/75 hover:bg-black/10"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-4 border-t border-black/10 pt-4 text-sm text-black/65">
          <p>
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            {filteredPlaces.length > 0 &&
              ` · ${filteredPlaces.length} place${filteredPlaces.length !== 1 ? "s" : ""}`}
          </p>
          {isVendor && (
            <Link
              href="/events/new"
              className="mt-3 block rounded-xl bg-[var(--gold)] px-3 py-2 text-center font-semibold text-black"
            >
              + Create Event
            </Link>
          )}
          <Link
            href="/places/new"
            className="mt-2 block rounded-xl bg-black/5 px-3 py-2 text-center font-semibold text-black hover:bg-black/10"
          >
            + Add Place
          </Link>
        </div>
      </aside>

      {/* ── Detail panel (event or place) ───────────────── */}
      {(selectedEvent || selectedPlace) && (
        <>
          <div
            className="absolute inset-0 z-[1003] bg-black/20 sm:bg-transparent"
            onClick={closeDetail}
          />
          <aside className="fade-rise absolute bottom-0 right-0 z-[1004] w-full bg-white/96 p-5 shadow-2xl backdrop-blur sm:top-0 sm:h-full sm:w-96 sm:border-l sm:border-black/10">
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
                <span className="inline-block rounded-full bg-[var(--gold-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--foreground-soft)]">
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
                  className="mt-2 inline-block rounded-xl bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-black"
                >
                  View Details →
                </Link>
              </div>
            )}

            {selectedPlace && (
              <div className="space-y-3 pt-2">
                {selectedPlace.categories && (
                  <span className="inline-block rounded-full bg-[var(--gold-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--foreground-soft)]">
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
                    className="text-sm text-[var(--gold)] underline"
                  >
                    Visit website
                  </a>
                )}
                <p className="text-sm leading-relaxed text-black/80">
                  {selectedPlace.description}
                </p>
                <Link
                  href={`/places/${selectedPlace.id}`}
                  className="mt-2 inline-block rounded-xl bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-black"
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
