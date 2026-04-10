"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLOURS,
} from "@/lib/constants";
import { MilestoneTracker } from "@/components/projects/MilestoneTracker";
import { GanttBar } from "@/components/projects/GanttBar";
import { ProjectActivities } from "@/components/projects/ProjectActivities";
import { GoalAlignmentIndicator } from "@/components/projects/GoalAlignmentIndicator";
import { ProjectForm } from "@/components/projects/ProjectForm";
import type { ProjectWithDepartment, Milestone, Department } from "@/types/db";

interface ProjectDetailClientProps {
  project: ProjectWithDepartment;
  milestones: Milestone[];
  orgId: string;
  orgSlug: string;
  canEdit: boolean;
  departments: Department[];
}

export function ProjectDetailClient({
  project,
  milestones,
  orgId,
  orgSlug,
  canEdit,
  departments,
}: ProjectDetailClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [now] = useState(() => Date.now());

  const statusColour = PROJECT_STATUS_COLOURS[project.status] ?? "#abb2bf";

  const completedMilestones = milestones.filter(
    (m) => m.completed_at !== null
  ).length;
  const milestoneProgress =
    milestones.length > 0
      ? Math.round((completedMilestones / milestones.length) * 100)
      : 0;

  async function handleDelete() {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push(`/${orgSlug}/projects`);
        router.refresh();
      }
    } catch {
      // Silently fail
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">
            Edit Project
          </h1>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
        <ProjectForm
          orgId={orgId}
          orgSlug={orgSlug}
          departments={departments}
          initialData={{
            id: project.id,
            name: project.name,
            description: project.description,
            department_id: project.department_id,
            status: project.status,
            start_date: project.start_date,
            end_date: project.end_date,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary">
              {project.name}
            </h1>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `${statusColour}20`,
                color: statusColour,
              }}
            >
              {PROJECT_STATUS_LABELS[project.status] ?? project.status}
            </span>
          </div>
          {project.departments?.name && (
            <p className="mt-1 text-sm text-text-secondary">
              {project.departments.name}
            </p>
          )}
          {project.description && (
            <p className="mt-2 text-sm text-text-secondary">
              {project.description}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md border border-red-700/50 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-900/30 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>

      {/* Gantt-style timeline bar */}
      <GanttBar project={project} milestoneProgress={milestoneProgress} now={now} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Milestones */}
        <MilestoneTracker
          projectId={project.id}
          milestones={milestones}
          canEdit={canEdit}
        />

        {/* Goal alignment */}
        <GoalAlignmentIndicator
          projectId={project.id}
          orgSlug={orgSlug}
          canEdit={canEdit}
        />
      </div>

      {/* Linked activities */}
      <ProjectActivities
        projectId={project.id}
        orgSlug={orgSlug}
        canEdit={canEdit}
      />

      {/* Back link */}
      <div>
        <Link
          href={`/${orgSlug}/projects`}
          className="text-sm text-text-secondary hover:text-accent"
        >
          ← Back to Projects
        </Link>
      </div>
    </div>
  );
}
