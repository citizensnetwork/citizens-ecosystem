"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoalForm } from "@/components/goals/GoalForm";
import { GoalProgressBar } from "@/components/goals/GoalProgressBar";
import { ACTIVITY_TYPE_LABELS, GOAL_STATUS_LABELS, GOAL_STATUS_COLOURS } from "@/lib/constants";
import type { GoalWithVision, VisionStatement } from "@/types/db";

interface GoalDetailClientProps {
  goal: GoalWithVision;
  orgId: string;
  orgSlug: string;
  visions: VisionStatement[];
}

interface AlignmentData {
  goal: GoalWithVision;
  links: Array<{
    id: string;
    activity_id: string;
    link_type: string;
    confidence: number;
    approved: boolean | null;
    activities: { id: string; title: string; type: string; date: string };
  }>;
  alignment: { score: number; linked_activities: number; weighted_sum: number };
  department_breakdown: Array<{
    department_id: string;
    department_name: string;
    count: number;
  }>;
}

export function GoalDetailClient({
  goal,
  orgId,
  orgSlug,
  visions,
}: GoalDetailClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [alignmentData, setAlignmentData] = useState<AlignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/goals/${goal.id}/alignment`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !controller.signal.aborted) {
          setAlignmentData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [goal.id]);

  const statusColour = GOAL_STATUS_COLOURS[goal.status] ?? "#abb2bf";
  const score = alignmentData?.alignment?.score ?? 0;

  async function handleDeleteLink(linkId: string) {
    const res = await fetch(
      `/api/goals/${goal.id}/alignment?link_id=${linkId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setAlignmentData((prev) =>
        prev
          ? { ...prev, links: prev.links.filter((l) => l.id !== linkId) }
          : prev
      );
    }
  }

  async function handleApproveLink(linkId: string, approved: boolean) {
    const res = await fetch(`/api/goals/${goal.id}/alignment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_id: linkId, approved }),
    });
    if (res.ok) {
      setAlignmentData((prev) =>
        prev
          ? {
              ...prev,
              links: prev.links.map((l) =>
                l.id === linkId ? { ...l, approved } : l
              ),
            }
          : prev
      );
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this goal? This cannot be undone.")) return;
    const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push(`/${orgSlug}/goals`);
      router.refresh();
    }
  }

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">
            Edit Goal
          </h1>
          <button
            onClick={() => setEditing(false)}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel Edit
          </button>
        </div>
        <GoalForm
          orgId={orgId}
          orgSlug={orgSlug}
          visions={visions}
          initialData={goal}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/${orgSlug}/goals`}
            className="text-sm text-text-secondary hover:text-accent"
          >
            ← Back to Goals
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">
            {goal.title}
          </h1>
          {goal.vision_statements?.title && (
            <p className="mt-1 text-sm text-text-secondary">
              Vision: {goal.vision_statements.title}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              backgroundColor: `${statusColour}20`,
              color: statusColour,
            }}
          >
            {GOAL_STATUS_LABELS[goal.status] ?? goal.status}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="rounded-md border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Description + meta */}
      {goal.description && (
        <p className="text-sm text-text-secondary">{goal.description}</p>
      )}

      <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
        {goal.target_value != null && goal.target_unit && (
          <span>
            Target: {goal.target_value} {goal.target_unit}
          </span>
        )}
        {goal.deadline && (
          <span>
            Deadline: {new Date(goal.deadline).toLocaleDateString("en-ZA")}
          </span>
        )}
        <span>Weight: {goal.priority_weight}</span>
      </div>

      {/* Alignment score */}
      <GoalProgressBar
        goalTitle="Alignment Score"
        score={score}
        priorityWeight={goal.priority_weight}
        deadline={goal.deadline}
      />

      {/* Linked activities */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium text-text-primary">
          Linked Activities{" "}
          {!loading && (
            <span className="text-sm text-text-secondary">
              ({alignmentData?.links.length ?? 0})
            </span>
          )}
        </h2>

        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 rounded-md bg-surface-alt"
              />
            ))}
          </div>
        ) : alignmentData?.links.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No activities linked yet. Link activities from the activity detail
            page or use auto-inference.
          </p>
        ) : (
          <div className="space-y-2">
            {alignmentData?.links.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${orgSlug}/activities/${link.activity_id}`}
                    className="text-sm font-medium text-text-primary hover:text-accent"
                  >
                    {link.activities.title}
                  </Link>
                  <div className="mt-0.5 flex gap-2 text-xs text-text-secondary">
                    <span>
                      {ACTIVITY_TYPE_LABELS[link.activities.type] ??
                        link.activities.type}
                    </span>
                    <span>
                      {new Date(link.activities.date).toLocaleDateString(
                        "en-ZA"
                      )}
                    </span>
                    <span
                      className={
                        link.link_type === "explicit"
                          ? "text-accent"
                          : "text-text-secondary"
                      }
                    >
                      {link.link_type} ({(link.confidence * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {link.link_type === "inferred" && (
                    <>
                      <button
                        onClick={() => handleApproveLink(link.id, true)}
                        className={`rounded px-2 py-1 text-xs ${
                          link.approved === true
                            ? "bg-green-500/20 text-green-400"
                            : "text-text-secondary hover:text-green-400"
                        }`}
                        title="Approve"
                        aria-label="Approve link"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => handleApproveLink(link.id, false)}
                        className={`rounded px-2 py-1 text-xs ${
                          link.approved === false
                            ? "bg-red-500/20 text-red-400"
                            : "text-text-secondary hover:text-red-400"
                        }`}
                        title="Reject"
                        aria-label="Reject link"
                      >
                        ✗
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDeleteLink(link.id)}
                    className="rounded px-2 py-1 text-xs text-text-secondary hover:text-red-400"
                    title="Remove link"
                    aria-label="Remove link"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Department breakdown */}
      {!loading &&
        alignmentData?.department_breakdown &&
        alignmentData.department_breakdown.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium text-text-primary">
              Department Breakdown
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {alignmentData.department_breakdown.map((d) => (
                <div
                  key={d.department_id}
                  className="rounded-md border border-border bg-surface p-3"
                >
                  <span className="text-sm font-medium text-text-primary">
                    {d.department_name}
                  </span>
                  <p className="text-xs text-text-secondary">
                    {d.count} linked{" "}
                    {d.count === 1 ? "activity" : "activities"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
