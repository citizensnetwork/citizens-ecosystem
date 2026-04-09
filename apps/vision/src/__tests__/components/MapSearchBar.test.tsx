import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MapSearchBar } from "@/components/map/MapSearchBar";

// Mock the geocodeSearch function
vi.mock("@/lib/map/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/map/utils")>();
  return {
    ...actual,
    geocodeSearch: vi.fn(),
  };
});

import { geocodeSearch } from "@/lib/map/utils";
const mockGeocodeSearch = vi.mocked(geocodeSearch);

describe("MapSearchBar", () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders search input", () => {
    render(<MapSearchBar onSelect={mockOnSelect} />);
    expect(screen.getByLabelText("Search for a location")).toBeDefined();
  });

  it("has correct ARIA attributes", () => {
    render(<MapSearchBar onSelect={mockOnSelect} />);
    const input = screen.getByLabelText("Search for a location");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
  });

  it("does not search for queries shorter than 3 characters", async () => {
    render(<MapSearchBar onSelect={mockOnSelect} />);
    const input = screen.getByLabelText("Search for a location");

    fireEvent.change(input, { target: { value: "ab" } });
    await vi.advanceTimersByTimeAsync(500);

    expect(mockGeocodeSearch).not.toHaveBeenCalled();
  });

  it("searches after debounce delay", async () => {
    mockGeocodeSearch.mockResolvedValue([
      {
        display_name: "Pretoria, Gauteng, South Africa",
        lat: -25.7479,
        lon: 28.2293,
        boundingbox: ["-25.9", "-25.5", "28.0", "28.4"],
      },
    ]);

    render(<MapSearchBar onSelect={mockOnSelect} />);
    const input = screen.getByLabelText("Search for a location");

    fireEvent.change(input, { target: { value: "Pretoria" } });
    await vi.advanceTimersByTimeAsync(500);

    expect(mockGeocodeSearch).toHaveBeenCalledWith("Pretoria");
  });

  it("displays search results", async () => {
    mockGeocodeSearch.mockResolvedValue([
      {
        display_name: "Pretoria, Gauteng, South Africa",
        lat: -25.7479,
        lon: 28.2293,
        boundingbox: ["-25.9", "-25.5", "28.0", "28.4"],
      },
    ]);

    render(<MapSearchBar onSelect={mockOnSelect} />);
    const input = screen.getByLabelText("Search for a location");

    // Fire change event, then advance timers + flush microtasks inside act()
    fireEvent.change(input, { target: { value: "Pretoria" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(
      screen.getByText("Pretoria, Gauteng, South Africa")
    ).toBeDefined();
  });

  it("calls onSelect when a result is clicked", async () => {
    mockGeocodeSearch.mockResolvedValue([
      {
        display_name: "Pretoria, Gauteng, South Africa",
        lat: -25.7479,
        lon: 28.2293,
        boundingbox: ["-25.9", "-25.5", "28.0", "28.4"],
      },
    ]);

    render(<MapSearchBar onSelect={mockOnSelect} />);
    const input = screen.getByLabelText("Search for a location");

    fireEvent.change(input, { target: { value: "Pretoria" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const result = screen.getByText("Pretoria, Gauteng, South Africa");
    fireEvent.click(result);

    expect(mockOnSelect).toHaveBeenCalledWith(
      -25.7479,
      28.2293,
      "Pretoria, Gauteng, South Africa"
    );
  });

  it("handles empty search results", async () => {
    mockGeocodeSearch.mockResolvedValue([]);

    render(<MapSearchBar onSelect={mockOnSelect} />);
    const input = screen.getByLabelText("Search for a location");

    fireEvent.change(input, { target: { value: "xyznonexistent" } });
    await vi.advanceTimersByTimeAsync(500);

    // No dropdown should appear
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
