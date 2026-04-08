import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/ui/EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState title="No data" description="Nothing to show here." />
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Nothing to show here.")).toBeInTheDocument();
  });

  it("renders action slot when provided", () => {
    render(
      <EmptyState
        title="Empty"
        description="Test"
        action={<button>Add item</button>}
      />
    );
    expect(screen.getByText("Add item")).toBeInTheDocument();
  });

  it("renders without action slot", () => {
    const { container } = render(
      <EmptyState title="Empty" description="No items" />
    );
    expect(container.querySelector("button")).toBeNull();
  });
});
