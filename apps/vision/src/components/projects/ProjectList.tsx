"use client";

import Link from "next/link";
import { ProjectCard } from "./ProjectCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ProjectWithDepartment } from "@/types/db";

interface ProjectListProps {
  projects: ProjectWithDepartment[];
  orgSlug: string;
  page: number;
  totalPages: number;
}

export function ProjectList({
  projects,
  orgSlug,
  page,
  totalPages,
}: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        description="Create your first project to group activities and track milestones."
      />
    );
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            orgSlug={orgSlug}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Project list pagination"
          className="mt-6 flex items-center justify-center gap-2"
        >
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
