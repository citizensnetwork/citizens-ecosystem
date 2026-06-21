"use client";

import { useState, useCallback } from "react";
import type { CCPlace } from "@/types/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";

interface ConnectPlaceListProps {
  initialPlaces: CCPlace[];
  orgId: string;
  orgSlug: string;
  total: number;
  page: number;
  perPage: number;
}

export function ConnectPlaceList({
  initialPlaces,
  orgId,
  orgSlug,
  total,
  page,
  perPage,
}: ConnectPlaceListProps) {
  const [places, setPlaces] = useState(initialPlaces);
  const totalPages = Math.ceil(total / perPage);

  const handleClaim = useCallback(
    async (placeId: string) => {
      const res = await fetch(`/api/connect/places/${placeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, action: "claim" }),
      });
      if (res.ok) {
        const claim = await res.json();
        setPlaces((prev) =>
          prev.map((p) =>
            p.cc_place_id === placeId
              ? { ...p, cv_org_id: claim.cv_org_id ?? orgId }
              : p
          )
        );
      }
    },
    [orgId]
  );

  if (places.length === 0) {
    return (
      <EmptyState
        title="No Connect places"
        description="Places you own on Citizens Connect appear here, ready to claim."
      />
    );
  }

  return (
    <div>
      <div className="space-y-3">
        {places.map((place) => (
          <div
            key={place.cc_place_id}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-accent">CC</span>
                <h3 className="font-medium text-text-primary">{place.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                {place.category && (
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-text-secondary">
                    {place.category}
                  </span>
                )}
                {place.verified && (
                  <span className="rounded-full bg-green-900/30 px-2 py-0.5 text-xs text-green-400">
                    Verified
                  </span>
                )}
                {place.cv_org_id ? (
                  <span className="rounded-full bg-accent-light px-2 py-0.5 text-xs text-accent">
                    Claimed
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-text-secondary">
                    Unclaimed
                  </span>
                )}
              </div>
            </div>

            {place.address && (
              <p className="mt-2 text-sm text-text-secondary">{place.address}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
              {place.avg_rating != null && (
                <span>★ {place.avg_rating.toFixed(1)}</span>
              )}
              {place.latitude != null && place.longitude != null && (
                <span>
                  {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                </span>
              )}
            </div>

            {!place.cv_org_id && (
              <div className="mt-3">
                <button
                  onClick={() => handleClaim(place.cc_place_id)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-alt"
                >
                  Associate with Org
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          buildHref={(p) => `/${orgSlug}/connect?tab=places&page=${p}`}
          ariaLabel="Connect places pagination"
        />
      )}
    </div>
  );
}
