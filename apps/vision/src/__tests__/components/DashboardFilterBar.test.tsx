import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardFilterBar } from "@/components/dashboard/DashboardFilterBar";
import type { Department } from "@/types/db";

const mockDepartments: Department[] = [
  {
    id: "d1",
    org_id: "o1",
    parent_department_id: null,
    name: "Engineering",
    description: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "d2",
    org_id: "o1",
    parent_department_id: null,
    name: "Marketing",
    description: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("DashboardFilterBar", () => {
  const defaultProps = {
    departments: mockDepartments,
    selectedDepartmentId: null,
    selectedType: null,
    onDepartmentChange: vi.fn(),
    onTypeChange: vi.fn(),
  };

  it("renders department select with all option", () => {
    render(<DashboardFilterBar {...defaultProps} />);
    const select = screen.getByLabelText("Filter by department");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("All departments")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });

  it("renders type select with all option", () => {
    render(<DashboardFilterBar {...defaultProps} />);
    const select = screen.getByLabelText("Filter by activity type");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("All types")).toBeInTheDocument();
  });

  it("calls onDepartmentChange when selecting department", () => {
    const onDepartmentChange = vi.fn();
    render(
      <DashboardFilterBar
        {...defaultProps}
        onDepartmentChange={onDepartmentChange}
      />
    );
    fireEvent.change(screen.getByLabelText("Filter by department"), {
      target: { value: "d1" },
    });
    expect(onDepartmentChange).toHaveBeenCalledWith("d1");
  });

  it("calls onTypeChange when selecting type", () => {
    const onTypeChange = vi.fn();
    render(
      <DashboardFilterBar {...defaultProps} onTypeChange={onTypeChange} />
    );
    fireEvent.change(screen.getByLabelText("Filter by activity type"), {
      target: { value: "event" },
    });
    expect(onTypeChange).toHaveBeenCalledWith("event");
  });

  it("calls with null when selecting All", () => {
    const onDepartmentChange = vi.fn();
    render(
      <DashboardFilterBar
        {...defaultProps}
        selectedDepartmentId="d1"
        onDepartmentChange={onDepartmentChange}
      />
    );
    fireEvent.change(screen.getByLabelText("Filter by department"), {
      target: { value: "" },
    });
    expect(onDepartmentChange).toHaveBeenCalledWith(null);
  });
});
