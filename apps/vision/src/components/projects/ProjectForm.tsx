"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from "@/lib/constants";
import type { Department, Goal } from "@/types/db";

interface ProjectFormProps {
  orgId: string;
  orgSlug: string;
  departments: Department[];
  goals?: Pick<Goal, "id" | "title">[];
  initialData?: {
    id: string;
    name: string;
    description: string | null;
    department_id: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
  };
}

export function ProjectForm({
  orgId,
  orgSlug,
  departments,
  goals,
  initialData,
}: ProjectFormProps) {
  const router = useRouter();
  const isEditing = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [departmentId, setDepartmentId] = useState(
    initialData?.department_id ?? ""
  );
  const [status, setStatus] = useState(initialData?.status ?? "planning");
  const [startDate, setStartDate] = useState(initialData?.start_date ?? "");
  const [endDate, setEndDate] = useState(initialData?.end_date ?? "");
  const [linkedGoalIds, setLinkedGoalIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      department_id: departmentId || undefined,
      status,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    };

    try {
      const url = isEditing
        ? `/api/projects/${initialData.id}`
        : `/api/projects?org_id=${orgId}`;

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save project");
        return;
      }

      // Link goals if any selected (for new projects)
      if (!isEditing && linkedGoalIds.length > 0) {
        const result = await res.json();
        const projectId = result?.data?.id;
        if (projectId) {
          await Promise.all(
            linkedGoalIds.map((goalId) =>
              fetch(`/api/projects/${projectId}/goals`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ goal_id: goalId }),
              })
            )
          );
        }
      }

      router.push(`/${orgSlug}/projects`);
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
        <div
          role="alert"
          className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="project-name"
          className="mb-1.5 block text-sm font-medium text-text-primary"
        >
          Name *
        </label>
        <input
          id="project-name"
          type="text"
          required
          minLength={2}
          maxLength={300}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none"
          placeholder="e.g. Community Wellness Initiative"
        />
      </div>

      <div>
        <label
          htmlFor="project-description"
          className="mb-1.5 block text-sm font-medium text-text-primary"
        >
          Description
        </label>
        <textarea
          id="project-description"
          rows={3}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none"
          placeholder="What is this project about?"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="project-start"
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            Start Date
          </label>
          <input
            id="project-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="project-end"
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            End Date
          </label>
          <input
            id="project-end"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="project-department"
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            Department
          </label>
          <select
            id="project-department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {isEditing && (
          <div>
            <label
              htmlFor="project-status"
              className="mb-1.5 block text-sm font-medium text-text-primary"
            >
              Status
            </label>
            <select
              id="project-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Link to Goals */}
      {!isEditing && goals && goals.length > 0 && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-primary">
            Link to Goals
          </label>
          <p className="mb-2 text-xs text-text-secondary">
            Select goals this project contributes toward
          </p>
          <div className="space-y-1.5 rounded-md border border-border bg-surface p-3">
            {goals.map((goal) => (
              <label
                key={goal.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={linkedGoalIds.includes(goal.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setLinkedGoalIds([...linkedGoalIds, goal.id]);
                    } else {
                      setLinkedGoalIds(
                        linkedGoalIds.filter((id) => id !== goal.id)
                      );
                    }
                  }}
                  className="rounded border-border"
                />
                <span className="text-text-primary">{goal.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting
            ? "Saving…"
            : isEditing
              ? "Update Project"
              : "Create Project"}
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
