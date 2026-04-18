"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import RSVPButton from "./RSVPButton";
import CommentSection from "./CommentSection";
import EventUpdatesList from "./EventUpdatesList";
import WhoIsAttending from "./WhoIsAttending";
import LiveTrackingPrompt from "./LiveTrackingPrompt";
import InlineEventRating from "@/components/reviews/InlineEventRating";
import SocialShareButtons from "@/components/ui/SocialShareButtons";
import MessageButton from "@/components/messaging/MessageButton";
import LocationSharingToggle from "./LocationSharingToggle";
import EventMediaStrip from "./EventMediaStrip";
import { CATEGORY_LABELS, CATEGORY_BADGE_CLASSES } from "@/lib/categories";
import { buildGoogleCalendarUrl } from "@/lib/calendar";
import type { Event, AttendeesVisibility, EventMedia } from "@/types/db";
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
  locationSharingEnabled?: boolean;
  media?: EventMedia[];
};

export default function EventDetailContent({
  event,
  count,
  user,
  hasRsvped,
  attendees = [],
  locationSharingEnabled = false,
  media = [],
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
  const cat = event.category ?? "church";
  const isCancelled = event.status === "cancelled";
  const isFull =
    event.max_attendees != null && count >= event.max_attendees;

  // Live event detection
  const now = new Date();
  const eventStart = new Date(event.date);
  const eventEnd = event.end_time ? new Date(event.end_time) : new Date(eventStart.getTime() + 2 * 60 * 60 * 1000);
  const isLive = eventStart <= now && eventEnd > now;
  const hasStarted = eventStart <= now;
  const durationMs = eventEnd.getTime() - eventStart.getTime();
  const isInSession = isLive && durationMs > 5 * 60 * 60 * 1000;

  // Fire-and-forget view tracking
  useEffect(() => {
    fetch(`/api/events/${event.id}/view`, { method: "POST" }).catch(() => {});
  }, [event.id]);

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-start justify-center px-4 py-6">
      <div className="glass-panel w-full max-w-2xl px-5 py-6 sm:px-6">
      <div className="flex items-center justify-between mb-3">
        <Link href="/events" className="text-(--gold) hover:underline text-xs">
          ← Back to Events
        </Link>
        {user?.id === event.created_by && (
          <Link
            href={`/events/${event.id}/edit`}
            className="text-xs text-black/60 hover:text-black border border-black/15 rounded-xl px-2.5 py-1 transition hover:bg-black/5"
          >
            Edit Event
          </Link>
        )}
      </div>

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="bg-red-100 border border-red-300 text-red-800 px-3 py-2 rounded-lg mb-3 text-center text-xs font-semibold">
          This event has been cancelled
        </div>
      )}

      {/* Draft banner */}
      {event.status === "draft" && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-3 py-2 rounded-lg mb-3 text-center text-xs font-medium">
          Draft — only you can see this event
        </div>
      )}

      {/* Cover image */}
      {event.image_url && (
        <div className="relative w-full h-48 mb-3">
          <Image
            src={event.image_url}
            alt={event.title}
            fill
            className="object-cover rounded-xl"
            sizes="(max-width: 768px) 100vw, 720px"
          />
        </div>
      )}

      {/* Organiser media gallery (photos + videos) */}
      <EventMediaStrip media={media} />

      {event.category && (
        <div className="mb-1.5 flex items-center gap-2">
          <span
            className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_BADGE_CLASSES[cat]}`}
          >
            {CATEGORY_LABELS[cat]}
          </span>
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              {isInSession ? "In Session" : "Live"}
            </span>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold leading-tight">{event.title}</h1>
      </div>

      {/* Inline star rating */}
      <div className="mt-0.5">
        <InlineEventRating eventId={event.id} isAuthenticated={!!user} />
      </div>

      {/* Social sharing */}
      <div className="mt-2">
        <SocialShareButtons
          title={event.title}
          description={`${new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${event.location}`}
        />
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 text-black/60 text-xs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>{dateStr}</span>
        </div>
        <div className="flex items-center gap-2 text-black/60 text-xs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>{event.location}</span>
        </div>
        <div className="flex items-center gap-2 text-black/60 text-xs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>
            {event.max_attendees
              ? `${count} / ${event.max_attendees} attending`
              : `${count} attending`}
            {isFull && (
              <span className="ml-1.5 inline-block bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                Sold Out
              </span>
            )}
          </span>
        </div>

        {/* Contact info */}
        {event.website_url && /^https?:\/\//i.test(event.website_url) && (
          <div className="flex items-center gap-2 text-gray-600 text-xs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
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
          <div className="flex items-center gap-2 text-gray-600 text-xs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <a
              href={`mailto:${event.contact_email}`}
              className="text-(--gold) hover:underline"
            >
              {event.contact_email}
            </a>
          </div>
        )}
        {event.contact_phone && (
          <div className="flex items-center gap-2 text-gray-600 text-xs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
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
        <div className="mt-4">
          <MiniMap latitude={event.latitude!} longitude={event.longitude!} eventId={hasRsvped ? event.id : undefined} />
        </div>
      )}

      <div className="mt-4">
        <h2 className="text-sm font-semibold mb-1">About this event</h2>
        <p className="text-xs text-black/70 whitespace-pre-wrap leading-relaxed">{event.description}</p>
      </div>

      <div className="mt-6">
        {isCancelled ? (
          <div className="text-black/40 text-xs font-medium">RSVP is disabled for cancelled events.</div>
        ) : hasStarted && !hasRsvped ? (
          <div className="text-black/40 text-xs font-medium">This event has already started. RSVP is no longer available.</div>
        ) : user ? (
          <>
            <RSVPButton eventId={event.id} hasRsvped={hasRsvped} />
            {hasRsvped && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <a
                  href={buildGoogleCalendarUrl(event)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-(--gold)/40 bg-(--gold-soft) px-2.5 py-1 text-[10px] font-medium text-black hover:bg-(--gold)/20 transition"
                >
                  Add to Google Calendar
                </a>
                <a
                  href={`/api/events/${event.id}/ical`}
                  download
                  className="inline-flex items-center gap-1 rounded-xl border border-(--gold)/40 bg-(--gold-soft) px-2.5 py-1 text-[10px] font-medium text-black hover:bg-(--gold)/20 transition"
                >
                  Download .ics
                </a>
              </div>
            )}
          </>
        ) : (
          <Link
            href="/login"
            className="inline-block rounded-lg bg-(--gold) px-5 py-1.5 text-xs font-semibold text-black transition hover:brightness-105"
          >
            Log in to RSVP
          </Link>
        )}
      </div>

      {/* Live Location Sharing */}
      {user && hasRsvped && (
        <div className="mt-3">
          <LocationSharingToggle
            event={event}
            isAttending={hasRsvped}
            locationSharingEnabled={locationSharingEnabled}
          />
        </div>
      )}

      {/* Message Organizer */}
      {user && user.id !== event.created_by && (
        <div className="mt-4">
          <MessageButton
            recipientId={event.created_by}
            recipientName="Organizer"
          />
        </div>
      )}

      {/* Who's Attending */}
      <div className="mt-6 border-t pt-5">
        <h2 className="text-sm font-semibold mb-3">Who&apos;s Attending</h2>
        <WhoIsAttending
          attendees={attendees}
          totalCount={count}
          visibility={(event.attendees_visible as AttendeesVisibility) ?? "public"}
          isAuthenticated={!!user}
        />
      </div>

      {/* From the Organiser — read-only feed of organiser-authored
          updates (composer lives in /events/manage).  Self-hides when
          the event has no updates yet so it doesn't add visual noise to
          the long tail of brand-new events. */}
      <div className="mt-6 border-t pt-5">
        <EventUpdatesList eventId={event.id} />
      </div>

      {/* Comments */}
      <div className="mt-6 border-t pt-5">
        <CommentSection eventId={event.id} user={user} />
      </div>

      {/* Live location tracking prompt */}
      {user && hasRsvped && (
        <LiveTrackingPrompt
          eventId={event.id}
          eventDate={event.date}
          hasRsvped={hasRsvped}
          locationSharingEnabled={locationSharingEnabled}
        />
      )}
      </div>
    </div>
  );
}

