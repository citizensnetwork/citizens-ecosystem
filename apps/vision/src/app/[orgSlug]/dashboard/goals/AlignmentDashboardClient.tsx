"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AlignmentGauge } from "@/components/goals/AlignmentGauge";
import { GoalProgressBar } from "@/components/goals/GoalProgressBar";
import { AlignmentMatrix } from "@/components/goals/AlignmentMatrix";
import type { AlignmentMatrixEntry } from "@/types/metrics";

interface AlignmentDashboardClientProps {
  orgId: string;
  orgName: string;
  orgSlug: string;
}

interface AlignmentResponse {
  org_alignment: {
    alignment_score: number;
    active_goals: number;
    total_priority_weight: number;
  };
  goal_scores: Array<{
    goal_id: string;
    goal_title: string;
    vision_title: string | null;
    priority_weight: number;
    status: string;
    deadline: string | null;
    alignment_score: number;
    linked_activities: number;
  }>;
  alignment_matrix: AlignmentMatrixEntry[];
}

export function AlignmentDashboardClient({
  orgId,
  orgName,
  orgSlug,
}: AlignmentDashboardClientProps) {
  const [data, setData] = useState<AlignmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/metrics/alignment?org_id=${orgId}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (result && !controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [orgId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          Goals & Alignment — {orgName}
        </h1>
        <div className="animate-pulse space-y-4">
          <div className="mx-auto h-32 w-48 rounded-lg bg-surface-alt" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-surface-alt" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          Goals & Alignment — {orgName}
        </h1>
        <p className="text-sm text-text-secondary">Failed to load alignment data.</p>
      </div>
    );
  }

  const goalTitles: Record<string, string> = {};
  for (const g of data.goal_scores) {
    goalTitles[g.goal_id] = g.goal_title;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/${orgSlug}/dashboard`}
            className="text-sm text-text-secondary hover:text-accent"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">
            Goals & Alignment
          </h1>
        </div>
        <Link
          href={`/${orgSlug}/goals`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          Manage Goals →
        </Link>
      </div>

      {/* Gauge + summary */}
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface p-6 sm:flex-row sm:justify-around">
        <AlignmentGauge score={data.org_alignment.alignment_score} />
        <div className="space-y-2 text-center sm:text-left">
          <div className="text-3xl font-bold text-text-primary">
            {data.org_alignment.active_goals}
          </div>
          <p className="text-sm text-text-secondary">Active Goals</p>
          <div className="text-lg font-medium text-text-primary">
            {data.org_alignment.total_priority_weight.toFixed(1)}
          </div>
          <p className="text-sm text-text-secondary">Total Priority Weight</p>
        </div>
      </div>

      {/* Per-goal progress bars */}
      {data.goal_scores.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-text-primary">
            Goal Alignment Scores
          </h2>
          {data.goal_scores.map((g) => (
            <Link key={g.goal_id} href={`/${orgSlug}/goals/${g.goal_id}`}>
              <GoalProgressBar
                goalTitle={g.goal_title}
                score={g.alignment_score}
                priorityWeight={g.priority_weight}
                deadline={g.deadline}
              />
            </Link>
          ))}
        </div>
      )}

      {/* Alignment matrix */}
      {data.alignment_matrix.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-text-primary">
            Goals × Departments Matrix
          </h2>
          <div className="rounded-lg border border-border bg-surface p-4">
            <AlignmentMatrix
              data={data.alignment_matrix}
              goalTitles={goalTitles}
            />
          </div>
        </div>
      )}

      {data.goal_scores.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text-secondary">
            No active goals yet.{" "}
            <Link
              href={`/${orgSlug}/goals/new`}
              className="text-accent hover:underline"
            >
              Create your first goal
            </Link>{" "}
            to start tracking alignment.
          </p>
        </div>
      )}
    </div>
  );
}
