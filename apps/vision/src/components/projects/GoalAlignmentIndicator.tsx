"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  GOAL_STATUS_LABELS,
  GOAL_STATUS_COLOURS,
} from "@/lib/constants";

interface LinkedGoal {
  goal_id: string;
  goals: {
    id: string;
    title: string;
    status: string;
  };
}

interface GoalAlignmentIndicatorProps {
  projectId: string;
  orgSlug: string;
  canEdit: boolean;
}

export function GoalAlignmentIndicator({
  projectId,
  orgSlug,
  canEdit,
}: GoalAlignmentIndicatorProps) {
  const [links, setLinks] = useState<LinkedGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/goals`);
        if (res.ok) {
          const { data } = await res.json();
          setLinks(data ?? []);
        }
      } catch (err) {
        console.error("[GoalAlignmentIndicator] load", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  async function handleUnlink(goalId: string) {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/goals?goal_id=${goalId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setLinks(links.filter((l) => l.goal_id !== goalId));
      }
    } catch (err) {
      console.error("[GoalAlignmentIndicator] unlink", err);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-medium text-text-primary">
          Goal Alignment
        </h3>
        <div className="h-12 animate-pulse rounded bg-surface-alt" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-text-primary">
        Goal Alignment ({links.length})
      </h3>

      {links.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No goals linked. Link goals when creating or editing the project.
        </p>
      ) : (
        <ul className="space-y-1.5" role="list" aria-label="Linked goals">
          {links.map((link) => {
            const colour =
              GOAL_STATUS_COLOURS[link.goals.status] ?? "#abb2bf";
            return (
              <li
                key={link.goal_id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-surface-alt"
              >
                <Link
                  href={`/${orgSlug}/goals/${link.goals.id}`}
                  className="min-w-0 flex-1 text-sm text-text-primary hover:text-accent"
                >
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: colour }}
                  />
                  {link.goals.title}
                  <span className="ml-2 text-xs text-text-secondary">
                    {GOAL_STATUS_LABELS[link.goals.status] ??
                      link.goals.status}
                  </span>
                </Link>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleUnlink(link.goal_id)}
                    className="ml-2 shrink-0 text-xs text-text-secondary hover:text-red-400"
                    aria-label={`Unlink "${link.goals.title}"`}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
