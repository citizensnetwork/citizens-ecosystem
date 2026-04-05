"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import RSVPButton from "./RSVPButton";
import CommentSection from "./CommentSection";
import ReviewList from "@/components/reviews/ReviewList";
import ShareButton from "@/components/ui/ShareButton";
import type { Event, EventCategory } from "@/types/db";
import type { User } from "@supabase/supabase-js";

const CATEGORY_LABELS: Record<EventCategory, string> = {
  "church-service": "⛪ Church Service",
  youth: "🌟 Youth",
  "community-outreach": "🤝 Community Outreach",
  worship: "🎵 Worship Night",
  "bible-study": "📖 Bible Study",
  prayer: "🙏 Prayer Meeting",
  social: "🎉 Social",
  other: "📌 Other",
};

const CATEGORY_COLORS: Record<EventCategory, string> = {
  "church-service": "bg-[var(--gold-soft)] text-black",
  youth: "bg-[var(--gold-soft)] text-black",
  "community-outreach": "bg-[var(--gold-soft)] text-black",
  worship: "bg-[var(--gold-soft)] text-black",
  "bible-study": "bg-[var(--gold-soft)] text-black",
  prayer: "bg-[var(--gold-soft)] text-black",
  social: "bg-[var(--gold-soft)] text-black",
  other: "bg-black/5 text-black/70",
};

const MiniMap = dynamic(() => import("@/components/map/MiniMap"), {
  ssr: false,
  loading: () => (
    <div className="surface-card h-[200px] w-full rounded-xl p-3">
      <div className="skeleton h-full w-full rounded-lg" />
    </div>
  ),
});

type Props = {
  event: Event;
  count: number;
  user: User | null;
  hasRsvped: boolean;
};

export default function EventDetailContent({
  event,
  count,
  user,
  hasRsvped,
}: Props) {
  const dateStr = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const hasCoords = event.latitude != null && event.longitude != null;
  const cat = event.category ?? "other";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <Link href="/events" className="text-blue-600 hover:underline text-sm">
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
            className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat]}`}
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
          <span>{count} attending</span>
        </div>
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
        {user ? (
          <RSVPButton eventId={event.id} hasRsvped={hasRsvped} />
        ) : (
          <Link
            href="/login"
            className="inline-block rounded-lg bg-[var(--gold)] px-6 py-2 text-sm font-semibold text-black transition hover:brightness-105"
          >
            Log in to RSVP
          </Link>
        )}
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

