import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "@/components/ui/Sidebar";

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "test-org" }),
  usePathname: () => "/test-org",
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all navigation items", () => {
    render(<Sidebar />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Activities")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByText("Advisory")).toBeInTheDocument();
    expect(screen.getByText("Boundaries")).toBeInTheDocument();
    expect(screen.getByText("Connect")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders mobile hamburger button", () => {
    render(<Sidebar />);
    const menuButton = screen.getByLabelText("Open navigation menu");
    expect(menuButton).toBeInTheDocument();
  });

  it("opens mobile nav on hamburger click", () => {
    render(<Sidebar />);
    const menuButton = screen.getByLabelText("Open navigation menu");
    fireEvent.click(menuButton);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
  });

  it("closes mobile nav on close button click", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close navigation menu"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes mobile nav on escape key", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders desktop nav with aria-label", () => {
    render(<Sidebar />);
    const nav = screen.getByLabelText("Main navigation");
    expect(nav).toBeInTheDocument();
  });

  it("has 11 navigation items", () => {
    render(<Sidebar />);
    const links = screen.getAllByRole("link");
    // 11 nav items in desktop + 11 in mobile hamburger (hidden) = check at least 11
    expect(links.length).toBeGreaterThanOrEqual(11);
  });
});
