"use client";

import { useEffect, useState } from "react";
import { useLocationTracking } from "@/hooks/useLocationTracking";

type Props = {
  eventId: string;
  eventDate: string;
  hasRsvped: boolean;
  locationSharingEnabled: boolean;
};

/**
 * Auto-prompt for live location tracking 10 minutes before event starts.
 * Shows a dismissible notification-style prompt.
 */
export default function LiveTrackingPrompt({
  eventId,
  eventDate,
  hasRsvped,
  locationSharingEnabled,
}: Props) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { state, startTracking, stopTracking } = useLocationTracking(
    eventId,
    locationSharingEnabled
  );

  useEffect(() => {
    if (!hasRsvped || dismissed) return;

    const eventStart = new Date(eventDate).getTime();
    const now = Date.now();
    const tenMinsBefore = eventStart - 10 * 60 * 1000;

    // If event starts in less than 10 minutes, show prompt
    if (now >= tenMinsBefore && now < eventStart) {
      setShowPrompt(true);
      return;
    }

    // If event hasn't started yet, set a timer
    if (now < tenMinsBefore) {
      const delay = tenMinsBefore - now;
      const timer = setTimeout(() => setShowPrompt(true), delay);
      return () => clearTimeout(timer);
    }

    // Event already started — show prompt if within first 30 minutes
    if (now >= eventStart && now < eventStart + 30 * 60 * 1000) {
      setShowPrompt(true);
    }
  }, [eventDate, hasRsvped, dismissed]);

  if (!showPrompt || dismissed || state === "tracking") return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-md rounded-2xl border border-(--gold)/30 bg-white p-4 shadow-2xl sm:left-auto sm:right-4 sm:w-96">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--gold-soft)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-(--gold)">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-black">Turn on Live Location?</p>
          <p className="text-xs text-black/60 mt-1">
            Show friends and attendees where you are. Keep security teams up to date.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                startTracking();
                setShowPrompt(false);
              }}
              className="rounded-lg bg-(--gold) px-4 py-1.5 text-xs font-semibold text-black transition hover:brightness-95"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                setShowPrompt(false);
              }}
              className="rounded-lg border px-4 py-1.5 text-xs font-medium text-black/60 transition hover:bg-black/5"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
