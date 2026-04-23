import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EventList from "@/components/events/EventList";
import { makeEvent } from "../../helpers/fixtures";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

describe("EventList", () => {
  it("renders empty state when no events", () => {
    render(<EventList events={[]} />);
    expect(screen.getByText("No events here yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Be the first to create one — or widen your filters to see more."
      )
    ).toBeInTheDocument();
  });

  it("renders custom empty state via props", () => {
    render(
      <EventList
        events={[]}
        emptyTitle="No community groups nearby"
        emptyHint="Try expanding your radius or explore a new area."
      />
    );
    expect(screen.getByText("No community groups nearby")).toBeInTheDocument();
    expect(
      screen.getByText("Try expanding your radius or explore a new area.")
    ).toBeInTheDocument();
  });

  it("renders one EventCard per event", () => {
    const events = [
      makeEvent({ id: "1", title: "Event A" }),
      makeEvent({ id: "2", title: "Event B" }),
      makeEvent({ id: "3", title: "Event C" }),
    ];
    render(<EventList events={events} />);
    expect(screen.getByText("Event A")).toBeInTheDocument();
    expect(screen.getByText("Event B")).toBeInTheDocument();
    expect(screen.getByText("Event C")).toBeInTheDocument();
  });

  it("renders grid container for non-empty list", () => {
    const events = [makeEvent({ id: "1", title: "Event A" })];
    const { container } = render(<EventList events={events} />);
    const grid = container.querySelector(".grid");
    expect(grid).toBeInTheDocument();
  });
});
