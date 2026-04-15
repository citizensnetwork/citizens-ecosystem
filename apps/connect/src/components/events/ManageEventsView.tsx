"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORY_LABELS, CATEGORY_BADGE_CLASSES } from "@/lib/categories";
import type { EventCategory } from "@/types/db";

type ManagedEvent = {
  id: string;
  title: string;
  date: string;
  end_time: string | null;
  status: string;
  category: EventCategory | null;
  max_attendees: number | null;
  attendee_count: number;
  consider_count: number;
  view_count: number;
  attendees: { full_name: string; created_at: string }[];
};

type Props = {
  isVendor?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ManageEventsView({ isVendor }: Props) {
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/manage/events")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-black/50 text-sm">You haven&apos;t created any events yet.</p>
        <Link
          href="/events/new"
          className="mt-4 inline-block rounded-lg bg-(--gold) px-4 py-2 text-sm font-semibold text-black"
        >
          Create Event
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const cat = event.category ?? "church";
        const isExpanded = expandedId === event.id;
        const isFull = event.max_attendees != null && event.attendee_count >= event.max_attendees;

        return (
          <div
            key={event.id}
            className="rounded-xl border border-black/8 bg-white overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : event.id)}
              className="w-full px-5 py-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_BADGE_CLASSES[cat]}`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                        event.status === "published"
                          ? "bg-green-100 text-green-700"
                          : event.status === "cancelled"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {event.status}
                    </span>
                    {isFull && (
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        Sold Out
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm truncate">{event.title}</h3>
                  <p className="text-xs text-black/50 mt-0.5">
                    {new Date(event.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {/* Stats */}
                <div className="flex gap-4 text-center shrink-0">
                  <div>
                    <p className="text-lg font-bold text-black">{event.attendee_count}</p>
                    <p className="text-[10px] text-black/50">Attending</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-(--gold)">{event.consider_count}</p>
                    <p className="text-[10px] text-black/50">Considering</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-black/40">{event.view_count}</p>
                    <p className="text-[10px] text-black/50">Views</p>
                  </div>
                </div>
              </div>
            </button>

            {/* Expanded: attendee list + actions */}
            {isExpanded && (
              <div className="border-t border-black/5 px-5 py-4">
                <div className="flex gap-2 mb-4">
                  <Link
                    href={`/events/${event.id}`}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
                  >
                    View Event
                  </Link>
                  <Link
                    href={`/events/${event.id}/edit`}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
                  >
                    Edit Event
                  </Link>
                </div>

                {event.attendees.length > 0 ? (
                  <div>
                    <h4 className="text-xs font-semibold text-black/50 uppercase tracking-wider mb-2">
                      Attendees ({event.attendee_count})
                    </h4>
                    <ul className="space-y-1">
                      {event.attendees.map((a, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <span>{a.full_name}</span>
                          <span className="text-xs text-black/40">
                            {new Date(a.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-black/40">No attendees yet.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
