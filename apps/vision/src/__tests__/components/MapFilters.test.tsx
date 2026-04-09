import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapFilters } from "@/components/map/MapFilters";
import type { Department } from "@/types/db";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockDepartments: Department[] = [
  {
    id: "dept-1",
    org_id: "org-1",
    parent_department_id: null,
    name: "Operations",
    description: null,
    created_at: "2026-04-01",
  },
  {
    id: "dept-2",
    org_id: "org-1",
    parent_department_id: null,
    name: "Finance",
    description: null,
    created_at: "2026-04-01",
  },
];

describe("MapFilters", () => {
  it("renders all filter controls", () => {
    render(<MapFilters orgSlug="test-org" departments={mockDepartments} />);

    // Type filter
    expect(screen.getByText("All types")).toBeDefined();

    // Department filter
    expect(screen.getByText("All departments")).toBeDefined();
    expect(screen.getByText("Operations")).toBeDefined();
    expect(screen.getByText("Finance")).toBeDefined();

    // Date range inputs
    const dateInputs = screen.getAllByLabelText(/date/i);
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders activity type options", () => {
    render(<MapFilters orgSlug="test-org" departments={mockDepartments} />);

    expect(screen.getByText("Event")).toBeDefined();
    expect(screen.getByText("Meeting")).toBeDefined();
    expect(screen.getByText("Outreach")).toBeDefined();
    expect(screen.getByText("Workshop")).toBeDefined();
  });

  it("renders with empty departments", () => {
    render(<MapFilters orgSlug="test-org" departments={[]} />);
    expect(screen.getByText("All departments")).toBeDefined();
  });
});
