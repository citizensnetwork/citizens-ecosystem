"use client";

import { useState, useCallback } from "react";
import { ConnectEventCard } from "./ConnectEventCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import type { CCEvent } from "@/types/db";

interface ConnectEventListProps {
  initialEvents: CCEvent[];
  orgId: string;
  orgSlug: string;
  total: number;
  page: number;
  perPage: number;
}

export function ConnectEventList({
  initialEvents,
  orgId,
  orgSlug,
  total,
  page,
  perPage,
}: ConnectEventListProps) {
  const [events, setEvents] = useState(initialEvents);
  const totalPages = Math.ceil(total / perPage);

  const handleClaim = useCallback(
    async (eventId: string) => {
      const res = await fetch(`/api/connect/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, action: "claim" }),
      });
      if (res.ok) {
        const claim = await res.json();
        setEvents((prev) =>
          prev.map((e) =>
            e.cc_event_id === eventId
              ? {
                  ...e,
                  cv_org_id: claim.cv_org_id ?? orgId,
                  cv_project_id: claim.cv_project_id ?? e.cv_project_id,
                  cv_activity_id: claim.cv_activity_id ?? e.cv_activity_id,
                }
              : e
          )
        );
      }
    },
    [orgId]
  );

  const handlePromote = useCallback(
    async (eventId: string) => {
      const res = await fetch(`/api/connect/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, action: "promote" }),
      });
      if (res.ok) {
        const { activity } = await res.json();
        setEvents((prev) =>
          prev.map((e) =>
            e.cc_event_id === eventId
              ? { ...e, cv_org_id: orgId, cv_activity_id: activity?.id ?? e.cv_activity_id }
              : e
          )
        );
      }
    },
    [orgId]
  );

  if (events.length === 0) {
    return (
      <EmptyState
        title="No Connect events"
        description="Events you publish on Citizens Connect appear here, ready to claim."
      />
    );
  }

  return (
    <div>
      <div className="space-y-3">
        {events.map((event) => (
          <ConnectEventCard
            key={event.cc_event_id}
            event={event}
            orgSlug={orgSlug}
            onClaim={handleClaim}
            onPromote={handlePromote}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          buildHref={(p) => `/${orgSlug}/connect?tab=events&page=${p}`}
          ariaLabel="Connect events pagination"
        />
      )}
    </div>
  );
}
