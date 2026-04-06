import { describe, it, expect, vi, beforeEach } from "vitest";
import { share } from "@/lib/capacitor/share";

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(false),
  },
}));

vi.mock("@capacitor/share", () => ({
  Share: {
    share: vi.fn().mockResolvedValue({}),
  },
}));

describe("share utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses navigator.share when available on web", async () => {
    const mockNavigatorShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockNavigatorShare,
      writable: true,
      configurable: true,
    });

    const result = await share({ title: "Test", url: "https://example.com" });

    expect(result).toBe(true);
    expect(mockNavigatorShare).toHaveBeenCalledWith({
      title: "Test",
      url: "https://example.com",
    });

    // Cleanup
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("falls back to clipboard when navigator.share is unavailable", async () => {
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    const result = await share({ title: "Test", url: "https://example.com" });

    expect(result).toBe(false);
    expect(mockWriteText).toHaveBeenCalledWith("https://example.com");
  });

  it("uses native share on Capacitor platform", async () => {
    const { Capacitor } = await import("@capacitor/core");
    const { Share: CapShare } = await import("@capacitor/share");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    const result = await share({ title: "Test", url: "https://example.com" });

    expect(result).toBe(true);
    expect(CapShare.share).toHaveBeenCalledWith({
      title: "Test",
      url: "https://example.com",
    });

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  });
});
