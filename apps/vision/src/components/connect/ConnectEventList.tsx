"use client";

import { useState, useCallback } from "react";
import { ConnectEventCard } from "./ConnectEventCard";
import { EmptyState } from "@/components/ui/EmptyState";
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
        const updated = await res.json();
        setEvents((prev) =>
          prev.map((e) => (e.cc_event_id === eventId ? updated : e))
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
        description="Events from Citizens Connect will appear here once synced."
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
        <div className="mt-6 flex items-center justify-between text-sm text-text-secondary">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/${orgSlug}/connect?tab=events&page=${page - 1}`}
                className="rounded-md border border-border px-3 py-1 hover:bg-surface-alt"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/${orgSlug}/connect?tab=events&page=${page + 1}`}
                className="rounded-md border border-border px-3 py-1 hover:bg-surface-alt"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
