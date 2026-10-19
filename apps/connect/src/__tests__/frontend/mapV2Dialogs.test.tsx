/**
 * QR dialog and photo viewer (issue #223). Mounts the real MapV2QR.Dialog and
 * MapV2Gallery.Viewer. What this pins down: a press does not bubble to the sheet
 * (React portals retarget events), Tab stays inside, #root is inert until the
 * last dialog closes, the page's overflow is restored, and a backdrop tap
 * closes the QR dialog. The sheet that opens them is covered in e2e.
 */
import React from "react";
import ReactDOM from "react-dom";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type QrProps = {
  url: string;
  name: string;
  slug: string;
  strings: {
    title: (name: string) => string;
    hint: string;
    printHint: string;
    screenshotHint: string;
    imageLabel: (name: string, url: string) => string;
    save: string;
    close: string;
    fileName: (slug: string) => string;
  };
  onClose: () => void;
  returnFocus?: HTMLElement | null;
};
type Image = { url: string; caption: string };
type ViewerProps = {
  images: Image[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
  strings: {
    viewerLabel: (i: number, n: number) => string;
    closePhoto: string;
    prevPhoto: string;
    nextPhoto: string;
  };
  returnFocus?: HTMLElement | null;
};
type QrApi = { Dialog: React.ComponentType<QrProps> };
type GalleryApi = { Viewer: React.ComponentType<ViewerProps>; SWIPE_PX: number };
type MapV2 = {
  trapFocus: (root: HTMLElement | null) => () => void;
  lockBehind: () => () => void;
};

let Qr: QrApi;
let Gallery: GalleryApi;
let back: { close: () => void } | null = null;

function load(file: string) {
  const src = readFileSync(join(process.cwd(), "src/frontend/app", file), "utf8");
  new Function("window", "React", "document", src)(window, React, document);
}

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  function useBackGuard(active: boolean, onBack: () => void) {
    React.useEffect(() => {
      if (!active) {
        back = null;
        return undefined;
      }
      back = { close: onBack };
      return () => {
        back = null;
      };
    });
  }
  w.useBackGuard = useBackGuard;
  w.CapCore = undefined;
  load("map-v2-lib.jsx");
  load("map-v2-qr.jsx");
  load("map-v2-gallery.jsx");
  Qr = (window as unknown as { MapV2QR: QrApi }).MapV2QR;
  Gallery = (window as unknown as { MapV2Gallery: GalleryApi }).MapV2Gallery;
});

const qrStrings: QrProps["strings"] = {
  title: (name) => "QR code for " + name,
  hint: "Scanning it opens this listing in your phone's browser.",
  printHint: "Print it or show it at your venue.",
  screenshotHint: "To keep it, take a screenshot of this screen.",
  imageLabel: (name, url) => "QR code that opens " + name + " at " + url,
  save: "Save image",
  close: "Close QR code",
  fileName: (slug) => "citizens-connect-" + slug + ".png",
};
const galleryStrings: ViewerProps["strings"] = {
  viewerLabel: (i, n) => "Photo " + i + " of " + n,
  closePhoto: "Close photo",
  prevPhoto: "Previous photo",
  nextPhoto: "Next photo",
};
const images: Image[] = [
  { url: "https://example.org/a.jpg", caption: "North gate" },
  { url: "https://example.org/b.jpg", caption: "Hall" },
  { url: "https://example.org/c.jpg", caption: "" },
];
const QR_URL = "https://www.citizenscentral.co.za/c/fixture-fellowship";

let root: HTMLDivElement;
let opener: HTMLButtonElement;

beforeEach(() => {
  root = document.createElement("div");
  root.id = "root";
  opener = document.createElement("button");
  opener.textContent = "QR code";
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

function QrHost() {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  return React.createElement(Qr.Dialog, {
    url: QR_URL,
    name: "Fixture Fellowship",
    slug: "fixture-fellowship",
    strings: qrStrings,
    returnFocus: opener,
    onClose: () => setOpen(false),
  });
}

function ViewerHost({ start = 0 }: { start?: number }) {
  const [open, setOpen] = React.useState(true);
  const [index, setIndex] = React.useState(start);
  if (!open) return null;
  return React.createElement(Gallery.Viewer, {
    images,
    index,
    strings: galleryStrings,
    returnFocus: opener,
    onClose: () => setOpen(false),
    onIndex: setIndex,
  });
}

describe("a press on either dialog", () => {
  it("does not reach a pointer handler on the sheet behind the QR portal", () => {
    const onSheet = vi.fn();
    function Pen() {
      return React.createElement(
        "section",
        { onPointerDown: onSheet },
        ReactDOM.createPortal(
          React.createElement(Qr.Dialog, {
            url: QR_URL,
            name: "Fixture Fellowship",
            slug: "fixture-fellowship",
            strings: qrStrings,
            onClose: () => {},
            returnFocus: opener,
          }),
          document.body,
        ),
      );
    }
    render(React.createElement(Pen));
    fireEvent.pointerDown(document.querySelector("[data-mv2='qr']") as HTMLElement);
    fireEvent.pointerDown(document.querySelector("[data-mv2='qr-card']") as HTMLElement);
    expect(onSheet).not.toHaveBeenCalled();
  });

  it("does not reach the sheet, and a sideways press on the stage still changes photo", () => {
    const onSheet = vi.fn();
    function Pen() {
      return React.createElement(
        "section",
        { onPointerDown: onSheet },
        ReactDOM.createPortal(React.createElement(ViewerHost), document.body),
      );
    }
    render(React.createElement(Pen));
    const stage = document.querySelector("[data-mv2='viewer-stage']") as HTMLElement;
    fireEvent.pointerDown(stage, { clientX: 180, clientY: 40 });
    fireEvent.pointerUp(stage, { clientX: 180, clientY: 200 });
    expect(screen.getByRole("dialog", { name: "Photo 1 of 3" })).toBeInTheDocument();
    fireEvent.pointerDown(stage, { clientX: 200, clientY: 200 });
    fireEvent.pointerUp(stage, { clientX: 40, clientY: 210 });
    expect(screen.getByRole("dialog", { name: "Photo 2 of 3" })).toBeInTheDocument();
    expect(onSheet).not.toHaveBeenCalled();
  });
});

describe("the QR dialog", () => {
  it("locks the page, traps Tab, and returns focus when the backdrop, Escape or Back closes it", () => {
    render(React.createElement(QrHost));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "mv2-qr-title");
    expect(screen.getByRole("button", { name: "Close QR code" })).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(root.inert).toBe(true);
    expect(root.contains(document.activeElement)).toBe(false);

    const save = screen.getByRole("button", { name: "Save image" });
    const close = screen.getByRole("button", { name: "Close QR code" });
    fireEvent.keyDown(close, { key: "Tab" });
    expect(save).toHaveFocus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    save.dispatchEvent(forward);
    // Save is not the last stop, so Tab is left to the browser. jsdom does not move focus.
    expect(forward.defaultPrevented).toBe(false);
    fireEvent.keyDown(save, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
    const leave = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    close.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    expect(save).toHaveFocus();

    fireEvent.click(document.querySelector("[data-mv2='qr-card']") as HTMLElement);
    expect(document.querySelector("[data-mv2='qr']")).not.toBeNull();
    fireEvent.click(document.querySelector("[data-mv2='qr']") as HTMLElement);
    expect(document.querySelector("[data-mv2='qr']")).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(root.inert).toBe(false);
  });

  it("closes on Escape without the key reaching a listener behind it, and on the back guard", () => {
    const bubble = vi.fn();
    document.addEventListener("keydown", bubble);
    const { unmount } = render(React.createElement(QrHost));
    fireEvent.keyDown(screen.getByRole("heading", { name: "QR code for Fixture Fellowship" }), { key: "Escape" });
    expect(document.querySelector("[data-mv2='qr']")).toBeNull();
    expect(bubble).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
    document.removeEventListener("keydown", bubble);

    render(React.createElement(QrHost));
    expect(back).not.toBeNull();
    act(() => {
      back!.close();
    });
    expect(document.querySelector("[data-mv2='qr']")).toBeNull();
    expect(opener).toHaveFocus();
    expect(root.inert).toBe(false);
    unmount();
  });
});

describe("the photo viewer", () => {
  it("locks the page, wraps Tab around its controls, and returns focus on Escape", () => {
    const bubble = vi.fn();
    document.addEventListener("keydown", bubble);
    render(React.createElement(ViewerHost));
    const close = screen.getByRole("button", { name: "Close photo" });
    const prev = screen.getByRole("button", { name: "Previous photo" });
    const next = screen.getByRole("button", { name: "Next photo" });
    expect(close).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(root.inert).toBe(true);

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(next).toHaveFocus();
    fireEvent.keyDown(next, { key: "Tab" });
    expect(close).toHaveFocus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    close.dispatchEvent(forward);
    // Close is the first of three, so Tab is left to the browser. The middle stop is too.
    expect(forward.defaultPrevented).toBe(false);
    prev.focus();
    const mid = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    prev.dispatchEvent(mid);
    expect(mid.defaultPrevented).toBe(false);
    bubble.mockClear();

    fireEvent.keyDown(next, { key: "Escape" });
    expect(document.querySelector("[data-mv2='viewer']")).toBeNull();
    expect(bubble).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(root.inert).toBe(false);
    document.removeEventListener("keydown", bubble);
  });
});

describe("nested dialogs", () => {
  it("keeps #root inert and the page locked until the last one closes, in either order", () => {
    const api = (window as unknown as { MapV2: MapV2 }).MapV2;
    const box = document.createElement("div");
    const inner = document.createElement("button");
    inner.textContent = "inside";
    box.appendChild(inner);
    document.body.appendChild(box);
    const unlockOuter = api.lockBehind();
    const unlockInner = api.lockBehind();
    expect(root.inert).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    unlockOuter();
    expect(root.inert).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    unlockInner();
    expect(root.inert).toBe(false);
    expect(document.documentElement.style.overflow).toBe("scroll");

    const again = api.lockBehind();
    const nested = api.lockBehind();
    nested();
    expect(root.inert).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    again();
    expect(root.inert).toBe(false);
    expect(document.documentElement.style.overflow).toBe("scroll");
    box.remove();
  });

  it("keeps the page locked when the viewer closes and the QR dialog is still open", () => {
    function Both() {
      const [qr, setQr] = React.useState(true);
      const [viewer, setViewer] = React.useState(true);
      return React.createElement(
        React.Fragment,
        null,
        qr && React.createElement(Qr.Dialog, {
          url: QR_URL, name: "Fixture Fellowship", slug: "fixture-fellowship", strings: qrStrings,
          returnFocus: opener, onClose: () => setQr(false),
        }),
        viewer && React.createElement(Gallery.Viewer, {
          images, index: 0, strings: galleryStrings, returnFocus: opener,
          onClose: () => setViewer(false), onIndex: () => {},
        }),
      );
    }
    render(React.createElement(Both));
    expect(root.inert).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Close photo" }));
    expect(document.querySelector("[data-mv2='viewer']")).toBeNull();
    expect(document.querySelector("[data-mv2='qr']")).not.toBeNull();
    expect(root.inert).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Close QR code" }));
    expect(document.querySelector("[data-mv2='qr']")).toBeNull();
    expect(root.inert).toBe(false);
    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(opener).toHaveFocus();
  });

  it("wraps Tab inside the dialog that opened last", () => {
    const api = (window as unknown as { MapV2: MapV2 }).MapV2;
    const outer = document.createElement("div");
    const outerBtn = document.createElement("button");
    outerBtn.textContent = "outer";
    outer.appendChild(outerBtn);
    const inner = document.createElement("div");
    const innerBtn = document.createElement("button");
    innerBtn.textContent = "inner";
    inner.appendChild(innerBtn);
    document.body.append(outer, inner);
    const releaseOuter = api.trapFocus(outer);
    const releaseInner = api.trapFocus(inner);
    innerBtn.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    innerBtn.dispatchEvent(tab);
    expect(innerBtn).toHaveFocus();
    expect(tab.defaultPrevented).toBe(true);
    releaseInner();
    outerBtn.focus();
    const tabOuter = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    outerBtn.dispatchEvent(tabOuter);
    expect(outerBtn).toHaveFocus();
    releaseOuter();
    outer.remove();
    inner.remove();
  });
});
