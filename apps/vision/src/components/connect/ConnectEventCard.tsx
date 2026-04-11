"use client";

import type { CCEvent } from "@/types/db";

interface ConnectEventCardProps {
  event: CCEvent;
  orgSlug: string;
  onClaim?: (eventId: string) => void;
  onPromote?: (eventId: string) => void;
}

export function ConnectEventCard({
  event,
  orgSlug,
  onClaim,
  onPromote,
}: ConnectEventCardProps) {
  const isClaimed = !!event.cv_org_id;
  const isPromoted = !!event.cv_activity_id;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-accent">CC</span>
          <h3 className="font-medium text-text-primary">{event.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {event.category && (
            <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-text-secondary">
              {event.category}
            </span>
          )}
          {isPromoted ? (
            <span className="rounded-full bg-green-900/30 px-2 py-0.5 text-xs text-green-400">
              Promoted
            </span>
          ) : isClaimed ? (
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

      {event.description && (
        <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
          {event.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        {event.date && <span>{new Date(event.date).toLocaleDateString()}</span>}
        {event.location && <span>{event.location}</span>}
        {event.rsvp_count > 0 && <span>{event.rsvp_count} RSVPs</span>}
        {event.avg_rating != null && <span>★ {event.avg_rating.toFixed(1)}</span>}
      </div>

      {!isPromoted && (
        <div className="mt-3 flex gap-2">
          {!isClaimed && onClaim && (
            <button
              onClick={() => onClaim(event.cc_event_id)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-alt"
            >
              Claim for Org
            </button>
          )}
          {isClaimed && onPromote && (
            <button
              onClick={() => onPromote(event.cc_event_id)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-highlight transition-colors hover:bg-accent-hover"
            >
              Promote to Activity
            </button>
          )}
          {isPromoted && (
            <a
              href={`/${orgSlug}/activities/${event.cv_activity_id}`}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-surface-alt"
            >
              View Activity
            </a>
          )}
        </div>
      )}
    </div>
  );
}
