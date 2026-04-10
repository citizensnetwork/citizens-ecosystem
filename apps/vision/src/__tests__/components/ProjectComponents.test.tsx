import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectList } from "@/components/projects/ProjectList";
import type { ProjectWithDepartment } from "@/types/db";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const baseProject: ProjectWithDepartment = {
  id: "proj-1",
  org_id: "org-1",
  department_id: "dept-1",
  name: "Community Health Initiative",
  description: "Improving health outcomes in the region.",
  status: "active",
  start_date: "2026-01-15",
  end_date: "2026-06-30",
  created_by: "user-1",
  created_at: "2026-01-10T00:00:00Z",
  updated_at: "2026-01-10T00:00:00Z",
  departments: { name: "Health Services" },
};

describe("ProjectCard", () => {
  it("renders project name", () => {
    render(<ProjectCard project={baseProject} orgSlug="test-org" />);
    expect(
      screen.getByText("Community Health Initiative")
    ).toBeInTheDocument();
  });

  it("renders status badge", () => {
    render(<ProjectCard project={baseProject} orgSlug="test-org" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders department name", () => {
    render(<ProjectCard project={baseProject} orgSlug="test-org" />);
    expect(screen.getByText("Health Services")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<ProjectCard project={baseProject} orgSlug="test-org" />);
    expect(
      screen.getByText("Improving health outcomes in the region.")
    ).toBeInTheDocument();
  });

  it("renders date range", () => {
    render(<ProjectCard project={baseProject} orgSlug="test-org" />);
    // en-ZA format: YYYY/MM/DD
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("links to project detail page", () => {
    render(<ProjectCard project={baseProject} orgSlug="test-org" />);
    const link = screen
      .getByText("Community Health Initiative")
      .closest("a");
    expect(link).toHaveAttribute(
      "href",
      "/test-org/projects/proj-1"
    );
  });

  it("handles missing department", () => {
    const noDeptProject = { ...baseProject, departments: null };
    render(<ProjectCard project={noDeptProject} orgSlug="test-org" />);
    expect(
      screen.getByText("Community Health Initiative")
    ).toBeInTheDocument();
    expect(screen.queryByText("Health Services")).not.toBeInTheDocument();
  });

  it("handles missing description", () => {
    const noDescProject = { ...baseProject, description: null };
    render(<ProjectCard project={noDescProject} orgSlug="test-org" />);
    expect(
      screen.getByText("Community Health Initiative")
    ).toBeInTheDocument();
  });
});

describe("ProjectList", () => {
  it("renders empty state when no projects", () => {
    render(
      <ProjectList
        projects={[]}
        orgSlug="test-org"
        page={1}
        totalPages={0}
      />
    );
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
  });

  it("renders list of project cards", () => {
    const projects = [
      baseProject,
      { ...baseProject, id: "proj-2", name: "Education Reform" },
    ];
    render(
      <ProjectList
        projects={projects}
        orgSlug="test-org"
        page={1}
        totalPages={1}
      />
    );
    expect(
      screen.getByText("Community Health Initiative")
    ).toBeInTheDocument();
    expect(screen.getByText("Education Reform")).toBeInTheDocument();
  });

  it("shows pagination when multiple pages", () => {
    render(
      <ProjectList
        projects={[baseProject]}
        orgSlug="test-org"
        page={1}
        totalPages={3}
      />
    );
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
  });

  it("shows previous button on later pages", () => {
    render(
      <ProjectList
        projects={[baseProject]}
        orgSlug="test-org"
        page={2}
        totalPages={3}
      />
    );
    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("hides pagination for single page", () => {
    render(
      <ProjectList
        projects={[baseProject]}
        orgSlug="test-org"
        page={1}
        totalPages={1}
      />
    );
    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });
});
