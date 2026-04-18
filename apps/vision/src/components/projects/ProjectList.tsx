"use client";

import { ProjectCard } from "./ProjectCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
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
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) => `?page=${p}`}
          variant="centered"
          ariaLabel="Project list pagination"
        />
      )}
    </div>
  );
}
