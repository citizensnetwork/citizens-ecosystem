"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import RSVPButton from "./RSVPButton";
import CommentSection from "./CommentSection";
import WhoIsAttending from "./WhoIsAttending";
import ReviewList from "@/components/reviews/ReviewList";
import ShareButton from "@/components/ui/ShareButton";
import { CATEGORY_LABELS, CATEGORY_BADGE_CLASSES } from "@/lib/categories";
import { buildGoogleCalendarUrl } from "@/lib/calendar";
import type { Event, AttendeesVisibility } from "@/types/db";
import type { User } from "@supabase/supabase-js";

const MiniMap = dynamic(() => import("@/components/map/MiniMap"), {
  ssr: false,
  loading: () => (
    <div className="surface-card h-50 w-full rounded-xl p-3">
      <div className="skeleton h-full w-full rounded-lg" />
    </div>
  ),
});

type Attendee = {
  user_id: string;
  full_name: string;
  isFriend: boolean;
};

type Props = {
  event: Event;
  count: number;
  user: User | null;
  hasRsvped: boolean;
  attendees?: Attendee[];
};

export default function EventDetailContent({
  event,
  count,
  user,
  hasRsvped,
  attendees = [],
}: Props) {
  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  const startStr = new Date(event.date).toLocaleDateString("en-US", dateFmt);

  const endStr = event.end_time
    ? (() => {
        const start = new Date(event.date);
        const end = new Date(event.end_time);
        // Same day? Only show time
        if (start.toDateString() === end.toDateString()) {
          return end.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
        return end.toLocaleDateString("en-US", dateFmt);
      })()
    : null;

  const dateStr = endStr ? `${startStr} – ${endStr}` : startStr;

  const hasCoords = event.latitude != null && event.longitude != null;
  const cat = event.category ?? "other";
  const isCancelled = event.status === "cancelled";
  const isFull =
    event.max_attendees != null && count >= event.max_attendees;

  // Fire-and-forget view tracking
  useEffect(() => {
    fetch(`/api/events/${event.id}/view`, { method: "POST" }).catch(() => {});
  }, [event.id]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <Link href="/events" className="text-(--gold) hover:underline text-sm">
          ← Back to Events
        </Link>
        {user?.id === event.created_by && (
          <Link
            href={`/events/${event.id}/edit`}
            className="text-sm text-gray-500 hover:text-gray-800 border rounded-md px-3 py-1.5"
          >
            ✏️ Edit Event
          </Link>
        )}
      </div>

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-3 rounded-lg mb-4 text-center font-semibold">
          🚫 This event has been cancelled
        </div>
      )}

      {/* Draft banner */}
      {event.status === "draft" && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-lg mb-4 text-center text-sm font-medium">
          📝 Draft — only you can see this event
        </div>
      )}

      {/* Cover image */}
      {event.image_url && (
        <div className="relative w-full h-64 mb-4">
          <Image
            src={event.image_url}
            alt={event.title}
            fill
            className="object-cover rounded-xl"
            sizes="(max-width: 768px) 100vw, 720px"
          />
        </div>
      )}

      {event.category && (
        <div className="mb-2">
          <span
            className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_BADGE_CLASSES[cat]}`}
          >
            {CATEGORY_LABELS[cat]}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">{event.title}</h1>
        <ShareButton title={event.title} />
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 text-gray-600">
          <span className="text-lg">📅</span>
          <span>{dateStr}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <span className="text-lg">📍</span>
          <span>{event.location}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <span className="text-lg">👥</span>
          <span>
            {event.max_attendees
              ? `${count} / ${event.max_attendees} attending`
              : `${count} attending`}
            {isFull && (
              <span className="ml-2 inline-block bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                Sold Out
              </span>
            )}
          </span>
        </div>

        {/* Contact info */}
        {event.website_url && /^https?:\/\//i.test(event.website_url) && (
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-lg">🌐</span>
            <a
              href={event.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--gold) hover:underline"
            >
              {(() => { try { return new URL(event.website_url).hostname; } catch { return event.website_url; } })()}
            </a>
          </div>
        )}
        {event.contact_email && (
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-lg">✉️</span>
            <a
              href={`mailto:${event.contact_email}`}
              className="text-(--gold) hover:underline"
            >
              {event.contact_email}
            </a>
          </div>
        )}
        {event.contact_phone && (
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-lg">📞</span>
            <a
              href={`tel:${event.contact_phone}`}
              className="text-(--gold) hover:underline"
            >
              {event.contact_phone}
            </a>
          </div>
        )}
      </div>

      {hasCoords && (
        <div className="mt-6">
          <MiniMap latitude={event.latitude!} longitude={event.longitude!} />
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-2">About this event</h2>
        <p className="text-gray-700 whitespace-pre-wrap">{event.description}</p>
      </div>

      <div className="mt-8">
        {isCancelled ? (
          <div className="text-gray-400 text-sm font-medium">RSVP is disabled for cancelled events.</div>
        ) : user ? (
          <>
            <RSVPButton eventId={event.id} hasRsvped={hasRsvped} />
            {hasRsvped && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={buildGoogleCalendarUrl(event)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  📅 Add to Google Calendar
                </a>
                <a
                  href={`/api/events/${event.id}/ical`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  📥 Download .ics
                </a>
              </div>
            )}
          </>
        ) : (
          <Link
            href="/login"
            className="inline-block rounded-lg bg-(--gold) px-6 py-2 text-sm font-semibold text-black transition hover:brightness-105"
          >
            Log in to RSVP
          </Link>
        )}
      </div>

      {/* Who's Attending */}
      <div className="mt-10 border-t pt-8">
        <h2 className="text-lg font-semibold mb-4">Who&apos;s Attending</h2>
        <WhoIsAttending
          attendees={attendees}
          totalCount={count}
          visibility={(event.attendees_visible as AttendeesVisibility) ?? "public"}
          isAuthenticated={!!user}
        />
      </div>

      <div className="mt-10 border-t pt-8">
        <ReviewList eventId={event.id} title="Event Reviews" />
      </div>

      {/* Comments */}
      <div className="mt-10 border-t pt-8">
        <CommentSection eventId={event.id} user={user} />
      </div>
    </div>
  );
}

