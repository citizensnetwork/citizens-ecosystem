import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";

describe("LoadingSkeleton", () => {
  it("renders with default props", () => {
    const { container } = render(<LoadingSkeleton />);
    const skeleton = container.firstElementChild;
    expect(skeleton).toBeTruthy();
    expect(skeleton?.classList.contains("animate-pulse")).toBe(true);
  });

  it("applies custom className", () => {
    const { container } = render(<LoadingSkeleton className="w-32" />);
    const skeleton = container.firstElementChild;
    expect(skeleton?.classList.contains("w-32")).toBe(true);
  });
});
