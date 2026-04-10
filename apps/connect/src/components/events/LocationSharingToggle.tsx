"use client";

import { useLocationTracking } from "@/hooks/useLocationTracking";
import type { Event } from "@/types/db";

type Props = {
  event: Event;
  isAttending: boolean;
  locationSharingEnabled: boolean;
};

/**
 * Location sharing toggle for event detail page.
 * Shows during the event window (event.date to event.end_time, or +4h if no end_time).
 * Only visible to RSVP'd attendees who have location_sharing enabled in their profile.
 */
export default function LocationSharingToggle({
  event,
  isAttending,
  locationSharingEnabled,
}: Props) {
  const { state, error, startTracking, stopTracking } = useLocationTracking(
    event.id,
    locationSharingEnabled
  );

  // Determine if event is currently happening
  const now = new Date();
  const eventStart = new Date(event.date);
  const eventEnd = event.end_time
    ? new Date(event.end_time)
    : new Date(eventStart.getTime() + 4 * 60 * 60 * 1000); // +4h default

  const isOngoing = now >= eventStart && now <= eventEnd;

  // Don't show if not attending, not ongoing, or sharing disabled
  if (!isAttending || !isOngoing || !locationSharingEnabled) {
    return null;
  }

  function handleToggle() {
    if (state === "tracking") {
      stopTracking();
    } else {
      startTracking();
    }
  }

  return (
    <div className="rounded-xl border border-(--gold)/20 bg-(--gold-soft) p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-5 w-5 ${state === "tracking" ? "text-(--gold)" : "text-black/40"}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-black">
              {state === "tracking" ? "Sharing location" : "Share your location"}
            </p>
            <p className="text-xs text-black/50">
              {state === "tracking"
                ? "Visible to other attendees"
                : "Let other attendees see you on the map"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            state === "tracking" ? "bg-(--gold)" : "bg-black/20"
          }`}
          role="switch"
          aria-checked={state === "tracking"}
          aria-label="Toggle location sharing"
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              state === "tracking" ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {state === "tracking" && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-(--gold)" />
          <span className="text-xs text-(--gold)">Live</span>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
