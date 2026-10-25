/**
 * Map v2 card (issue #222). One component, six variants. Category text comes
 * from window.DATA.getItemCategory. Video never mounts a player. Audio and
 * video links go through UI.safeUrl.
 */
import React from "react";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type CardProps = Record<string, unknown>;
type Card = React.ComponentType<CardProps>;

let Card: Card;

function load(file: string) {
  const src = readFileSync(join(process.cwd(), "src/frontend/app", file), "utf8");
  new Function("window", "React", "document", src)(window, React, document);
}

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  function Icon({ name, size }: { name: string; size: number }) {
    return React.createElement("svg", { "data-icon": name, width: size, height: size });
  }
  w.Icon = Icon;
  w.UI = {
    safeUrl: (u: unknown) => {
      const t = String(u || "").trim();
      return /^https?:\/\//i.test(t) ? t : "";
    },
  };
  load("data.jsx");
  load("map-v2-strings.jsx");
  load("map-v2-card.jsx");
  Card = (window as unknown as { MapV2Card: Card }).MapV2Card;
});

afterEach(() => cleanup());

function mount(props: CardProps) {
  return render(React.createElement(Card, props));
}

const CARE = { type: "event", category: "care-recovery" };
const PHOTO = "https://example.org/photo.jpg";

describe("text", () => {
  it("shows the title, the excerpt and the posted line, and omits an empty media slot", () => {
    const onClick = () => {};
    const { container } = mount({
      variant: "text",
      title: "Saturday note",
      excerpt: "A short note about the morning.",
      meta: ["3 days ago"],
      moreLabel: "Read more",
      onClick,
    });
    const card = container.querySelector("[data-mv2='card2']")!;
    expect(card.tagName).toBe("BUTTON");
    expect(card.getAttribute("data-variant")).toBe("text");
    expect(container.querySelector("[data-mv2='card-media']")).toBeNull();
    expect(container.querySelector("[data-mv2='row-title']")!.textContent).toBe("Saturday note");
    expect(container.querySelector("[data-mv2='card-excerpt']")!.textContent).toBe("A short note about the morning.");
    expect(container.querySelector("[data-mv2='row-meta']")!.textContent).toBe("3 days ago");
    expect(container.querySelector("[data-mv2='post-more']")!.textContent).toBe("Read more");
    expect(card.getAttribute("aria-labelledby")).toContain(container.querySelector("[data-mv2='row-title']")!.id);
  });
});

describe("image", () => {
  it("shows a 16:9 picture when the address is safe", () => {
    const { container } = mount({ variant: "image", title: "Market photo", media: { src: PHOTO }, onClick: () => {} });
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(PHOTO);
    expect(img.getAttribute("data-mv2")).toBe("card-photo");
    expect(container.querySelector("[data-mv2='card-media']")).not.toBeNull();
  });

  it("drops the picture when the address is refused or the file fails", () => {
    const refused = mount({ variant: "image", title: "No photo", media: { src: "javascript:alert(1)" }, onClick: () => {} });
    expect(refused.container.querySelector("img")).toBeNull();
    refused.unmount();

    const broken = mount({ variant: "image", title: "Broken photo", media: { src: PHOTO }, onClick: () => {} });
    fireEvent.error(broken.container.querySelector("img")!);
    expect(broken.container.querySelector("[data-mv2='card-media']")).toBeNull();
    expect(broken.container.querySelector("[data-mv2='row-title']")!.textContent).toBe("Broken photo");
  });
});

describe("video", () => {
  it("is a poster and a play disc that opens a safe link, and never a player", () => {
    const { container } = mount({
      variant: "video",
      title: "Morning service",
      media: { src: PHOTO },
      href: "https://example.org/watch",
      duration: "12:04",
      meta: ["12 min · 3 days ago"],
    });
    const card = container.querySelector("[data-mv2='card2']")!;
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("https://example.org/watch");
    expect(card.getAttribute("target")).toBe("_blank");
    expect(card.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.querySelector("[data-mv2='card-play'] [data-icon='Play']")).not.toBeNull();
    expect(container.querySelector("[data-mv2='card-duration']")!.textContent).toBe("12:04");
    expect(container.querySelector("video, audio, iframe")).toBeNull();
    expect(card.outerHTML).not.toMatch(/autoplay/i);
  });

  it("drops the link and the play disc when safeUrl refuses the address", () => {
    const { container } = mount({
      variant: "video",
      title: "Refused",
      media: { src: PHOTO },
      href: "javascript:alert(1)",
      duration: "1:00",
    });
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[data-mv2='card-play']")).toBeNull();
    expect(container.querySelector("video, audio, iframe")).toBeNull();
  });

  it("refuses every link when safeUrl is missing", () => {
    const w = window as unknown as { UI?: unknown };
    const ui = w.UI;
    w.UI = undefined;
    try {
      const { container } = mount({ variant: "video", title: "No helper", href: PHOTO, media: { src: PHOTO } });
      expect(container.querySelector("a")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
    } finally {
      w.UI = ui;
    }
  });
});

describe("audio", () => {
  it("shows the artwork, the show time, a Live badge and a Listen link", () => {
    const { container } = mount({
      variant: "audio",
      title: "Evening hour",
      media: { src: PHOTO },
      href: "https://example.org/listen",
      meta: ["18:00"],
      live: true,
    });
    expect(container.querySelector("[data-mv2='card-art']")!.getAttribute("src")).toBe(PHOTO);
    expect(container.querySelector("[data-mv2='row-meta']")!.textContent).toBe("18:00");
    expect(container.querySelector("[data-mv2='card-live']")!.textContent).toBe("Live");
    expect(container.querySelector("[data-mv2='card-live-dot']")).not.toBeNull();
    const listen = container.querySelector("[data-mv2='action']")!;
    expect(listen.textContent).toBe("Listen");
    expect(listen.getAttribute("href")).toBe("https://example.org/listen");
    expect(listen.getAttribute("target")).toBe("_blank");
    expect(container.querySelector("[data-mv2='card-tap'] [data-mv2='action']")).toBeNull();
    expect(container.querySelector("[data-mv2='card-actions'] [data-mv2='action']")).not.toBeNull();
    expect(container.querySelector("audio, video, iframe")).toBeNull();
  });

  it("leaves Listen out when the address is refused", () => {
    const { container } = mount({ variant: "audio", title: "Quiet", href: "javascript:alert(1)", meta: ["18:00"] });
    expect(container.querySelector("[data-mv2='action']")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("event", () => {
  it("puts Group | Category under the title, with the date block and the host", () => {
    const long = "A title that is far too long to fit on two lines of a narrow card and must still be the accessible name in full";
    const { container } = mount({
      variant: "event",
      item: CARE,
      kind: "Event",
      title: long,
      date: { day: "14", month: "Oct" },
      meta: ["Starts Wed, 10:00", "Pretoria", { text: "With Fixture Fellowship", host: true }],
      onClick: () => {},
    });
    const copy = container.querySelector("[data-mv2='card-copy']")!;
    const order = [...copy.children].map((n) => n.getAttribute("data-mv2"));
    expect(order.indexOf("row-title")).toBeLessThan(order.indexOf("card-group"));
    expect(container.querySelector("[data-mv2='card-chip']")).toBeNull();
    expect(container.querySelector("[data-mv2='card-group']")!.textContent).toBe("Serve | Care & Recovery");
    const dot = container.querySelector("[data-mv2='card-dot']") as HTMLElement;
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.style.backgroundColor).toBe("rgb(142, 68, 173)");
    expect(container.querySelector("[data-mv2='card-day']")!.textContent).toBe("14");
    expect(container.querySelector("[data-mv2='card-month']")!.textContent).toBe("Oct");
    expect(container.querySelector("[data-host]")!.textContent).toBe("With Fixture Fellowship");
    expect(container.querySelector("[data-mv2='row-meta']")!.textContent).toBe("Starts Wed, 10:00");
    expect(container.querySelector("[data-mv2='row-title']")!.textContent).toBe(long);
  });

  it("falls back to the kind label and a muted dot when there is no category", () => {
    const { container } = mount({
      variant: "event",
      kind: "Event",
      title: "Untitled gathering",
      date: { day: "2", month: "Oct" },
      meta: ["3 days ago"],
    });
    expect(container.querySelector("[data-mv2='card2']")!.tagName).toBe("DIV");
    expect(container.querySelector("[data-mv2='card-group']")!.textContent).toBe("Event");
    const dot = container.querySelector("[data-mv2='card-dot']") as HTMLElement;
    expect(dot.hasAttribute("data-fallback")).toBe(true);
    expect(dot.getAttribute("style")).toBeNull();
  });

  it("does not paint a category colour that is not a hex", () => {
    const { container } = mount({
      variant: "text",
      category: { name: "Odd", hex: "red;background:url(https://evil.example)" },
      kind: "News",
      title: "Odd chip",
      onClick: () => {},
    });
    const dot = container.querySelector("[data-mv2='card-dot']") as HTMLElement;
    expect(dot.getAttribute("style")).toBeNull();
    expect(container.querySelector("[data-mv2='card-chip']")!.textContent).toBe("Odd");
  });
});

describe("listing", () => {
  it("reads the group heading from getItemCategory and says the open state in words", () => {
    const { container } = mount({
      variant: "listing",
      item: CARE,
      kind: "Event",
      title: "Care circle",
      meta: ["Event · Serve | Care & Recovery · 1.2 km away"],
      openState: { status: "open", text: "Open · closes 17:00" },
      onClick: () => {},
    });
    expect(container.querySelector("[data-mv2='card-chip']")!.textContent).toBe("Serve | Care & Recovery");
    expect(container.querySelector("[data-mv2='state']")!.textContent).toBe("Open · closes 17:00");
    expect(container.querySelector("[data-mv2='state']")!.getAttribute("data-status")).toBe("open");
    expect(container.querySelector("[data-mv2='row-meta']")!.textContent).toMatch(/away$/);
    expect(container.querySelector("[data-mv2='card-initials']")!.textContent).toBe("CC");
  });

  it("uses a safe logo, and initials when that logo fails", () => {
    const shown = mount({ variant: "listing", title: "Corner cafe", kind: "Place", media: { src: PHOTO }, onClick: () => {} });
    expect(shown.container.querySelector("[data-mv2='card-logo']")!.getAttribute("src")).toBe(PHOTO);
    expect(shown.container.querySelector("[data-mv2='card-initials']")).toBeNull();
    shown.unmount();

    const failed = mount({ variant: "listing", title: "Corner cafe", kind: "Place", media: { src: PHOTO }, onClick: () => {} });
    fireEvent.error(failed.container.querySelector("img")!);
    expect(failed.container.querySelector("[data-mv2='card-logo']")).toBeNull();
    expect(failed.container.querySelector("[data-mv2='card-initials']")!.textContent).toBe("CC");
  });

  it("shows a place category name with no group", () => {
    const { container } = mount({
      variant: "listing",
      item: { type: "place", category: "safe-spaces" },
      kind: "Place",
      title: "Quiet room",
      onClick: () => {},
    });
    expect(container.querySelector("[data-mv2='card-chip']")!.textContent).toBe("Safe Spaces");
  });
});

describe("states", () => {
  it("loading is the same box with a skeleton and two bars, and no title", () => {
    const { container } = mount({ variant: "text", loading: true, title: "Hidden while loading" });
    const card = container.querySelector("[data-mv2='card2']")!;
    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(card.getAttribute("aria-label")).toBe("Loading");
    expect(container.querySelectorAll("[data-mv2='card-media'][data-skeleton]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-mv2='card-bar'][data-skeleton]")).toHaveLength(2);
    expect(container.querySelector("[data-mv2='row-title']")).toBeNull();
  });

  it("a card with nowhere to go is not a button", () => {
    const { container } = mount({ variant: "text", title: "Just a note", meta: ["Yesterday"] });
    expect(container.querySelector("[data-mv2='card2']")!.tagName).toBe("DIV");
    expect(container.querySelector("button, a")).toBeNull();
  });
});

describe("wiring", () => {
  it("loads the card before Nearby and the sheet, in the page and in the build", () => {
    const html = readFileSync(join(process.cwd(), "src/frontend/index.html"), "utf8");
    const build = readFileSync(join(process.cwd(), "scripts/build-frontend.js"), "utf8");
    const css = readFileSync(join(process.cwd(), "src/frontend/assets/map-v2.css"), "utf8");
    const cardAt = html.indexOf("app/map-v2-card.jsx");
    const nearAt = html.indexOf("app/map-v2-nearby.jsx");
    const sheetAt = html.indexOf("app/map-v2-sheet.jsx");
    expect(cardAt).toBeGreaterThan(0);
    expect(cardAt).toBeLessThan(nearAt);
    expect(nearAt).toBeLessThan(sheetAt);
    const order = build.indexOf("'map-v2-card.jsx'");
    expect(order).toBeGreaterThan(build.indexOf("'map-v2-news.jsx'"));
    expect(order).toBeLessThan(build.indexOf("'map-v2-nearby.jsx'"));
    expect(css).toContain("/* ── 4h. Cards");
    const reduced = css.slice(css.indexOf("/* ── 4h. Cards"));
    expect(reduced).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\[data-mv2='card2'\]:active[^}]*transform:\s*none/);
  });
});
