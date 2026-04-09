import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GeolocationButton } from "@/components/map/GeolocationButton";

describe("GeolocationButton", () => {
  const mockOnLocate = vi.fn();
  let mockGetCurrentPosition: ReturnType<typeof vi.fn>;
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: mockGetCurrentPosition },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: originalGeolocation,
      writable: true,
      configurable: true,
    });
  });

  it("renders button with label", () => {
    render(<GeolocationButton onLocate={mockOnLocate} />);
    const btn = screen.getByLabelText("Centre map on my location");
    expect(btn).toBeDefined();
  });

  it("calls onLocate with coordinates on success", () => {
    render(<GeolocationButton onLocate={mockOnLocate} />);
    const btn = screen.getByLabelText("Centre map on my location");

    fireEvent.click(btn);

    // Simulate geolocation success
    const successCallback = mockGetCurrentPosition.mock.calls[0][0];
    act(() => {
      successCallback({
        coords: { latitude: -25.75, longitude: 28.23 },
      });
    });

    expect(mockOnLocate).toHaveBeenCalledWith(-25.75, 28.23);
  });

  it("shows error on permission denied", () => {
    render(<GeolocationButton onLocate={mockOnLocate} />);
    const btn = screen.getByLabelText("Centre map on my location");

    fireEvent.click(btn);

    // Simulate permission denied
    const errorCallback = mockGetCurrentPosition.mock.calls[0][1];
    act(() => {
      errorCallback({ code: 1, PERMISSION_DENIED: 1 });
    });

    expect(screen.getByText("Location access denied")).toBeDefined();
    expect(mockOnLocate).not.toHaveBeenCalled();
  });

  it("shows error on position unavailable", () => {
    render(<GeolocationButton onLocate={mockOnLocate} />);
    fireEvent.click(screen.getByLabelText("Centre map on my location"));

    const errorCallback = mockGetCurrentPosition.mock.calls[0][1];
    act(() => {
      errorCallback({ code: 2, POSITION_UNAVAILABLE: 2 });
    });

    expect(screen.getByText("Location unavailable")).toBeDefined();
  });

  it("shows error on timeout", () => {
    render(<GeolocationButton onLocate={mockOnLocate} />);
    fireEvent.click(screen.getByLabelText("Centre map on my location"));

    const errorCallback = mockGetCurrentPosition.mock.calls[0][1];
    act(() => {
      errorCallback({ code: 3, TIMEOUT: 3 });
    });

    expect(screen.getByText("Location request timed out")).toBeDefined();
  });

  it("disables button while loading", () => {
    render(<GeolocationButton onLocate={mockOnLocate} />);
    const btn = screen.getByLabelText("Centre map on my location");

    fireEvent.click(btn);

    // Button should be disabled while awaiting geolocation
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("shows error when geolocation is not available", () => {
    // Remove the geolocation property entirely so `"geolocation" in navigator` is false
    // @ts-expect-error — intentionally deleting for test
    delete navigator.geolocation;

    render(<GeolocationButton onLocate={mockOnLocate} />);
    fireEvent.click(screen.getByLabelText("Centre map on my location"));

    expect(screen.getByText("Geolocation not supported")).toBeDefined();
    expect(mockOnLocate).not.toHaveBeenCalled();
  });
});
