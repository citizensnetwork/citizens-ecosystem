import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EventStatusBadge, {
  deriveEventStatus,
} from "@/components/events/EventStatusBadge";

// Deterministic clock for the pure derive() helper.
const NOW = new Date("2024-06-15T12:00:00Z");

describe("deriveEventStatus", () => {
  it("returns cancelled when status is cancelled (regardless of time)", () => {
    expect(
      deriveEventStatus("cancelled", "2024-06-15T11:00:00Z", null, NOW),
    ).toEqual({ kind: "cancelled" });
  });

  it("returns live when now is between start and end", () => {
    expect(
      deriveEventStatus(
        "published",
        "2024-06-15T11:30:00Z",
        "2024-06-15T13:00:00Z",
        NOW,
      ),
    ).toEqual({ kind: "live" });
  });

  it("returns live using the 2h fallback when end_time is null", () => {
    expect(
      deriveEventStatus("published", "2024-06-15T11:00:00Z", null, NOW),
    ).toEqual({ kind: "live" });
  });

  it("returns ended when now is past end_time", () => {
    expect(
      deriveEventStatus(
        "published",
        "2024-06-15T09:00:00Z",
        "2024-06-15T10:00:00Z",
        NOW,
      ),
    ).toEqual({ kind: "ended" });
  });

  it("returns upcoming when now is before start", () => {
    expect(
      deriveEventStatus("published", "2024-06-16T12:00:00Z", null, NOW),
    ).toEqual({ kind: "upcoming" });
  });

  it("returns upcoming on invalid date", () => {
    expect(deriveEventStatus("published", "not-a-date", null, NOW)).toEqual({
      kind: "upcoming",
    });
  });
});

describe("<EventStatusBadge />", () => {
  it("renders the Cancelled pill", () => {
    render(
      <EventStatusBadge status="cancelled" date="2099-01-01T00:00:00Z" />,
    );
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
  });

  it("renders null for upcoming by default", () => {
    const { container } = render(
      <EventStatusBadge status="published" date="2099-01-01T00:00:00Z" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders Upcoming when showUpcoming=true", () => {
    render(
      <EventStatusBadge
        status="published"
        date="2099-01-01T00:00:00Z"
        showUpcoming
      />,
    );
    expect(screen.getByText(/upcoming/i)).toBeInTheDocument();
  });

  it("renders the Ended pill for past events", () => {
    render(
      <EventStatusBadge
        status="published"
        date="2000-01-01T00:00:00Z"
        endTime="2000-01-01T01:00:00Z"
      />,
    );
    expect(screen.getByText(/ended/i)).toBeInTheDocument();
  });

  it("applies small size class when size='sm'", () => {
    render(
      <EventStatusBadge
        status="cancelled"
        date="2099-01-01T00:00:00Z"
        size="sm"
      />,
    );
    const pill = screen.getByText(/cancelled/i);
    expect(pill.className).toContain("text-[10px]");
  });
});
