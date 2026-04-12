import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GeoFenceEditor } from "@/components/map/GeoFenceEditor";
import { CoverageOverlay } from "@/components/map/CoverageOverlay";

describe("GeoFenceEditor", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  it("renders textarea and buttons", () => {
    render(<GeoFenceEditor onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByPlaceholderText(/Polygon/)).toBeInTheDocument();
    expect(screen.getByText("Import File")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Set Boundary")).toBeInTheDocument();
  });

  it("shows Update Boundary when initialGeoJSON provided", () => {
    const polygon: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    };
    render(
      <GeoFenceEditor
        initialGeoJSON={polygon}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Update Boundary")).toBeInTheDocument();
  });

  it("shows error for invalid JSON", () => {
    render(<GeoFenceEditor onSave={onSave} onCancel={onCancel} />);
    const textarea = screen.getByPlaceholderText(/Polygon/);
    fireEvent.change(textarea, { target: { value: "not json" } });
    fireEvent.click(screen.getByText("Set Boundary"));
    expect(screen.getByText("Invalid JSON syntax.")).toBeInTheDocument();
  });

  it("shows error for invalid geometry type", () => {
    render(<GeoFenceEditor onSave={onSave} onCancel={onCancel} />);
    const textarea = screen.getByPlaceholderText(/Polygon/);
    fireEvent.change(textarea, {
      target: { value: JSON.stringify({ type: "Point", coordinates: [0, 0] }) },
    });
    fireEvent.click(screen.getByText("Set Boundary"));
    expect(
      screen.getByText(/Invalid GeoJSON/)
    ).toBeInTheDocument();
  });

  it("calls onSave with valid Polygon", () => {
    render(<GeoFenceEditor onSave={onSave} onCancel={onCancel} />);
    const polygon = {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    };
    const textarea = screen.getByPlaceholderText(/Polygon/);
    fireEvent.change(textarea, { target: { value: JSON.stringify(polygon) } });
    fireEvent.click(screen.getByText("Set Boundary"));
    expect(onSave).toHaveBeenCalledWith(polygon);
  });

  it("calls onCancel", () => {
    render(<GeoFenceEditor onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders boundary colour swatches", () => {
    render(<GeoFenceEditor onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByText("Available Colours")).toBeInTheDocument();
  });
});

describe("CoverageOverlay", () => {
  it("renders nothing when totalBoundaries is 0", () => {
    const { container } = render(
      <CoverageOverlay coverageSummary={[]} totalBoundaries={0} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders coverage levels with counts", () => {
    render(
      <CoverageOverlay
        coverageSummary={[
          { level: "gap", count: 2 },
          { level: "well-covered", count: 5 },
        ]}
        totalBoundaries={7}
      />
    );
    expect(screen.getByText("Coverage")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/7 boundaries total/)).toBeInTheDocument();
    expect(screen.getByText("Coverage Gap")).toBeInTheDocument();
    expect(screen.getByText("Well Covered")).toBeInTheDocument();
  });

  it("shows singular text for 1 boundary", () => {
    render(
      <CoverageOverlay
        coverageSummary={[{ level: "moderate", count: 1 }]}
        totalBoundaries={1}
      />
    );
    expect(screen.getByText(/1 boundary total/)).toBeInTheDocument();
  });
});
