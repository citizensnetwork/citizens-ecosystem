"use client";

import Link from "next/link";
import type { Event, Place } from "@/types/db";
import { CATEGORY_LABELS, CATEGORY_BADGE_CLASSES } from "@/lib/categories";
import { ContributorChip } from "@/components/ui/ContributorChip";
import EventStatusBadge from "@/components/events/EventStatusBadge";
import { isCommunityEvent } from "@/lib/events/capabilities";

interface Props {
  selectedEvent: Event | null;
  selectedPlace: Place | null;
  onClose: () => void;
}

/**
 * Floating preview card that appears over the map when the user taps a marker.
 * Shows a concise summary of either an event or a place, with a CTA to the
 * full detail page. Extracted from EventsView to avoid rendering-rule drift.
 */
export default function EventPreviewPanel({
  selectedEvent,
  selectedPlace,
  onClose,
}: Props) {
  const label = selectedEvent
    ? selectedEvent.title
    : (selectedPlace?.name ?? "Details");

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-1003 bg-black/40"
        role="presentation"
        onClick={onClose}
      />

      {/* Dialog */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="fade-rise absolute inset-0 z-1004 flex items-center justify-center p-4 sm:p-8 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-md max-h-[80dvh] overflow-y-auto rounded-2xl bg-white/90 p-5 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-black/60 hover:bg-black/5"
            aria-label="Close detail"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {selectedEvent && (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_BADGE_CLASSES[selectedEvent.category ?? "church-services"]}`}
                >
                  {CATEGORY_LABELS[selectedEvent.category ?? "church-services"]}
                </span>
                {isCommunityEvent(selectedEvent) && (
                  <ContributorChip variant="community" />
                )}
                <EventStatusBadge
                  status={selectedEvent.status}
                  date={selectedEvent.date}
                  endTime={selectedEvent.end_time}
                  size="sm"
                />
              </div>
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
              <p className="text-xs text-black/60">{selectedEvent.location}</p>
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
              <p className="text-xs text-black/60">{selectedPlace.address}</p>
              {selectedPlace.phone && (
                <p className="text-xs text-black/60">{selectedPlace.phone}</p>
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
  );
}
