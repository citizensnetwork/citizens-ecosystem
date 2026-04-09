import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LocationPicker } from "@/components/map/LocationPicker";

// Mock MapLibre GL
vi.mock("maplibre-gl", () => {
  const mockMarker = {
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    on: vi.fn(),
    getLngLat: vi.fn(() => ({ lat: -25.75, lng: 28.23 })),
  };

  const mockMap = {
    on: vi.fn(),
    remove: vi.fn(),
    flyTo: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(),
    setLayoutProperty: vi.fn(),
  };

  return {
    default: {
      Map: vi.fn(function () {
        return mockMap;
      }),
      Marker: vi.fn(function () {
        return mockMarker;
      }),
      NavigationControl: vi.fn(),
    },
  };
});

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

// Mock geocodeSearch
vi.mock("@/lib/map/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/map/utils")>();
  return {
    ...actual,
    geocodeSearch: vi.fn(),
  };
});

import { geocodeSearch } from "@/lib/map/utils";
const mockGeocodeSearch = vi.mocked(geocodeSearch);

describe("LocationPicker", () => {
  const mockOnLocationChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders search input and map container", () => {
    render(
      <LocationPicker
        latitude={null}
        longitude={null}
        locationName=""
        onLocationChange={mockOnLocationChange}
      />
    );

    expect(screen.getByLabelText("Search location for activity")).toBeDefined();
    expect(screen.getByLabelText("Click map to select location")).toBeDefined();
  });

  it("renders with initial coordinates", () => {
    render(
      <LocationPicker
        latitude={-25.7500}
        longitude={28.2300}
        locationName="Pretoria"
        onLocationChange={mockOnLocationChange}
      />
    );

    expect(screen.getByText("-25.75000, 28.23000")).toBeDefined();
  });

  it("does not show coordinates when none provided", () => {
    render(
      <LocationPicker
        latitude={null}
        longitude={null}
        locationName=""
        onLocationChange={mockOnLocationChange}
      />
    );

    expect(screen.queryByText(/\d+\.\d+, \d+\.\d+/)).toBeNull();
  });

  it("calls geocodeSearch after debounce", async () => {
    mockGeocodeSearch.mockResolvedValue([
      {
        display_name: "Pretoria, Gauteng, South Africa",
        lat: -25.7479,
        lon: 28.2293,
        boundingbox: ["-25.9", "-25.5", "28.0", "28.4"],
      },
    ]);

    render(
      <LocationPicker
        latitude={null}
        longitude={null}
        locationName=""
        onLocationChange={mockOnLocationChange}
      />
    );

    const input = screen.getByLabelText("Search location for activity");
    fireEvent.change(input, { target: { value: "Pretoria" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockGeocodeSearch).toHaveBeenCalledWith("Pretoria");
  });

  it("does not search for short queries", async () => {
    render(
      <LocationPicker
        latitude={null}
        longitude={null}
        locationName=""
        onLocationChange={mockOnLocationChange}
      />
    );

    const input = screen.getByLabelText("Search location for activity");
    fireEvent.change(input, { target: { value: "ab" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockGeocodeSearch).not.toHaveBeenCalled();
  });

  it("displays search results and calls onLocationChange on select", async () => {
    mockGeocodeSearch.mockResolvedValue([
      {
        display_name: "Pretoria, Gauteng, South Africa",
        lat: -25.7479,
        lon: 28.2293,
        boundingbox: ["-25.9", "-25.5", "28.0", "28.4"],
      },
    ]);

    render(
      <LocationPicker
        latitude={null}
        longitude={null}
        locationName=""
        onLocationChange={mockOnLocationChange}
      />
    );

    const input = screen.getByLabelText("Search location for activity");
    fireEvent.change(input, { target: { value: "Pretoria" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const result = screen.getByText("Pretoria, Gauteng, South Africa");
    fireEvent.click(result);

    expect(mockOnLocationChange).toHaveBeenCalledWith(
      -25.7479,
      28.2293,
      "Pretoria, Gauteng"
    );
  });

  it("has accessible map container", () => {
    render(
      <LocationPicker
        latitude={null}
        longitude={null}
        locationName=""
        onLocationChange={mockOnLocationChange}
      />
    );

    const map = screen.getByLabelText("Click map to select location");
    expect(map.getAttribute("role")).toBe("application");
  });
});
