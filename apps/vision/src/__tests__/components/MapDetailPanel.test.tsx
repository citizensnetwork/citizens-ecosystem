import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapDetailPanel } from "@/components/map/MapDetailPanel";
import { useMapStore } from "@/stores/mapStore";
import type { MapActivity } from "@/lib/map/utils";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const sampleActivity: MapActivity = {
  id: "act-1",
  title: "Community Outreach Event",
  type: "outreach",
  date: "2026-04-15",
  latitude: -25.7500,
  longitude: 28.2300,
  location_name: "Pretoria Community Centre",
  participant_count: 75,
  department_id: "dept-1",
  department_name: "Community Services",
  tags: ["community", "outreach", "engagement"],
};

describe("MapDetailPanel", () => {
  beforeEach(() => {
    useMapStore.getState().resetMap();
  });

  it("renders nothing when detail panel is closed", () => {
    const { container } = render(<MapDetailPanel orgSlug="test-org" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders activity details when panel is open", () => {
    useMapStore.getState().selectActivity(sampleActivity);
    render(<MapDetailPanel orgSlug="test-org" />);

    expect(screen.getByText("Community Outreach Event")).toBeDefined();
    // Type badge renders as "📢 Outreach" — use a function matcher
    expect(
      screen.getByText((_content, element) =>
        element?.tagName === "SPAN" && element.textContent === "📢 Outreach"
      )
    ).toBeDefined();
    expect(screen.getByText("Pretoria Community Centre")).toBeDefined();
    expect(screen.getByText("75")).toBeDefined();
    expect(screen.getByText("Community Services")).toBeDefined();
  });

  it("displays all tags", () => {
    useMapStore.getState().selectActivity(sampleActivity);
    render(<MapDetailPanel orgSlug="test-org" />);

    expect(screen.getByText("community")).toBeDefined();
    expect(screen.getByText("outreach")).toBeDefined();
    expect(screen.getByText("engagement")).toBeDefined();
  });

  it("displays coordinates", () => {
    useMapStore.getState().selectActivity(sampleActivity);
    render(<MapDetailPanel orgSlug="test-org" />);

    expect(screen.getByText("-25.7500, 28.2300")).toBeDefined();
  });

  it("has a link to full activity detail", () => {
    useMapStore.getState().selectActivity(sampleActivity);
    render(<MapDetailPanel orgSlug="test-org" />);

    const link = screen.getByText("View Full Detail →");
    expect(link.closest("a")?.getAttribute("href")).toBe(
      "/test-org/activities/act-1"
    );
  });

  it("closes panel on close button click", () => {
    useMapStore.getState().selectActivity(sampleActivity);
    render(<MapDetailPanel orgSlug="test-org" />);

    const closeBtn = screen.getByLabelText("Close detail panel");
    fireEvent.click(closeBtn);

    expect(useMapStore.getState().detailPanelOpen).toBe(false);
    expect(useMapStore.getState().selectedActivityId).toBeNull();
  });

  it("formats date correctly", () => {
    useMapStore.getState().selectActivity(sampleActivity);
    render(<MapDetailPanel orgSlug="test-org" />);

    // en-ZA locale date format — "2026/04/15"
    expect(screen.getByText("2026/04/15")).toBeDefined();
  });

  it("handles activity without tags", () => {
    useMapStore.getState().selectActivity({
      ...sampleActivity,
      tags: [],
    });
    render(<MapDetailPanel orgSlug="test-org" />);

    // Should still render without the Tags section
    expect(screen.getByText("Community Outreach Event")).toBeDefined();
    expect(screen.queryByText("Tags")).toBeNull();
  });

  it("handles activity without location name", () => {
    useMapStore.getState().selectActivity({
      ...sampleActivity,
      location_name: null,
    });
    render(<MapDetailPanel orgSlug="test-org" />);

    // Should still render without Location row
    expect(screen.getByText("Community Outreach Event")).toBeDefined();
    expect(screen.queryByText("Pretoria Community Centre")).toBeNull();
  });

  it("has correct ARIA attributes", () => {
    useMapStore.getState().selectActivity(sampleActivity);
    render(<MapDetailPanel orgSlug="test-org" />);

    const panel = screen.getByRole("complementary");
    expect(panel).toBeDefined();
    expect(panel.getAttribute("aria-label")).toBe("Activity detail panel");
  });
});
