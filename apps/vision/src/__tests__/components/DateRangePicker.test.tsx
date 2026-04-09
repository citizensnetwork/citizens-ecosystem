import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";

describe("DateRangePicker", () => {
  const defaultProps = {
    from: "2026-01-01",
    to: "2026-01-31",
    onChange: vi.fn(),
  };

  it("renders preset buttons", () => {
    render(<DateRangePicker {...defaultProps} />);
    expect(screen.getByText("7d")).toBeInTheDocument();
    expect(screen.getByText("30d")).toBeInTheDocument();
    expect(screen.getByText("90d")).toBeInTheDocument();
    expect(screen.getByText("1y")).toBeInTheDocument();
  });

  it("renders date inputs", () => {
    render(<DateRangePicker {...defaultProps} />);
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
    expect(screen.getByLabelText("End date")).toBeInTheDocument();
  });

  it("calls onChange when preset is clicked", () => {
    const onChange = vi.fn();
    render(<DateRangePicker {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText("7d"));
    expect(onChange).toHaveBeenCalledOnce();
    const [from, to] = onChange.mock.calls[0];
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("calls onChange when start date changes", () => {
    const onChange = vi.fn();
    render(<DateRangePicker {...defaultProps} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-02-01" },
    });
    expect(onChange).toHaveBeenCalledWith("2026-02-01", "2026-01-31");
  });

  it("calls onChange when end date changes", () => {
    const onChange = vi.fn();
    render(<DateRangePicker {...defaultProps} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-03-15" },
    });
    expect(onChange).toHaveBeenCalledWith("2026-01-01", "2026-03-15");
  });

  it("marks active preset with aria-pressed", () => {
    const today = new Date().toISOString().split("T")[0];
    const thirtyAgo = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];
    render(
      <DateRangePicker from={thirtyAgo} to={today} onChange={vi.fn()} />
    );
    expect(screen.getByText("30d")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("7d")).toHaveAttribute("aria-pressed", "false");
  });
});
