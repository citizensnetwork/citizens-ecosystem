"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface Event {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  category: string | null;
  status: string | null;
  image_url: string | null;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  created_at: string;
  rsvps: { count: number }[];
}

interface Place {
  id: string;
  name: string;
}

interface Props {
  slug: string;
  events: Event[];
  places: Place[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EventsDashboardClient({ slug, events, places }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPlace, setFilterPlace] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const categories = useMemo(() => {
    const cats = [...new Set(events.map((e) => e.category).filter(Boolean))] as string[];
    return cats.sort();
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      if (filterPlace !== "all" && e.place_id !== filterPlace) return false;
      if (filterStatus !== "all" && e.status !== filterStatus) return false;
      return true;
    });
  }, [events, filterCategory, filterPlace, filterStatus]);

  const selected = events.find((e) => e.id === selectedId) ?? null;
  const selectedPlaceName = selected?.place_id
    ? places.find((p) => p.id === selected.place_id)?.name ?? null
    : null;

  const now = new Date().toISOString();
  const isUpcoming = (e: Event) => e.date >= now;

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-[--border] rounded-lg px-3 py-1.5 bg-[--surface]"
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {categories.length > 0 && (
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-sm border border-[--border] rounded-lg px-3 py-1.5 bg-[--surface]"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        {places.length > 0 && (
          <select
            value={filterPlace}
            onChange={(e) => setFilterPlace(e.target.value)}
            className="text-sm border border-[--border] rounded-lg px-3 py-1.5 bg-[--surface]"
          >
            <option value="all">All places</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <span className="ml-auto text-xs text-[--foreground-soft]">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        </span>

        <Link
          href="/events/new"
          className="text-sm px-3 py-1.5 rounded-xl bg-[--gold] text-black font-semibold hover:opacity-90 transition-opacity"
        >
          + New event
        </Link>
      </div>

      <div className="flex gap-4 h-[calc(100vh-260px)] min-h-[400px]">
        {/* List (60%) */}
        <div className="w-full lg:w-3/5 overflow-y-auto pr-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-[--foreground-soft]">
              No events match the current filters.
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((event) => {
                const rsvpCount = event.rsvps?.[0]?.count ?? 0;
                const upcoming = isUpcoming(event);
                return (
                  <li key={event.id}>
                    <button
                      onClick={() =>
                        setSelectedId(event.id === selectedId ? null : event.id)
                      }
                      className={[
                        "w-full text-left surface-card rounded-xl p-3 flex gap-3 items-start transition-colors",
                        event.id === selectedId
                          ? "border-[--gold] bg-[--gold-soft]"
                          : "hover:border-[--gold]/40",
                      ].join(" ")}
                    >
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-[--surface-muted] flex-shrink-0">
                        {event.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={event.image_url}
                            alt={event.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">
                            📅
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{event.title}</div>
                        <div className="text-xs text-[--foreground-soft]">
                          {formatDate(event.date)}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {event.category && (
                            <span className="text-xs bg-[--surface-muted] px-2 py-0.5 rounded-full">
                              {event.category}
                            </span>
                          )}
                          <span className="text-xs text-[--foreground-soft]">
                            {rsvpCount} RSVP{rsvpCount !== 1 ? "s" : ""}
                          </span>
                          {!upcoming && (
                            <span className="text-xs text-[--foreground-soft] italic">Past</span>
                          )}
                          {event.status && event.status !== "published" && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full capitalize">
                              {event.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right preview panel (40%) — desktop only */}
        <aside className="hidden lg:flex w-2/5 flex-col surface-card rounded-2xl overflow-hidden">
          {selected ? (
            <>
              <div className="h-44 bg-[--surface-muted] overflow-hidden flex-shrink-0">
                {selected.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.image_url}
                    alt={selected.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl opacity-20">
                    📅
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <h3 className="text-lg font-semibold">{selected.title}</h3>
                <p className="text-sm text-[--foreground-soft]">{formatDate(selected.date)}</p>
                {selectedPlaceName && (
                  <p className="text-sm">
                    <span className="font-medium">Place:</span>{" "}
                    <span className="text-[--foreground-soft]">{selectedPlaceName}</span>
                  </p>
                )}
                {selected.category && (
                  <p className="text-sm">
                    <span className="font-medium">Category:</span>{" "}
                    <span className="text-[--foreground-soft]">{selected.category}</span>
                  </p>
                )}
                <div className="text-sm">
                  <span className="font-medium">RSVPs:</span>{" "}
                  <span className="text-[--foreground-soft]">
                    {selected.rsvps?.[0]?.count ?? 0}
                  </span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Link
                    href={`/events/${selected.id}`}
                    className="flex-1 text-center text-sm py-2 rounded-xl border border-[--border] hover:border-[--gold] transition-colors"
                  >
                    View
                  </Link>
                  <Link
                    href={`/events/${selected.id}/edit`}
                    className="flex-1 text-center text-sm py-2 rounded-xl bg-[--gold] text-black font-semibold hover:opacity-90 transition-opacity"
                  >
                    Edit
                  </Link>
                </div>
                <div className="pt-2 border-t border-[--border] space-y-1">
                  <Link
                    href={`/c/${slug}/dashboard/broadcasts?entity_type=event&entity_id=${selected.id}`}
                    className="block text-sm text-[--gold] hover:underline"
                  >
                    Broadcast to attendees →
                  </Link>
                  <Link
                    href={`/c/${slug}/dashboard/analytics?entity_type=event&entity_id=${selected.id}`}
                    className="block text-sm text-[--gold] hover:underline"
                  >
                    View analytics →
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-[--foreground-soft]">
              Select an event to preview
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
