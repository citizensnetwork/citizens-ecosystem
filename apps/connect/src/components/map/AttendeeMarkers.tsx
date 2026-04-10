"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { UserLocation } from "@/types/db";

type Props = {
  map: maplibregl.Map | null;
  eventId: string;
  pollIntervalMs?: number;
};

/**
 * Renders live attendee locations as profile photo markers on the map.
 * Polls the location API at a configurable interval.
 * Must receive a maplibregl.Map instance as a prop.
 */
export default function AttendeeMarkers({
  map,
  eventId,
  pollIntervalMs = 15_000,
}: Props) {
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAndRender = useCallback(async () => {
    if (!map) return;
    try {
      const res = await fetch(`/api/location?event_id=${eventId}`);
      if (!res.ok) return;
      const locations: UserLocation[] = await res.json();

      const currentIds = new Set<string>();

      for (const loc of locations) {
        currentIds.add(loc.user_id);
        const existing = markersRef.current.get(loc.user_id);

        if (existing) {
          // Update position
          existing.setLngLat([loc.longitude, loc.latitude]);
        } else {
          // Create new marker
          const el = createAttendeeMarkerEl(
            loc.profiles?.full_name ?? "?",
            loc.profiles?.avatar_url ?? null
          );
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([loc.longitude, loc.latitude])
            .addTo(map);
          markersRef.current.set(loc.user_id, marker);
        }
      }

      // Remove markers for users no longer sharing
      for (const [userId, marker] of markersRef.current) {
        if (!currentIds.has(userId)) {
          marker.remove();
          markersRef.current.delete(userId);
        }
      }
    } catch {
      // Silently fail polling — will retry next interval
    }
  }, [map, eventId]);

  useEffect(() => {
    if (!map) return;
    const markers = markersRef.current;

    fetchAndRender();
    intervalRef.current = setInterval(fetchAndRender, pollIntervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Clean up all markers
      for (const marker of markers.values()) {
        marker.remove();
      }
      markers.clear();
    };
  }, [map, fetchAndRender, pollIntervalMs]);

  // This component renders nothing — markers are added imperatively to the map
  return null;
}

/**
 * Creates a circular profile photo marker element.
 * Shows avatar if available, otherwise initials on gold background.
 */
function createAttendeeMarkerEl(
  name: string,
  avatarUrl: string | null
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid #D4AF37;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    cursor: pointer;
    position: relative;
  `;

  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = name;
    img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
    img.onerror = () => {
      img.remove();
      wrapper.appendChild(createInitialsEl(name));
    };
    wrapper.appendChild(img);
  } else {
    wrapper.appendChild(createInitialsEl(name));
  }

  // Live dot indicator
  const dot = document.createElement("span");
  dot.style.cssText = `
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 10px;
    height: 10px;
    background: #D4AF37;
    border: 2px solid white;
    border-radius: 50%;
  `;
  wrapper.appendChild(dot);

  return wrapper;
}

function createInitialsEl(name: string): HTMLDivElement {
  const el = document.createElement("div");
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  el.textContent = initials || "?";
  el.style.cssText = `
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #D4AF37;
    color: white;
    font-size: 12px;
    font-weight: 700;
  `;
  return el;
}
