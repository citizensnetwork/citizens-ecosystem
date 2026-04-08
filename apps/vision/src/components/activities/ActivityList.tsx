import { ActivityCard } from "./ActivityCard";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import type { Activity, ActivityTag } from "@/types/db";

interface ActivityListProps {
  activities: (Activity & {
    activity_tags?: ActivityTag[];
    departments?: { name: string } | null;
  })[];
  orgSlug: string;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
  };
}

export function ActivityList({
  activities,
  orgSlug,
  pagination,
}: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <EmptyState
        title="No activities yet"
        description="Log your organisation's first activity to start tracking."
        action={
          <Link
            href={`/${orgSlug}/activities/new`}
            className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover"
          >
            Create Activity
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="space-y-3">
        {activities.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            orgSlug={orgSlug}
          />
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm text-text-secondary">
          <span>
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <div className="flex gap-2">
            {pagination.page > 1 && (
              <Link
                href={`/${orgSlug}/activities?page=${pagination.page - 1}`}
                className="rounded-md border border-border px-3 py-1 hover:bg-surface-alt"
              >
                Previous
              </Link>
            )}
            {pagination.page < pagination.totalPages && (
              <Link
                href={`/${orgSlug}/activities?page=${pagination.page + 1}`}
                className="rounded-md border border-border px-3 py-1 hover:bg-surface-alt"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
