"use client";

import Link from "next/link";
import { GoalCard } from "./GoalCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { GoalWithVision } from "@/types/db";

interface GoalListProps {
  goals: GoalWithVision[];
  orgSlug: string;
  page: number;
  totalPages: number;
  goalScores?: Record<string, number>;
}

export function GoalList({
  goals,
  orgSlug,
  page,
  totalPages,
  goalScores,
}: GoalListProps) {
  if (goals.length === 0) {
    return (
      <EmptyState
        title="No goals yet"
        description="Create your first goal to start tracking alignment."
      />
    );
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            orgSlug={orgSlug}
            alignmentScore={goalScores?.[goal.id]}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Goal list pagination" className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`?page=${page - 1}`}
              aria-label="Go to previous page"
              className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-text-secondary">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`?page=${page + 1}`}
              aria-label="Go to next page"
              className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
