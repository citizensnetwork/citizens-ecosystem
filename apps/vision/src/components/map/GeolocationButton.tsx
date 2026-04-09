"use client";

import { useState, useCallback } from "react";

interface GeolocationButtonProps {
  onLocate: (lat: number, lng: number) => void;
}

export function GeolocationButton({ onLocate }: GeolocationButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onLocate(position.coords.latitude, position.coords.longitude);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError("Location access denied");
            break;
          case err.POSITION_UNAVAILABLE:
            setError("Location unavailable");
            break;
          case err.TIMEOUT:
            setError("Location request timed out");
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, [onLocate]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary shadow-lg transition-colors hover:bg-surface-alt disabled:opacity-50"
        aria-label="Centre map on my location"
        title="Centre on my location"
      >
        {loading ? (
          <span className="animate-pulse">◎</span>
        ) : (
          <span>◎</span>
        )}
        <span className="hidden sm:inline">My Location</span>
      </button>
      {error && (
        <div className="absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded bg-red-900/80 px-2 py-1 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
