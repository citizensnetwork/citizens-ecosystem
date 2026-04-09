"use client";

import { useEffect, useState, useCallback } from "react";
import { MapView } from "@/components/map/MapView";
import { MapDetailPanel } from "@/components/map/MapDetailPanel";
import { MapSearchBar } from "@/components/map/MapSearchBar";
import { MapFilters } from "@/components/map/MapFilters";
import { LayerToggle } from "@/components/map/LayerToggle";
import { GeolocationButton } from "@/components/map/GeolocationButton";
import type { MapActivity } from "@/lib/map/utils";
import type { Department } from "@/types/db";

interface MapPageClientProps {
  orgId: string;
  orgSlug: string;
  departments: Department[];
  apiQuery: string;
}

export function MapPageClient({ orgId, orgSlug, departments, apiQuery }: MapPageClientProps) {
  const [activities, setActivities] = useState<MapActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep orgId in scope for potential future use
  void orgId;

  useEffect(() => {
    let cancelled = false;

    async function fetchActivities() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/map/activities?${apiQuery}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load map data");
        }
        const { data } = await res.json();
        if (!cancelled) {
          setActivities(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load map data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchActivities();
    return () => {
      cancelled = true;
    };
  }, [apiQuery]);

  const handleSearchSelect = useCallback((_lat: number, lng: number) => {
    // Access the map instance through a global approach —
    // the MapView component responds to viewport changes via the store
    // For search, we dispatch a custom event the map can listen to
    window.dispatchEvent(
      new CustomEvent("cv-map-fly-to", { detail: { lng, lat: _lat, zoom: 14 } })
    );
  }, []);

  const handleGeolocate = useCallback((lat: number, lng: number) => {
    window.dispatchEvent(
      new CustomEvent("cv-map-fly-to", { detail: { lng, lat, zoom: 14 } })
    );
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      {/* Toolbar — absolute over the map */}
      <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
        {/* Search + Geolocation row */}
        <div className="flex items-center gap-2">
          <MapSearchBar onSelect={handleSearchSelect} />
          <GeolocationButton onLocate={handleGeolocate} />
        </div>

        {/* Filters */}
        <div className="rounded-lg border border-border bg-surface/90 p-2 backdrop-blur-sm">
          <MapFilters orgSlug={orgSlug} departments={departments} />
        </div>
      </div>

      {/* Layer toggle — top right */}
      <div className="absolute right-4 top-4 z-10">
        <LayerToggle />
      </div>

      {/* Activity count badge */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="rounded-lg border border-border bg-surface/90 px-3 py-1.5 text-sm text-text-secondary backdrop-blur-sm">
          {loading ? (
            "Loading activities…"
          ) : error ? (
            <span className="text-red-400">{error}</span>
          ) : (
            <span>
              <strong className="text-text-primary">{activities.length}</strong>{" "}
              {activities.length === 1 ? "activity" : "activities"} on map
            </span>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <MapView activities={activities} orgSlug={orgSlug} />
        <MapDetailPanel orgSlug={orgSlug} />
      </div>
    </div>
  );
}
