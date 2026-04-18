import { ActivityCard } from "./ActivityCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
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

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          buildHref={(p) => `/${orgSlug}/activities?page=${p}`}
          ariaLabel="Activities pagination"
        />
      )}
    </div>
  );
}
