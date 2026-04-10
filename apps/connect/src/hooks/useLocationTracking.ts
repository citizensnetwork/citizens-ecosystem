"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentPosition } from "@/lib/capacitor/geolocation";

type TrackingState = "idle" | "tracking" | "error";

/**
 * Hook for live location sharing during an RSVP'd event.
 * Sends location updates every `intervalMs` while tracking is active.
 *
 * @param eventId - The event to share location for
 * @param enabled - Whether the user has opted in to location sharing
 * @param intervalMs - Update interval (default 30s)
 */
export function useLocationTracking(
  eventId: string | null,
  enabled: boolean,
  intervalMs = 30_000
) {
  const safeInterval = Math.max(intervalMs, 15_000); // Minimum 15 seconds
  const [state, setState] = useState<TrackingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef(false);

  const clearTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const sendLocation = useCallback(async () => {
    if (!eventId || abortRef.current) return;
    try {
      const pos = await getCurrentPosition();
      const res = await fetch("/api/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          latitude: pos.latitude,
          longitude: pos.longitude,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : "Location update failed");
        setState("error");
        clearTracking(); // Stop polling on error
      }
    }
  }, [eventId, clearTracking]);

  const startTracking = useCallback(() => {
    if (!eventId || !enabled) return;
    abortRef.current = false;
    setState("tracking");
    setError(null);

    // Send immediately, then on interval
    sendLocation();
    intervalRef.current = setInterval(sendLocation, safeInterval);
  }, [eventId, enabled, safeInterval, sendLocation]);

  const stopTracking = useCallback(async () => {
    abortRef.current = true;
    clearTracking();
    setState("idle");

    // Remove location record
    if (eventId) {
      try {
        await fetch("/api/location", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: eventId }),
        });
      } catch {
        // Best effort
      }
    }
  }, [eventId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { state, error, startTracking, stopTracking };
}
