import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayerToggle } from "@/components/map/LayerToggle";
import { useMapStore } from "@/stores/mapStore";

describe("LayerToggle", () => {
  beforeEach(() => {
    useMapStore.getState().resetMap();
  });

  it("renders all three layer buttons", () => {
    render(<LayerToggle />);
    expect(screen.getByText("Markers")).toBeDefined();
    expect(screen.getByText("Clusters")).toBeDefined();
    expect(screen.getByText("Heatmap")).toBeDefined();
  });

  it("renders Markers and Clusters as active by default", () => {
    render(<LayerToggle />);
    const markersBtn = screen.getByText("Markers").closest("button")!;
    const clustersBtn = screen.getByText("Clusters").closest("button")!;
    const heatmapBtn = screen.getByText("Heatmap").closest("button")!;

    expect(markersBtn.getAttribute("aria-pressed")).toBe("true");
    expect(clustersBtn.getAttribute("aria-pressed")).toBe("true");
    expect(heatmapBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles heatmap layer on click", () => {
    render(<LayerToggle />);
    const heatmapBtn = screen.getByText("Heatmap").closest("button")!;

    fireEvent.click(heatmapBtn);
    expect(useMapStore.getState().activeLayers.has("heatmap")).toBe(true);

    fireEvent.click(heatmapBtn);
    expect(useMapStore.getState().activeLayers.has("heatmap")).toBe(false);
  });

  it("toggles markers layer off", () => {
    render(<LayerToggle />);
    const markersBtn = screen.getByText("Markers").closest("button")!;

    fireEvent.click(markersBtn);
    expect(useMapStore.getState().activeLayers.has("markers")).toBe(false);
  });

  it("has a Layers heading", () => {
    render(<LayerToggle />);
    expect(screen.getByText("Layers")).toBeDefined();
  });
});
