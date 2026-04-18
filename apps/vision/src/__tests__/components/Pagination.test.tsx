import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pagination } from "@/components/ui/Pagination";

describe("Pagination", () => {
  const buildHref = (p: number) => `/x?page=${p}`;

  it("renders nothing when totalPages <= 1", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} buildHref={buildHref} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders page status with total count when provided", () => {
    render(
      <Pagination page={2} totalPages={5} total={97} buildHref={buildHref} />
    );
    expect(screen.getByText(/Page 2 of 5 \(97 total\)/)).toBeInTheDocument();
  });

  it("renders page status without total when omitted", () => {
    render(
      <Pagination page={2} totalPages={5} buildHref={buildHref} />
    );
    expect(screen.getByText(/Page 2 of 5$/)).toBeInTheDocument();
  });

  it("hides Previous on first page", () => {
    render(
      <Pagination page={1} totalPages={3} buildHref={buildHref} />
    );
    expect(screen.queryByRole("link", { name: /previous/i })).toBeNull();
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute(
      "href",
      "/x?page=2"
    );
  });

  it("hides Next on last page", () => {
    render(
      <Pagination page={3} totalPages={3} buildHref={buildHref} />
    );
    expect(screen.queryByRole("link", { name: /next/i })).toBeNull();
    expect(screen.getByRole("link", { name: /previous/i })).toHaveAttribute(
      "href",
      "/x?page=2"
    );
  });

  it("shows both Previous and Next on middle pages", () => {
    render(
      <Pagination page={2} totalPages={3} buildHref={buildHref} />
    );
    expect(screen.getByRole("link", { name: /previous/i })).toHaveAttribute(
      "href",
      "/x?page=1"
    );
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute(
      "href",
      "/x?page=3"
    );
  });

  it("applies the supplied aria-label to the nav", () => {
    render(
      <Pagination
        page={1}
        totalPages={2}
        buildHref={buildHref}
        ariaLabel="Custom pager"
      />
    );
    expect(screen.getByRole("navigation", { name: "Custom pager" })).toBeInTheDocument();
  });

  it("supports centered variant", () => {
    const { container } = render(
      <Pagination
        page={2}
        totalPages={3}
        buildHref={buildHref}
        variant="centered"
      />
    );
    const nav = container.querySelector("nav");
    expect(nav?.className).toMatch(/justify-center/);
  });
});
