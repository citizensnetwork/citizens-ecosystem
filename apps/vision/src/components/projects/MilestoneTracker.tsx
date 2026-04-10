"use client";

import { useState } from "react";
import type { Milestone } from "@/types/db";

interface MilestoneTrackerProps {
  projectId: string;
  milestones: Milestone[];
  canEdit: boolean;
}

export function MilestoneTracker({
  projectId,
  milestones: initialMilestones,
  canEdit,
}: MilestoneTrackerProps) {
  const [milestones, setMilestones] = useState(initialMilestones);
  const [newTitle, setNewTitle] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const completed = milestones.filter((m) => m.completed_at !== null).length;
  const total = milestones.length;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  async function handleAdd() {
    if (!newTitle.trim()) return;
    setAdding(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          target_date: newTargetDate || undefined,
          sort_order: milestones.length,
        }),
      });

      if (res.ok) {
        const { data } = await res.json();
        setMilestones([...milestones, data]);
        setNewTitle("");
        setNewTargetDate("");
      }
    } catch (err) {
      console.error("[MilestoneTracker] add", err);
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(milestone: Milestone) {
    setToggling(milestone.id);
    const isCompleting = !milestone.completed_at;

    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestone_id: milestone.id,
          completed_at: isCompleting ? new Date().toISOString() : null,
        }),
      });

      if (res.ok) {
        const { data } = await res.json();
        setMilestones(
          milestones.map((m) => (m.id === milestone.id ? data : m))
        );
      }
    } catch (err) {
      console.error("[MilestoneTracker] toggle", err);
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(milestoneId: string) {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/milestones?milestone_id=${milestoneId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        setMilestones(milestones.filter((m) => m.id !== milestoneId));
      }
    } catch (err) {
      console.error("[MilestoneTracker] delete", err);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">
          Milestones ({completed}/{total})
        </h3>
        {total > 0 && (
          <span className="text-xs text-text-secondary">{progressPct}%</span>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-alt">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Milestone list */}
      <ul className="space-y-2" role="list" aria-label="Milestones">
        {milestones.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-alt"
          >
            {canEdit ? (
              <button
                type="button"
                onClick={() => handleToggle(m)}
                disabled={toggling === m.id}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-xs transition-colors hover:border-accent disabled:opacity-50"
                aria-label={
                  m.completed_at
                    ? `Mark "${m.title}" incomplete`
                    : `Mark "${m.title}" complete`
                }
              >
                {m.completed_at && (
                  <span className="text-accent">✓</span>
                )}
              </button>
            ) : (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-xs">
                {m.completed_at && <span className="text-accent">✓</span>}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <span
                className={`text-sm ${
                  m.completed_at
                    ? "text-text-secondary line-through"
                    : "text-text-primary"
                }`}
              >
                {m.title}
              </span>
              {m.target_date && (
                <span className="ml-2 text-xs text-text-secondary">
                  {new Date(m.target_date).toLocaleDateString("en-ZA")}
                </span>
              )}
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={() => handleDelete(m.id)}
                className="shrink-0 text-xs text-text-secondary hover:text-red-400"
                aria-label={`Delete "${m.title}"`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Add milestone form */}
      {canEdit && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            placeholder="New milestone…"
            aria-label="New milestone title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            maxLength={300}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-alt px-2.5 py-1.5 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none"
          />
          <input
            type="date"
            aria-label="Milestone target date"
            value={newTargetDate}
            onChange={(e) => setNewTargetDate(e.target.value)}
            className="w-32 rounded-md border border-border bg-surface-alt px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !newTitle.trim()}
            className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {adding ? "…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
