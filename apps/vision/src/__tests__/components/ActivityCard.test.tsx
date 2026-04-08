import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityCard } from "@/components/activities/ActivityCard";
import type { Activity, ActivityTag } from "@/types/db";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const baseActivity: Activity & {
  activity_tags: ActivityTag[];
  departments: { name: string } | null;
} = {
  id: "act-1",
  org_id: "org-1",
  department_id: "dept-1",
  title: "Community Workshop",
  description: "A hands-on workshop for community members.",
  type: "workshop",
  date: "2025-01-15",
  start_time: null,
  end_time: null,
  latitude: null,
  longitude: null,
  location_name: "Community Hall",
  participant_count: 25,
  source_type: "manual",
  source_id: null,
  created_by: "user-1",
  created_at: "2025-01-10T00:00:00Z",
  updated_at: "2025-01-10T00:00:00Z",
  activity_tags: [{ activity_id: "act-1", tag: "education" }],
  departments: { name: "Education" },
};

describe("ActivityCard", () => {
  it("renders activity title", () => {
    render(<ActivityCard activity={baseActivity} orgSlug="test-org" />);
    expect(screen.getByText("Community Workshop")).toBeInTheDocument();
  });

  it("renders activity type badge", () => {
    render(<ActivityCard activity={baseActivity} orgSlug="test-org" />);
    expect(screen.getByText("Workshop")).toBeInTheDocument();
  });

  it("renders description (truncated)", () => {
    render(<ActivityCard activity={baseActivity} orgSlug="test-org" />);
    expect(
      screen.getByText("A hands-on workshop for community members.")
    ).toBeInTheDocument();
  });

  it("renders date", () => {
    render(<ActivityCard activity={baseActivity} orgSlug="test-org" />);
    expect(screen.getByText("2025-01-15")).toBeInTheDocument();
  });

  it("renders location name", () => {
    render(<ActivityCard activity={baseActivity} orgSlug="test-org" />);
    expect(screen.getByText(/Community Hall/)).toBeInTheDocument();
  });

  it("renders participant count", () => {
    render(<ActivityCard activity={baseActivity} orgSlug="test-org" />);
    expect(screen.getByText(/👥 25/)).toBeInTheDocument();
  });

  it("renders tags", () => {
    render(<ActivityCard activity={baseActivity} orgSlug="test-org" />);
    expect(screen.getByText("education")).toBeInTheDocument();
  });

  it("renders department name", () => {
    render(<ActivityCard activity={baseActivity} orgSlug="test-org" />);
    expect(screen.getByText("Education")).toBeInTheDocument();
  });

  it("links to the activity detail page", () => {
    render(<ActivityCard activity={baseActivity} orgSlug="test-org" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/test-org/activities/act-1");
  });

  it("does not render description if null", () => {
    const activity = { ...baseActivity, description: null };
    const { container } = render(
      <ActivityCard activity={activity} orgSlug="test-org" />
    );
    expect(container.querySelector(".line-clamp-2")).toBeNull();
  });

  it("does not render location if null", () => {
    const activity = { ...baseActivity, location_name: null };
    render(<ActivityCard activity={activity} orgSlug="test-org" />);
    expect(screen.queryByText(/📍/)).toBeNull();
  });
});
