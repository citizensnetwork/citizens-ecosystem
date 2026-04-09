"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GOAL_STATUSES, GOAL_STATUS_LABELS } from "@/lib/constants";
import type { VisionStatement } from "@/types/db";

interface GoalFormProps {
  orgId: string;
  orgSlug: string;
  visions: VisionStatement[];
  initialData?: {
    id: string;
    title: string;
    description: string | null;
    vision_id: string | null;
    target_value: number | null;
    target_unit: string | null;
    deadline: string | null;
    priority_weight: number;
    status: string;
  };
}

export function GoalForm({
  orgId,
  orgSlug,
  visions,
  initialData,
}: GoalFormProps) {
  const router = useRouter();
  const isEditing = !!initialData;

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [visionId, setVisionId] = useState(initialData?.vision_id ?? "");
  const [targetValue, setTargetValue] = useState<string>(
    initialData?.target_value?.toString() ?? ""
  );
  const [targetUnit, setTargetUnit] = useState(initialData?.target_unit ?? "");
  const [deadline, setDeadline] = useState(initialData?.deadline ?? "");
  const [priorityWeight, setPriorityWeight] = useState(
    initialData?.priority_weight?.toString() ?? "1.0"
  );
  const [status, setStatus] = useState(initialData?.status ?? "active");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      vision_id: visionId || undefined,
      target_value: targetValue ? parseFloat(targetValue) : undefined,
      target_unit: targetUnit.trim() || undefined,
      deadline: deadline || undefined,
      priority_weight: parseFloat(priorityWeight) || 1.0,
      status,
    };

    try {
      const url = isEditing
        ? `/api/goals/${initialData.id}`
        : `/api/goals?org_id=${orgId}`;

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save goal");
        return;
      }

      router.push(`/${orgSlug}/goals`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && (
        <div role="alert" className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="goal-title" className="mb-1.5 block text-sm font-medium text-text-primary">
          Title *
        </label>
        <input
          id="goal-title"
          type="text"
          required
          minLength={2}
          maxLength={300}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none"
          placeholder="e.g. Increase community outreach by 50%"
        />
      </div>

      <div>
        <label htmlFor="goal-description" className="mb-1.5 block text-sm font-medium text-text-primary">
          Description
        </label>
        <textarea
          id="goal-description"
          rows={3}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none"
          placeholder="Describe the goal and what success looks like…"
        />
      </div>

      {visions.length > 0 && (
        <div>
          <label htmlFor="goal-vision" className="mb-1.5 block text-sm font-medium text-text-primary">
            Vision Statement
          </label>
          <select
            id="goal-vision"
            value={visionId}
            onChange={(e) => setVisionId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">No vision linked</option>
            {visions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="goal-target-value" className="mb-1.5 block text-sm font-medium text-text-primary">
            Target Value
          </label>
          <input
            id="goal-target-value"
            type="number"
            min={0}
            step="any"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            placeholder="e.g. 100"
          />
        </div>
        <div>
          <label htmlFor="goal-target-unit" className="mb-1.5 block text-sm font-medium text-text-primary">
            Target Unit
          </label>
          <input
            id="goal-target-unit"
            type="text"
            maxLength={50}
            value={targetUnit}
            onChange={(e) => setTargetUnit(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none"
            placeholder="e.g. events, participants, hours"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="goal-deadline" className="mb-1.5 block text-sm font-medium text-text-primary">
            Deadline
          </label>
          <input
            id="goal-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="goal-weight" className="mb-1.5 block text-sm font-medium text-text-primary">
            Priority Weight (0.1–10)
          </label>
          <input
            id="goal-weight"
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={priorityWeight}
            onChange={(e) => setPriorityWeight(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {isEditing && (
        <div>
          <label htmlFor="goal-status" className="mb-1.5 block text-sm font-medium text-text-primary">
            Status
          </label>
          <select
            id="goal-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            {GOAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? "Saving…" : isEditing ? "Update Goal" : "Create Goal"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
