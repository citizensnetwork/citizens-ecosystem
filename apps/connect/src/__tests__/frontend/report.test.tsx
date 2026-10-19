/**
 * Report dialog (issue #160). The real `CCReport.Dialog` and `CCReport.Action`,
 * mounted with React in jsdom. Pins the reasons, the disabled send, a refused
 * double submit, the 429 and generic errors, the success toast, the focus trap,
 * Escape, the backdrop, the back guard, focus return, the guest prompt, and
 * hiding the button on one's own content.
 */
import React from "react";
import ReactDOM from "react-dom";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type DialogProps = {
  targetType: string;
  targetId: string;
  strings?: Record<string, unknown>;
  onClose: () => void;
  onSent?: () => void;
  returnFocus?: HTMLElement | null;
  submit?: (path: string, opts: { method: string; body: string }) => Promise<{ ok: boolean; status: number }>;
};
type ActionProps = {
  targetType: string;
  targetId: string;
  ownerId?: string | null;
  variant?: string;
  strings?: Record<string, unknown>;
};
type Api = {
  Action: React.ComponentType<ActionProps>;
  Dialog: React.ComponentType<DialogProps>;
  REASONS: string[];
  STR: {
    title: (noun: string) => string;
    counter: (n: number) => string;
    reasons: Record<string, string>;
    thanks: string;
    rate: string;
    fail: string;
    [key: string]: unknown;
  };
  signedIn: (app: { realUser?: { id: string } | null; authed?: boolean } | null) => boolean;
};

let api: Api;
let back: { close: () => void } | null = null;
const showSignIn = vi.fn();
const toast = vi.fn();

function load(file: string) {
  const src = readFileSync(join(process.cwd(), "src/frontend/app", file), "utf8");
  new Function("window", "React", "document", src)(window, React, document);
}

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  (globalThis as unknown as { ReactDOM: typeof ReactDOM }).ReactDOM = ReactDOM;
  function Icon({ name, size }: { name: string; size: number }) {
    return React.createElement("svg", { "data-icon": name, width: size, height: size });
  }
  w.Icon = Icon;
  function useBackGuard(active: boolean, onBack: () => void) {
    React.useEffect(() => {
      if (!active) { back = null; return undefined; }
      back = { close: onBack };
      return () => { back = null; };
    });
  }
  w.useBackGuard = useBackGuard;
  w.CC_AUTH = null;
  w.useApp = () => ({ realUser: null, authed: true, showSignIn, toast });
  load("report.jsx");
  api = (window as unknown as { CCReport: Api }).CCReport;
});

const EVENT = "0f8fad5b-d9cb-469f-a165-70867728950e";

let root: HTMLDivElement;
let opener: HTMLButtonElement;

beforeEach(() => {
  showSignIn.mockClear();
  toast.mockClear();
  (window as unknown as { CC_AUTH: null }).CC_AUTH = null;
  (window as unknown as { useApp: () => unknown }).useApp = () => ({ realUser: null, authed: true, showSignIn, toast });
  root = document.createElement("div");
  root.id = "root";
  opener = document.createElement("button");
  opener.textContent = "Listing";
  root.appendChild(opener);
  document.body.appendChild(root);
  document.documentElement.style.overflow = "scroll";
  opener.focus();
  back = null;
});
afterEach(() => {
  cleanup();
  root.remove();
  document.querySelectorAll("[data-mv2='report']").forEach((n) => n.remove());
  document.documentElement.style.overflow = "";
  back = null;
});

function Host(props: Partial<DialogProps> & { open?: boolean }) {
  const [open, setOpen] = React.useState(props.open !== false);
  if (!open) return null;
  return React.createElement(api.Dialog, {
    targetType: props.targetType || "event",
    targetId: props.targetId || EVENT,
    returnFocus: opener,
    submit: props.submit,
    onSent: props.onSent,
    onClose: () => { setOpen(false); if (props.onClose) props.onClose(); },
  });
}

describe("reasons and copy", () => {
  it("offers the same reasons as POST /api/reports, in that order", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/reports/route.ts"), "utf8");
    const start = src.indexOf("const REASONS = [");
    const block = src.slice(start, src.indexOf("] as const", start));
    const reasons = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(reasons).toEqual([
      "spam", "harassment", "hate_speech", "sexual_content", "violence",
      "misinformation", "impersonation", "illegal", "other",
    ]);
    expect(api.REASONS).toEqual(reasons);
  });

  it("keeps the map strings equal to the dialog strings", () => {
    const strings = loadFrontend("map-v2-strings.jsx").MapV2Strings as { report: Api["STR"] };
    const flat = (node: unknown): unknown => {
      if (typeof node === "function") return (node as (a: unknown) => unknown)("event");
      if (Array.isArray(node)) return node.map(flat);
      if (node && typeof node === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = flat(v);
        return out;
      }
      return node;
    };
    expect(flat(api.STR)).toEqual(flat(strings.report));
    expect(api.STR.counter(3)).toBe("3/1000");
    expect(api.STR.title("note")).toBe("Report this note");
    expect(strings.report.counter(3)).toBe("3/1000");
  });
});

describe("the dialog", () => {
  it("opens on the first reason, names itself, and locks the page behind it", () => {
    render(React.createElement(Host));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "cc-report-title");
    expect(screen.getByRole("heading", { name: "Report this event" })).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: "Why are you reporting it?" });
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(api.REASONS.length);
    expect(group).toContainElement(radios[0]);
    expect(radios[0]).toHaveFocus();
    expect(screen.getByRole("button", { name: "Send report" })).toBeDisabled();
    expect(screen.getByText("0/1000")).toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(root.inert).toBe(true);
  });

  it("keeps send disabled until a reason is chosen, then posts once", async () => {
    const submit = vi.fn(async () => ({ ok: true, status: 201 }));
    const onSent = vi.fn();
    render(React.createElement(Host, { submit, onSent }));
    const send = screen.getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Saw this twice" } });
    expect(screen.getByText("14/1000")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send report" })); });
    expect(submit).toHaveBeenCalledTimes(1);
    const [path, opts] = submit.mock.calls[0] as unknown as [string, { body: string }];
    expect(path).toBe("/api/reports");
    expect(JSON.parse(opts.body)).toEqual({
      target_type: "event", target_id: EVENT, reason: "spam", body: "Saw this twice",
    });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-report-open='event']")).not.toBeNull();
  });

  it("refuses a second submit while the first is still in flight", async () => {
    let resolve: (v: { ok: boolean; status: number }) => void = () => {};
    const submit = vi.fn(() => new Promise<{ ok: boolean; status: number }>((r) => { resolve = r; }));
    render(React.createElement(Host, { submit }));
    fireEvent.click(screen.getByRole("radio", { name: "Harassment" }));
    const send = screen.getByRole("button", { name: "Send report" });
    await act(async () => {
      fireEvent.click(send);
      fireEvent.click(send);
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    await act(async () => { resolve({ ok: true, status: 201 }); });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("shows the rate-limit sentence on 429 and stays open", async () => {
    const submit = vi.fn(async () => ({ ok: false, status: 429 }));
    render(React.createElement(Host, { submit }));
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send report" })); });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(api.STR.rate);
    expect(document.querySelector("[data-mv2='report']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
  });

  it("shows the generic sentence for any other failure, including 409, and not the server text", async () => {
    const submit = vi.fn(async () => ({ ok: false, status: 409 }));
    render(React.createElement(Host, { submit }));
    fireEvent.click(screen.getByRole("radio", { name: "Something else" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send report" })); });
    expect(screen.getByRole("alert")).toHaveTextContent(api.STR.fail);
    expect(screen.queryByText(/already reported/i)).toBeNull();
    submit.mockRejectedValueOnce(new Error("secret server detail"));
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send report" })); });
    expect(screen.getByRole("alert")).toHaveTextContent(api.STR.fail);
    expect(screen.queryByText(/secret server/i)).toBeNull();
  });

  it("closes from Escape, the backdrop, the back guard and Cancel, and returns focus", () => {
    const { unmount } = render(React.createElement(Host));
    fireEvent.click(screen.getByRole("dialog"));
    expect(document.querySelector("[data-mv2='report']")).not.toBeNull();
    const scrim = document.querySelector("[data-mv2='report']") as HTMLElement;
    fireEvent.pointerDown(scrim, { clientX: 4, clientY: 4 });
    fireEvent.pointerMove(scrim, { clientX: 40, clientY: 4 });
    fireEvent.click(scrim);
    expect(document.querySelector("[data-mv2='report']")).not.toBeNull();
    fireEvent.pointerDown(scrim, { clientX: 4, clientY: 4 });
    fireEvent.click(scrim);
    expect(document.querySelector("[data-mv2='report']")).toBeNull();
    expect(opener).toHaveFocus();
    expect(root.inert).toBe(false);
    unmount();

    render(React.createElement(Host));
    const bubble = vi.fn();
    document.addEventListener("keydown", bubble);
    fireEvent.keyDown(screen.getByRole("heading", { name: "Report this event" }), { key: "Escape" });
    expect(document.querySelector("[data-mv2='report']")).toBeNull();
    expect(bubble).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
    document.removeEventListener("keydown", bubble);

    render(React.createElement(Host));
    expect(back).not.toBeNull();
    act(() => { back!.close(); });
    expect(document.querySelector("[data-mv2='report']")).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("scroll");

    render(React.createElement(Host));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.querySelector("[data-mv2='report']")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab inside the card", () => {
    render(React.createElement(Host));
    const close = screen.getByRole("button", { name: "Close report" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(screen.getAllByRole("radio")[0]).toHaveFocus();
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab" });
    expect(close).toHaveFocus();
    expect(root.contains(document.activeElement)).toBe(false);
  });
});

describe("the button", () => {
  it("sends a guest to sign in and does not open the dialog", () => {
    (window as unknown as { useApp: () => unknown }).useApp = () => ({ realUser: null, authed: false, showSignIn, toast });
    expect(api.signedIn({ realUser: null, authed: false })).toBe(false);
    expect(api.signedIn({ realUser: null, authed: true })).toBe(true);
    render(React.createElement(api.Action, { targetType: "event", targetId: EVENT, ownerId: "org-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(showSignIn).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-mv2='report']")).toBeNull();
  });

  it("hides the button on the owner's own content and when there is no target", () => {
    (window as unknown as { useApp: () => unknown }).useApp = () => ({ realUser: { id: "me" }, authed: true, showSignIn, toast });
    const { rerender } = render(React.createElement(api.Action, { targetType: "user", targetId: "me", ownerId: "me" }));
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    rerender(React.createElement(api.Action, { targetType: "event", targetId: "", ownerId: null }));
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    rerender(React.createElement(api.Action, { targetType: "event", targetId: EVENT, ownerId: "someone-else" }));
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
  });

  it("toasts the exact thanks line and closes after a successful send", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201 }));
    (window as unknown as { authedFetch: typeof fetchMock }).authedFetch = fetchMock;
    render(React.createElement(api.Action, { targetType: "place", targetId: EVENT, ownerId: "org-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("radio", { name: "Misinformation" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send report" })); });
    expect(toast).toHaveBeenCalledWith(api.STR.thanks, "gold");
    expect(api.STR.thanks).toBe("Thanks. An admin will look at it.");
    expect(document.querySelector("[data-mv2='report']")).toBeNull();
  });

  it("opens the moment menu, and Escape closes only the menu", () => {
    render(React.createElement(api.Action, { variant: "moment", targetType: "moment", targetId: EVENT, ownerId: "org-1" }));
    const more = screen.getByRole("button", { name: "More options" });
    fireEvent.click(more);
    expect(screen.getByRole("menuitem", { name: "Report" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Report" }), { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "Report" })).toBeNull();
    expect(document.querySelector("[data-mv2='report']")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report" }));
    expect(screen.getByRole("heading", { name: "Report this note" })).toBeInTheDocument();
  });
});

describe("where the button is wired", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("loads report.jsx after ui.jsx, in the page and the build", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    expect(html.indexOf("app/ui.jsx")).toBeLessThan(html.indexOf("app/report.jsx"));
    expect(html.indexOf("app/report.jsx")).toBeLessThan(html.indexOf("app/auth.jsx"));
    expect(build.indexOf("'ui.jsx'")).toBeLessThan(build.indexOf("'report.jsx'"));
    expect(build.indexOf("'report.jsx'")).toBeLessThan(build.indexOf("'auth.jsx'"));
    expect(html).toContain("app/report.jsx?v=20261019d");
  });

  it("places the button on the sheet, the event, the place, the profile, a moment and a message", () => {
    const sheet = read("src/frontend/app/map-v2-sheet.jsx");
    expect(sheet.indexOf("qrAction")).toBeLessThan(sheet.indexOf("reportAction"));
    expect(sheet.indexOf("reportAction,")).toBeLessThan(sheet.indexOf("data-mv2': 'view-full'"));
    expect(sheet).toContain("variant: 'sheet'");
    expect(sheet).toContain("variant: 'moment'");
    expect(sheet).toContain("targetType: 'moment'");
    const profiles = read("src/frontend/app/profiles.jsx");
    expect(profiles).toContain("targetType: 'event'");
    expect(profiles).toContain("targetType: 'place'");
    expect(profiles).toContain("targetType: 'user'");
    const messages = read("src/frontend/app/messages.jsx");
    expect(messages).toContain("variant: 'overflow'");
    expect(messages).toContain("targetType: 'conversation'");
    expect(messages).toContain("m.from === 'me'");
  });
});
