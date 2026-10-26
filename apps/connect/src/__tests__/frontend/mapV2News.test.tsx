/**
 * News reader (issue #216). The dialog is the real `MapV2News.Reader`, mounted with React in jsdom.
 * What this pins down: https links only, every close path (button, backdrop, Escape, the back guard),
 * focus moving to the title and back to the card, Tab staying inside the card, and the page behind
 * being locked (overflow hidden, #root inert) until the dialog goes.
 * The sheet and the profile page that open it are covered in e2e/map-v2-sheet-news.spec.ts.
 */
import React from "react";
import ReactDOM from "react-dom";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type ReaderProps = {
  post: { id: string; title: string; body: string; image?: string; date?: string; createdAt?: string };
  sourceName: string;
  strings: { close: string; readMore: string };
  onClose: () => void;
  returnFocus?: HTMLElement | null;
};
type Api = { Reader: React.ComponentType<ReaderProps>; linkify: (text: string) => unknown[] };

let api: Api;
let back: { close: () => void } | null = null;

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
      if (t.includes("refused.example")) return "";
      return /^https?:\/\//i.test(t) ? t : "";
    },
  };
  w.MapV2Time = { postedAgo: () => "3 days ago" };
  function useBackGuard(active: boolean, onBack: () => void) {
    React.useEffect(() => {
      if (!active) { back = null; return undefined; }
      back = { close: onBack };
      return () => { back = null; };
    });
  }
  w.useBackGuard = useBackGuard;
  load("map-v2-news.jsx");
  api = (window as unknown as { MapV2News: Api }).MapV2News;
});

const strings = { readMore: "Read more", close: "Close news post" };
const post = {
  id: "n1",
  title: "Sunday line-up",
  body: "Intro paragraph.\n\n• Item, 06:00–09:00\nSee the full line-up: https://example.org/line-up.\nhttp://insecure.example stays plain.\njavascript:alert(1) stays plain.\n**not markdown**",
  image: "https://example.org/photo.jpg",
  date: "2026-10-07",
  createdAt: "2026-10-07T08:00:00.000Z",
};

let root: HTMLDivElement;
let opener: HTMLButtonElement;

beforeEach(() => {
  root = document.createElement("div");
  root.id = "root";
  opener = document.createElement("button");
  opener.textContent = "Sunday line-up";
  root.appendChild(opener);
  document.body.appendChild(root);
  document.documentElement.style.overflow = "scroll";
  opener.focus();
});
afterEach(() => {
  cleanup();
  root.remove();
  document.documentElement.style.overflow = "";
  back = null;
});

function Host(props: Partial<ReaderProps> & { post?: ReaderProps["post"] }) {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  return React.createElement(api.Reader, {
    post: props.post || post,
    sourceName: "Fixture Fellowship",
    strings,
    returnFocus: opener,
    onClose: () => setOpen(false),
  });
}

describe("linkify", () => {
  const textOf = (parts: unknown[]) => parts.map((p) => (typeof p === "string" ? p : (p as { props: { children: string; href: string } }).props.children)).join("");

  it("turns a bare https URL into a link and puts the trailing punctuation back in the text", () => {
    const parts = api.linkify("See https://example.org/line-up. Today.");
    const link = parts.find((p) => typeof p !== "string") as { props: { href: string; target: string; rel: string; children: string } };
    expect(link.props.href).toBe("https://example.org/line-up");
    expect(link.props.children).toBe("https://example.org/line-up");
    expect(link.props.target).toBe("_blank");
    expect(link.props.rel).toBe("noopener noreferrer");
    expect(textOf(parts)).toBe("See https://example.org/line-up. Today.");
    expect(parts.some((p) => typeof p === "string" && p.startsWith("."))).toBe(true);
  });

  it("leaves javascript:, http:, markdown and a URL safeUrl refuses as plain text", () => {
    const raw = "javascript:alert(1) and http://insecure.example and **bold** and https://refused.example/x";
    const parts = api.linkify(raw);
    expect(parts.every((p) => typeof p === "string")).toBe(true);
    expect(textOf(parts)).toBe(raw);
  });

  it("keeps blank lines and returns nothing for an empty body", () => {
    expect(api.linkify("")).toEqual([]);
    expect(api.linkify("A\n\nB").join("")).toBe("A\n\nB");
  });
});

describe("the reader dialog", () => {
  it("opens on the title, shows the full body, and locks the page behind it", () => {
    render(React.createElement(Host));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "mv2-news-title");
    expect(document.getElementById("mv2-news-title")).toHaveFocus();
    expect(screen.getByText("Fixture Fellowship")).toBeInTheDocument();
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
    const body = document.querySelector("[data-mv2='news-body']") as HTMLElement;
    expect(body.textContent).toContain("Intro paragraph.");
    expect(body.textContent).toContain("• Item, 06:00–09:00");
    const link = screen.getByRole("link", { name: "https://example.org/line-up" });
    expect(link).toHaveAttribute("href", "https://example.org/line-up");
    expect(body.textContent).toContain("http://insecure.example stays plain.");
    expect(body.textContent).toContain("javascript:alert(1)");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(root.inert).toBe(true);
  });

  it("closes from the button and returns focus to the opening card", () => {
    render(React.createElement(Host));
    fireEvent.click(screen.getByRole("button", { name: "Close news post" }));
    expect(document.querySelector("[data-mv2='news']")).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(root.inert).toBe(false);
  });

  it("closes from the backdrop and not from a click on the card", () => {
    render(React.createElement(Host));
    fireEvent.click(screen.getByRole("dialog"));
    expect(document.querySelector("[data-mv2='news']")).not.toBeNull();
    fireEvent.click(document.querySelector("[data-mv2='news']") as HTMLElement);
    expect(document.querySelector("[data-mv2='news']")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("keeps the reader open when a drag on the backdrop ends there", () => {
    render(React.createElement(Host));
    const scrim = document.querySelector("[data-mv2='news']") as HTMLElement;
    fireEvent.pointerDown(scrim, { clientX: 4, clientY: 4 });
    fireEvent.pointerMove(scrim, { clientX: 4, clientY: 80 });
    fireEvent.click(scrim);
    expect(document.querySelector("[data-mv2='news']")).not.toBeNull();
    fireEvent.pointerDown(scrim, { clientX: 4, clientY: 4 });
    fireEvent.click(scrim);
    expect(document.querySelector("[data-mv2='news']")).toBeNull();
  });

  it("closes on Escape and does not let that key reach a listener behind the dialog", () => {
    const bubble = vi.fn();
    document.addEventListener("keydown", bubble);
    render(React.createElement(Host));
    fireEvent.keyDown(screen.getByRole("heading", { name: "Sunday line-up" }), { key: "Escape" });
    expect(document.querySelector("[data-mv2='news']")).toBeNull();
    expect(bubble).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
    document.removeEventListener("keydown", bubble);
  });

  it("closes when the back guard fires, which is the browser Back path", () => {
    render(React.createElement(Host));
    expect(back).not.toBeNull();
    act(() => { back!.close(); });
    expect(document.querySelector("[data-mv2='news']")).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(root.inert).toBe(false);
  });

  it("keeps Tab and Shift+Tab inside the card, starting from the title", () => {
    render(React.createElement(Host));
    const title = document.getElementById("mv2-news-title") as HTMLElement;
    const close = screen.getByRole("button", { name: "Close news post" });
    const link = screen.getByRole("link");
    expect(title).toHaveFocus();
    fireEvent.keyDown(title, { key: "Tab" });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    // The close button is not the last stop, so Tab is left to the browser. jsdom does not move focus;
    // the wrap itself is what this dialog adds, and that is the last stop and Shift+Tab from the first.
    link.focus();
    fireEvent.keyDown(link, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(link).toHaveFocus();
    expect(root.contains(document.activeElement)).toBe(false);
  });

  it("does not let a press on the scrim reach the sheet behind the portal", () => {
    const onSheet = vi.fn();
    function Pen() {
      return React.createElement("section", { onPointerDown: onSheet },
        ReactDOM.createPortal(React.createElement(api.Reader, {
          post, sourceName: "Fixture Fellowship", strings, onClose: () => {}, returnFocus: opener,
        }), document.body));
    }
    render(React.createElement(Pen));
    fireEvent.pointerDown(document.querySelector("[data-mv2='news']") as HTMLElement);
    expect(onSheet).not.toHaveBeenCalled();
  });

  it("drops a broken image, hides an empty body, and shows a long body under a fixed header", () => {
    const { rerender } = render(React.createElement(api.Reader, {
      post: { ...post, image: "https://example.org/missing.jpg" }, sourceName: "Fixture Fellowship", strings, onClose: () => {}, returnFocus: opener,
    }));
    fireEvent.error(document.querySelector("[data-mv2='news-img']") as HTMLElement);
    expect(document.querySelector("[data-mv2='news-img']")).toBeNull();
    expect(screen.getByRole("heading", { name: "Sunday line-up" })).toBeInTheDocument();

    rerender(React.createElement(api.Reader, {
      post: { ...post, image: "", body: "" }, sourceName: "Fixture Fellowship", strings, onClose: () => {}, returnFocus: opener,
    }));
    expect(document.querySelector("[data-mv2='news-img']")).toBeNull();
    expect(document.querySelector("[data-mv2='news-body']")).toBeNull();

    const long = "Word ".repeat(1000).slice(0, 5000);
    rerender(React.createElement(api.Reader, {
      post: { ...post, image: "", body: long }, sourceName: "Fixture Fellowship", strings, onClose: () => {}, returnFocus: opener,
    }));
    expect(document.querySelector("[data-mv2='news-body']")!.textContent).toHaveLength(5000);
    expect(document.querySelector("[data-mv2='news-head']")).not.toBeNull();
    expect(document.querySelector("[data-mv2='news-scroll']")).not.toBeNull();
  });
});

describe("where the reader is wired", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("is registered after the gallery and before the sheet, in the page and the build", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    expect(html.indexOf("app/map-v2-gallery.jsx")).toBeLessThan(html.indexOf("app/map-v2-news.jsx"));
    expect(html.indexOf("app/map-v2-news.jsx")).toBeLessThan(html.indexOf("app/map-v2-sheet.jsx"));
    expect(build.indexOf("'map-v2-gallery.jsx'")).toBeLessThan(build.indexOf("'map-v2-news.jsx'"));
    expect(build.indexOf("'map-v2-news.jsx'")).toBeLessThan(build.indexOf("'map-v2-sheet.jsx'"));
    expect(html).toContain("app/map-v2-news.jsx?v=20261019a");
    expect(html).toContain("app/profiles.jsx?v=20261019d");
    expect(html).toContain("app/map-v2-strings.jsx?v=20261026b");
  });

  it("adds only the scrim blur and the reading width, and the card motion follows the duration token", () => {
    const css = read("src/frontend/assets/map-v2.css");
    expect(css).toMatch(/--scrim-blur:\s*4px;/);
    expect(css).toMatch(/--reader-w:\s*560px;/);
    const components = css.slice(css.indexOf("/* ── 4. Components"));
    expect(components).not.toMatch(/--scrim-blur:\s*4px/);
    expect(components).toContain("blur(var(--scrim-blur))");
    expect(components).toContain("var(--reader-w)");
    expect(components).toContain("@keyframes mv2-news-in");
    expect(components).toMatch(/animation:\s*mv2-news-in var\(--dur-base\)/);
    expect(components).toContain("prefers-reduced-transparency: reduce");
    expect(css).toMatch(/\[data-mv2='post'\]\[data-news\]:focus-visible/);
    expect(css).toMatch(/\[data-mv2='news-link'\]:focus-visible/);
  });

  it("keeps the profile card a div with preserved line breaks when Map v2 is off", () => {
    const src = read("src/frontend/app/profiles.jsx");
    expect(src).toContain("whitespace-pre-line");
    expect(src).toContain("line-clamp-3");
    expect(src).toContain("window.isMapV2 && window.isMapV2()");
    expect(src).toContain("MapV2News.Reader");
    const sheet = read("src/frontend/app/map-v2-sheet.jsx");
    expect(sheet).toContain("'data-news': ''");
    expect(sheet).toContain("aria-haspopup");
    expect(sheet).toContain("Str.news.readMore");
    expect(sheet).not.toMatch(/history\.pushState\(/);
  });
});
