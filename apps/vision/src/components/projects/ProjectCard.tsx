"use client";

import Link from "next/link";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLOURS,
} from "@/lib/constants";
import type { ProjectWithDepartment } from "@/types/db";

interface ProjectCardProps {
  project: ProjectWithDepartment;
  orgSlug: string;
}

export function ProjectCard({ project, orgSlug }: ProjectCardProps) {
  const statusColour = PROJECT_STATUS_COLOURS[project.status] ?? "#abb2bf";

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-ZA") : null;

  const startStr = formatDate(project.start_date);
  const endStr = formatDate(project.end_date);

  return (
    <Link
      href={`/${orgSlug}/projects/${project.id}`}
      className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-text-primary">
            {project.name}
          </h3>
          {project.departments?.name && (
            <p className="mt-0.5 truncate text-xs text-text-secondary">
              {project.departments.name}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: `${statusColour}20`,
            color: statusColour,
          }}
        >
          {PROJECT_STATUS_LABELS[project.status] ?? project.status}
        </span>
      </div>

      {project.description && (
        <p className="mt-2 line-clamp-2 text-xs text-text-secondary">
          {project.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-text-secondary">
        {startStr && endStr && (
          <span>
            {startStr} → {endStr}
          </span>
        )}
        {startStr && !endStr && <span>Started {startStr}</span>}
        {!startStr && endStr && <span>Due {endStr}</span>}
      </div>
    </Link>
  );
}
