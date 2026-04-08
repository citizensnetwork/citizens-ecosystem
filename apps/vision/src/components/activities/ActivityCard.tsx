import Link from "next/link";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS } from "@/lib/constants";
import type { Activity, ActivityTag } from "@/types/db";

interface ActivityCardProps {
  activity: Activity & { activity_tags?: ActivityTag[]; departments?: { name: string } | null };
  orgSlug: string;
}

export function ActivityCard({ activity, orgSlug }: ActivityCardProps) {
  return (
    <Link
      href={`/${orgSlug}/activities/${activity.id}`}
      className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent hover:bg-surface-alt"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">
            {ACTIVITY_TYPE_ICONS[activity.type] ?? "📋"}
          </span>
          <h3 className="font-medium text-text-primary">{activity.title}</h3>
        </div>
        <span className="rounded-full bg-accent-light px-2 py-0.5 text-xs text-accent">
          {ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type}
        </span>
      </div>

      {activity.description && (
        <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
          {activity.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        <span>{activity.date}</span>
        {activity.location_name && <span>📍 {activity.location_name}</span>}
        {activity.participant_count > 0 && (
          <span>👥 {activity.participant_count}</span>
        )}
        {activity.departments && (
          <span className="text-accent">{activity.departments.name}</span>
        )}
      </div>

      {activity.activity_tags && activity.activity_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {activity.activity_tags.map((t) => (
            <span
              key={t.tag}
              className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-text-secondary"
            >
              {t.tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
