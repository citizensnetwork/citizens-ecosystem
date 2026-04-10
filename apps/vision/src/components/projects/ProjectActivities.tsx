"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";

interface LinkedActivity {
  activity_id: string;
  activities: {
    id: string;
    title: string;
    type: string;
    date: string;
    location_name?: string | null;
  };
}

interface ProjectActivitiesProps {
  projectId: string;
  orgSlug: string;
  canEdit: boolean;
}

export function ProjectActivities({
  projectId,
  orgSlug,
  canEdit,
}: ProjectActivitiesProps) {
  const [links, setLinks] = useState<LinkedActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/activities`);
        if (res.ok) {
          const { data } = await res.json();
          setLinks(data ?? []);
        }
      } catch (err) {
        console.error("[ProjectActivities] load", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  async function handleUnlink(activityId: string) {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/activities?activity_id=${activityId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setLinks(links.filter((l) => l.activity_id !== activityId));
      }
    } catch (err) {
      console.error("[ProjectActivities] unlink", err);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-medium text-text-primary">
          Linked Activities
        </h3>
        <div className="h-16 animate-pulse rounded bg-surface-alt" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-text-primary">
        Linked Activities ({links.length})
      </h3>

      {links.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No activities linked yet. Link activities from the activity form.
        </p>
      ) : (
        <ul className="space-y-1.5" role="list" aria-label="Linked activities">
          {links.map((link) => (
            <li
              key={link.activity_id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-surface-alt"
            >
              <Link
                href={`/${orgSlug}/activities/${link.activities.id}`}
                className="min-w-0 flex-1 text-sm text-text-primary hover:text-accent"
              >
                <span className="mr-2 text-xs text-text-secondary">
                  {ACTIVITY_TYPE_LABELS[link.activities.type] ??
                    link.activities.type}
                </span>
                {link.activities.title}
                <span className="ml-2 text-xs text-text-secondary">
                  {new Date(link.activities.date).toLocaleDateString("en-ZA")}
                </span>
              </Link>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleUnlink(link.activity_id)}
                  className="ml-2 shrink-0 text-xs text-text-secondary hover:text-red-400"
                  aria-label={`Unlink "${link.activities.title}"`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
