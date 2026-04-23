"use client";

/**
 * JoinedEventsView — companion to ManageEventsView. Surfaces every
 * event the current user has RSVPed to (either `attending` or
 * `considering`) so members can review upcoming commitments and
 * remember events they already visited — a self-service alternative
 * to the notifications bell / calendar.
 *
 * Separated into its own component (rather than a prop on
 * ManageEventsView) so each tab can evolve independently — joined
 * events don't need analytics stats, but they *do* benefit from
 * temporal grouping + a clear RSVP badge.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CATEGORY_LABELS, CATEGORY_BADGE_CLASSES } from "@/lib/categories";
import type { EventCategory } from "@/types/db";

type JoinedEvent = {
  id: string;
  title: string;
  date: string;
  end_time: string | null;
  status: string;
  visibility: string;
  category: EventCategory | null;
  location: string | null;
  image_url: string | null;
  created_by: string;
  max_attendees: number | null;
  rsvp_status: "attending" | "considering";
  rsvped_at: string;
};

type Bucket = "upcoming" | "past" | "cancelled";
const BUCKET_LABELS: Record<Bucket, string> = {
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
};
const BUCKET_ORDER: Bucket[] = ["upcoming", "past", "cancelled"];

// ~2 hour fallback mirrors EventStatusBadge + ManageEventsView.
const LIVE_FALLBACK_MS = 2 * 60 * 60 * 1000;

function bucketOf(e: JoinedEvent, now: number): Bucket {
  if (e.status === "cancelled") return "cancelled";
  const start = new Date(e.date).getTime();
  const end = e.end_time ? new Date(e.end_time).getTime() : start + LIVE_FALLBACK_MS;
  if (now <= end) return "upcoming";
  return "past";
}

export default function JoinedEventsView() {
  const [events, setEvents] = useState<JoinedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/manage/joined");
        if (cancelled) return;
        if (!r.ok) {
          setError(
            r.status === 401
              ? "Please sign in again to view your joined events."
              : "We couldn't load your joined events. Please try again in a moment.",
          );
          setLoading(false);
          return;
        }
        const data = await r.json();
        if (cancelled) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(
            "Network error loading your joined events. Please try again.",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const now = Date.now();
    const g: Record<Bucket, JoinedEvent[]> = {
      upcoming: [],
      past: [],
      cancelled: [],
    };
    for (const e of events) g[bucketOf(e, now)].push(e);
    g.upcoming.sort((a, b) => +new Date(a.date) - +new Date(b.date));
    g.past.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    return g;
  }, [events]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {error}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-black/50 text-sm">
          You haven&apos;t RSVPed to any events yet.
        </p>
        <Link
          href="/events"
          className="mt-4 inline-block rounded-lg bg-(--gold) px-4 py-2 text-sm font-semibold text-black"
        >
          Find events
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {BUCKET_ORDER.filter((k) => grouped[k].length > 0).map((k) => (
        <section key={k} className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-black/45">
            {BUCKET_LABELS[k]} · {grouped[k].length}
          </h3>
          <ul className="space-y-3">
            {grouped[k].map((event) => (
              <li key={event.id}>
                <JoinedEventRow event={event} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function JoinedEventRow({ event }: { event: JoinedEvent }) {
  const cat = event.category ?? "church";
  return (
    <Link
      href={`/events/${event.id}`}
      className="flex items-center gap-3 rounded-xl border border-black/8 bg-white p-3 transition hover:bg-black/2"
    >
      {event.image_url ? (
        <Image
          src={event.image_url}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-(--gold)/15 text-base font-semibold text-black/50"
        >
          {event.title.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_BADGE_CLASSES[cat]}`}
          >
            {CATEGORY_LABELS[cat]}
          </span>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
              event.rsvp_status === "attending"
                ? "bg-green-100 text-green-700"
                : "bg-(--gold)/20 text-black"
            }`}
          >
            {event.rsvp_status === "attending" ? "Joined" : "Considering"}
          </span>
          {event.status === "cancelled" && (
            <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
              Cancelled
            </span>
          )}
        </div>
        <h4 className="truncate text-sm font-semibold text-black">
          {event.title}
        </h4>
        <p className="mt-0.5 truncate text-xs text-black/55">
          {new Date(event.date).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </div>
    </Link>
  );
}
