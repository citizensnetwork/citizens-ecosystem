import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock next/font/google
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

// Mock Navbar
vi.mock("@/components/ui/Navbar", () => ({
  Navbar: () => <header data-testid="navbar">navbar</header>,
}));

describe("Layout Accessibility", () => {
  it("skip link is present and targets #main-content", async () => {
    // Import after mocks
    const { default: RootLayout } = await import("@/app/layout");
    const { container } = render(
      await RootLayout({ children: <div>Test content</div> })
    );
    const skipLink = container.querySelector('a[href="#main-content"]');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveTextContent("Skip to main content");
  });

  it("main content wrapper has id for skip link", async () => {
    const { default: RootLayout } = await import("@/app/layout");
    const { container } = render(
      await RootLayout({ children: <div>Test content</div> })
    );
    const mainContent = container.querySelector("#main-content");
    expect(mainContent).toBeInTheDocument();
  });
});
