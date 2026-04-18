import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectEventCard } from "@/components/connect/ConnectEventCard";
import type { CCEvent } from "@/types/db";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock next/navigation (SyncStatusPanel uses useRouter for refresh after sync)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const baseEvent: CCEvent = {
  cc_event_id: "e1",
  title: "Community Cleanup",
  description: "A cleanup event for the local park",
  date: "2025-03-15T10:00:00Z",
  end_time: null,
  location: "Central Park",
  latitude: 51.5,
  longitude: -0.1,
  category: "environment",
  status: "active",
  created_by: "user-1",
  rsvp_count: 25,
  avg_rating: 4.5,
  synced_at: "2025-03-14T00:00:00Z",
  cv_org_id: null,
  cv_project_id: null,
  cv_activity_id: null,
};

describe("ConnectEventCard", () => {
  it("renders event title and description", () => {
    render(<ConnectEventCard event={baseEvent} orgSlug="test-org" />);
    expect(screen.getByText("Community Cleanup")).toBeInTheDocument();
    expect(screen.getByText("A cleanup event for the local park")).toBeInTheDocument();
  });

  it("shows Unclaimed badge for unclaimed events", () => {
    render(<ConnectEventCard event={baseEvent} orgSlug="test-org" />);
    expect(screen.getByText("Unclaimed")).toBeInTheDocument();
  });

  it("shows Claimed badge for claimed events", () => {
    const claimed = { ...baseEvent, cv_org_id: "org-1" };
    render(<ConnectEventCard event={claimed} orgSlug="test-org" />);
    expect(screen.getByText("Claimed")).toBeInTheDocument();
  });

  it("shows Promoted badge for promoted events", () => {
    const promoted = { ...baseEvent, cv_org_id: "org-1", cv_activity_id: "act-1" };
    render(<ConnectEventCard event={promoted} orgSlug="test-org" />);
    expect(screen.getByText("Promoted")).toBeInTheDocument();
  });

  it("shows claim button for unclaimed events when handler provided", () => {
    const onClaim = vi.fn();
    render(<ConnectEventCard event={baseEvent} orgSlug="test-org" onClaim={onClaim} />);
    const btn = screen.getByText("Claim for Org");
    fireEvent.click(btn);
    expect(onClaim).toHaveBeenCalledWith("e1");
  });

  it("shows promote button for claimed events when handler provided", () => {
    const claimed = { ...baseEvent, cv_org_id: "org-1" };
    const onPromote = vi.fn();
    render(<ConnectEventCard event={claimed} orgSlug="test-org" onPromote={onPromote} />);
    const btn = screen.getByText("Promote to Activity");
    fireEvent.click(btn);
    expect(onPromote).toHaveBeenCalledWith("e1");
  });

  it("displays location and RSVP count", () => {
    render(<ConnectEventCard event={baseEvent} orgSlug="test-org" />);
    expect(screen.getByText("Central Park")).toBeInTheDocument();
    expect(screen.getByText("25 RSVPs")).toBeInTheDocument();
  });

  it("displays category badge", () => {
    render(<ConnectEventCard event={baseEvent} orgSlug="test-org" />);
    expect(screen.getByText("environment")).toBeInTheDocument();
  });

  it("displays rating", () => {
    render(<ConnectEventCard event={baseEvent} orgSlug="test-org" />);
    expect(screen.getByText("★ 4.5")).toBeInTheDocument();
  });
});

// -- ConnectPlaceList --
import { ConnectPlaceList } from "@/components/connect/ConnectPlaceList";
import type { CCPlace } from "@/types/db";

const basePlaces: CCPlace[] = [
  {
    cc_place_id: "p1",
    name: "Community Center",
    address: "123 Main St",
    latitude: 51.5,
    longitude: -0.1,
    category: "community",
    verified: true,
    avg_rating: 4.2,
    cv_org_id: null,
    synced_at: "2025-03-14T00:00:00Z",
  },
];

describe("ConnectPlaceList", () => {
  it("renders place name and address", () => {
    render(<ConnectPlaceList initialPlaces={basePlaces} orgId="org-1" orgSlug="test-org" total={1} page={1} perPage={20} />);
    expect(screen.getByText("Community Center")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
  });

  it("shows empty state with no places", () => {
    render(<ConnectPlaceList initialPlaces={[]} orgId="org-1" orgSlug="test-org" total={0} page={1} perPage={20} />);
    expect(screen.getByText("No Connect places")).toBeInTheDocument();
  });

  it("shows Verified badge for verified places", () => {
    render(<ConnectPlaceList initialPlaces={basePlaces} orgId="org-1" orgSlug="test-org" total={1} page={1} perPage={20} />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("shows Unclaimed badge for unclaimed places", () => {
    render(<ConnectPlaceList initialPlaces={basePlaces} orgId="org-1" orgSlug="test-org" total={1} page={1} perPage={20} />);
    expect(screen.getByText("Unclaimed")).toBeInTheDocument();
  });

  it("shows Associate with Org button for unclaimed places", () => {
    render(<ConnectPlaceList initialPlaces={basePlaces} orgId="org-1" orgSlug="test-org" total={1} page={1} perPage={20} />);
    expect(screen.getByText("Associate with Org")).toBeInTheDocument();
  });
});

// -- SyncStatusPanel --
import { SyncStatusPanel } from "@/components/connect/SyncStatusPanel";

describe("SyncStatusPanel", () => {
  it("renders stats summary", () => {
    render(
      <SyncStatusPanel
        logs={[]}
        stats={{ claimed_events: 5, claimed_places: 3, last_sync: null }}
      />
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("shows sync logs", () => {
    const logs = [
      { id: "log1", sync_type: "events" as const, started_at: "2025-03-15T10:00:00Z", completed_at: "2025-03-15T10:00:30Z", records_synced: 42, errors: [], org_id: "org1" },
    ];
    render(
      <SyncStatusPanel
        logs={logs}
        stats={{ claimed_events: 5, claimed_places: 3, last_sync: logs[0] }}
      />
    );
    expect(screen.getByText("42 records")).toBeInTheDocument();
  });

  it("shows no sync logs message", () => {
    render(
      <SyncStatusPanel
        logs={[]}
        stats={{ claimed_events: 0, claimed_places: 0, last_sync: null }}
      />
    );
    expect(screen.getByText("No sync logs yet.")).toBeInTheDocument();
  });
});
