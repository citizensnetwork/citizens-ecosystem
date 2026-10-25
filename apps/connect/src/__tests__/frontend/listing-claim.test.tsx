/**
 * The owner's confirm screen for a listing made for them (C10, issue #159). The real `CCListingClaim.Dialog`
 * and `CCListingClaim.Host`, mounted with React in jsdom. Pins what the person is told, that only Confirm runs the
 * claim, that "Not me" and "Decide later" never do, that one tap sends one request, the failure messages,
 * Escape / back / focus / page lock, and how the store hands the screen its claim.
 */
import React from "react";
import ReactDOM from "react-dom";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Claim = {
  found: true;
  mode: "attach" | "self";
  eligible?: boolean;
  name?: string;
  slug?: string | null;
  category?: string | null;
  logo_url?: string | null;
};
type Reply = { ok: boolean; status: number; json?: () => Promise<unknown> };
type DialogProps = {
  claim: Claim;
  onLater: () => void;
  onDone: (kind: "confirm" | "decline", body: Record<string, unknown>) => void;
  submit?: (path: string, opts: { method: string }) => Promise<Reply>;
};
type Api = { Dialog: React.ComponentType<DialogProps>; Host: React.ComponentType; STR: Record<string, unknown> & { attachTitle: (n: string) => string; selfTitle: (n: string) => string } };

let api: Api;
let back: { close: () => void } | null = null;
const toast = vi.fn();
const resetNav = vi.fn();
const clearPendingListing = vi.fn();
const snoozePendingListing = vi.fn();
let app: Record<string, unknown>;

function load(file: string) {
  const src = readFileSync(join(process.cwd(), "src/frontend/app", file), "utf8");
  new Function("window", "React", "document", "ReactDOM", src)(window, React, document, ReactDOM);
}

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  (globalThis as unknown as { ReactDOM: typeof ReactDOM }).ReactDOM = ReactDOM;
  w.Icon = function Icon({ name, size }: { name: string; size: number }) {
    return React.createElement("svg", { "data-icon": name, width: size, height: size });
  };
  w.useBackGuard = function useBackGuard(active: boolean, onBack: () => void) {
    React.useEffect(() => {
      if (!active) { back = null; return undefined; }
      back = { close: onBack };
      return () => { back = null; };
    });
  };
  w.DATA = { getContributorType: (id: string) => (id === "outreach-missions" ? { id, name: "Outreach / Mission" } : undefined) };
  w.useApp = () => app;
  load("listing-claim.jsx");
  api = (window as unknown as { CCListingClaim: Api }).CCListingClaim;
});

const ATTACH: Claim = { found: true, mode: "attach", eligible: true, name: "Grace Outreach", slug: "grace-outreach", category: "outreach-missions", logo_url: null };
const SELF: Claim = { ...ATTACH, mode: "self" };
const ok = (body: Record<string, unknown> = {}): Reply => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number): Reply => ({ ok: false, status, json: async () => ({}) });

let root: HTMLDivElement;
beforeEach(() => {
  toast.mockClear();
  resetNav.mockClear();
  clearPendingListing.mockClear();
  snoozePendingListing.mockClear();
  app = { realUser: { id: "user-1" }, toast, resetNav, clearPendingListing, snoozePendingListing, pendingListing: null };
  root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  document.documentElement.style.overflow = "scroll";
  back = null;
});
afterEach(() => {
  cleanup();
  root.remove();
  document.querySelectorAll("[data-mv2='claim']").forEach((n) => n.remove());
  document.documentElement.style.overflow = "";
  back = null;
});

function open(claim: Claim, extra: Partial<DialogProps> = {}) {
  const onLater = vi.fn();
  const onDone = vi.fn();
  const submit = vi.fn(async () => ok());
  render(React.createElement(api.Dialog, { claim, onLater, onDone, submit, ...extra }));
  return { onLater, onDone, submit: (extra.submit ?? submit) as ReturnType<typeof vi.fn> };
}

describe("what the person is asked", () => {
  it("attach: 'Attach X to your account?', with the listing shown, Confirm and Not me", () => {
    open(ATTACH);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Attach “Grace Outreach” to your account?" })).toBeInTheDocument();
    expect(screen.getByText("Outreach / Mission")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the listing" })).toHaveAttribute("href", "/c/grace-outreach");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Not me" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Decide later" })).toBeEnabled();
    expect(screen.getByText(/Nothing on your account changes unless you confirm/)).toBeInTheDocument();
  });

  it("self: 'Is X your listing?'", () => {
    open(SELF);
    expect(screen.getByRole("heading", { name: "Is “Grace Outreach” your listing?" })).toBeInTheDocument();
    expect(screen.getByText(/you can manage it from your Contributor Portal/)).toBeInTheDocument();
    expect(document.querySelector("[data-claim-mode='self']")).not.toBeNull();
  });

  it("explains what Not me does, in plain words", () => {
    open(ATTACH);
    expect(screen.getByText("Not me hides the listing straight away and lets our team know. Nothing on your account changes.")).toBeInTheDocument();
  });

  it("a person who already has a listing cannot attach another: no Confirm, only Not me and Decide later", () => {
    open({ ...ATTACH, eligible: false });
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.getByRole("button", { name: "Not me" })).toBeEnabled();
    expect(screen.getByText(/already have a listing on this account/)).toBeInTheDocument();
  });

  it("shows an unusual name as text, never as markup", () => {
    open({ ...ATTACH, name: '<img src=x onerror="alert(1)"> Church' });
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)"> Church')).toBeInTheDocument();
  });

  it("a listing with no name or slug still renders without a broken link", () => {
    open({ ...ATTACH, name: "", slug: null });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("heading").textContent).toContain("this listing");
  });
});

describe("only Confirm runs the claim", () => {
  it("Confirm posts to /api/contributor/claim once and reports it", async () => {
    const submit = vi.fn(async () => ok({ success: true, mode: "attach", slug: "grace-outreach" }));
    const { onDone } = open(ATTACH, { submit });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm" })); });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("/api/contributor/claim", { method: "POST" });
    expect(onDone).toHaveBeenCalledWith("confirm", { success: true, mode: "attach", slug: "grace-outreach" });
  });

  it("Not me posts to the decline route, never the claim", async () => {
    const submit = vi.fn(async () => ok({ success: true }));
    const { onDone } = open(ATTACH, { submit });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Not me" })); });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("/api/contributor/claim/decline", { method: "POST" });
    expect(onDone).toHaveBeenCalledWith("decline", { success: true });
  });

  it("Decide later sends nothing at all", () => {
    const { onLater, onDone, submit } = open(ATTACH);
    fireEvent.click(screen.getByRole("button", { name: "Decide later" }));
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("Escape, the back button and nothing else close it without deciding; none of them sends a request", () => {
    const { onLater, submit } = open(ATTACH);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(back).not.toBeNull();
    act(() => back!.close());
    expect(onLater).toHaveBeenCalledTimes(2);
    expect(submit).not.toHaveBeenCalled();
  });

  it("tapping the backdrop does NOT decide anything (a stray tap must never confirm or refuse)", () => {
    const { onLater, onDone, submit } = open(ATTACH);
    fireEvent.click(document.querySelector("[data-mv2='claim']")!);
    expect(onDone).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(onLater).not.toHaveBeenCalled();
  });

  it("one tap, one request: a second tap while the first is in flight is ignored, and both buttons are disabled", async () => {
    let resolve: (v: Reply) => void = () => {};
    const submit = vi.fn(() => new Promise<Reply>((r) => { resolve = r; }));
    open(ATTACH, { submit });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: "Not me" }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not me" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decide later" })).toBeDisabled();
    await act(async () => { resolve(ok()); });
  });
});

describe("when it goes wrong", () => {
  const cases: Array<[number, RegExp]> = [
    [404, /no longer waiting for you/],
    [403, /could not confirm your email address yet/],
    [429, /Too many tries/],
    [500, /Something went wrong/],
  ];
  it.each(cases)("a %i keeps the screen open with a calm message and lets them try again", async (status, words) => {
    const submit = vi.fn(async () => fail(status));
    const { onDone } = open(ATTACH, { submit });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm" })); });
    expect(screen.getByRole("alert").textContent).toMatch(words);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm" })); });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("a network failure is the same calm message", async () => {
    const submit = vi.fn(async () => { throw new Error("offline"); });
    open(ATTACH, { submit });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Not me" })); });
    expect(screen.getByRole("alert").textContent).toMatch(/Something went wrong/);
  });

  it("the server's own sentence is never shown", async () => {
    const submit = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "SECRET_SERVER_TEXT" }) }));
    open(ATTACH, { submit });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm" })); });
    expect(document.body.textContent).not.toContain("SECRET_SERVER_TEXT");
  });
});

describe("focus and the page behind", () => {
  it("opens on the first button, locks the page, and gives both back on close", () => {
    const { unmount } = render(React.createElement(api.Dialog, { claim: ATTACH, onLater: vi.fn(), onDone: vi.fn() }));
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(root.inert).toBe(true);
    unmount();
    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(root.inert).toBe(false);
  });

  it("with no Confirm (cannot attach) focus starts on Not me", () => {
    open({ ...ATTACH, eligible: false });
    expect(screen.getByRole("button", { name: "Not me" })).toHaveFocus();
  });

  it("traps Tab inside the card, both ways", () => {
    open(ATTACH);
    const buttons = screen.getAllByRole("button");
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(buttons[0] === document.activeElement || screen.getByRole("link", { name: "View the listing" }) === document.activeElement).toBe(true);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });
});

describe("Host (what the app mounts)", () => {
  const mount = () => render(React.createElement(api.Host));

  it("renders nothing when no listing is waiting", () => {
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the dialog for the claim the store found", () => {
    app.pendingListing = ATTACH;
    mount();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Decide later snoozes for this user and nothing else", () => {
    app.pendingListing = ATTACH;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Decide later" }));
    expect(snoozePendingListing).toHaveBeenCalledWith("user-1");
    expect(toast).not.toHaveBeenCalled();
  });

  it("after Not me: clears the screen and says what happened", async () => {
    app.pendingListing = ATTACH;
    const orig = (window as unknown as { authedFetch?: unknown }).authedFetch;
    (window as unknown as { authedFetch: unknown }).authedFetch = vi.fn(async () => ok({ success: true }));
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Not me" })); });
    expect(clearPendingListing).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(api.STR.declined, "gold");
    expect(resetNav).not.toHaveBeenCalled();
    (window as unknown as { authedFetch: unknown }).authedFetch = orig;
  });

  it("after Confirm as the listing's own account: opens their dashboard without a reload", async () => {
    app.pendingListing = SELF;
    const orig = (window as unknown as { authedFetch?: unknown }).authedFetch;
    (window as unknown as { authedFetch: unknown }).authedFetch = vi.fn(async () => ok({ success: true, mode: "self" }));
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm" })); });
    expect(clearPendingListing).toHaveBeenCalled();
    expect(resetNav).toHaveBeenCalledWith("dashboard");
    expect(toast).toHaveBeenCalledWith(api.STR.confirmedSelf, "green");
    (window as unknown as { authedFetch: unknown }).authedFetch = orig;
  });

  it("after Confirm on their own account: a full load into /dashboard (the role changed in the database)", async () => {
    app.pendingListing = ATTACH;
    const orig = (window as unknown as { authedFetch?: unknown }).authedFetch;
    (window as unknown as { authedFetch: unknown }).authedFetch = vi.fn(async () => ok({ success: true, mode: "attach" }));
    const realLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { href: "http://localhost/" } });
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm" })); });
    expect(window.location.href).toBe("/dashboard");
    expect(resetNav).not.toHaveBeenCalled();
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
    (window as unknown as { authedFetch: unknown }).authedFetch = orig;
  });
});

describe("how the store and the page are wired", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("the sign-in bootstrap only ASKS: no claim RPC and no POST to /api/contributor/claim remain in store.jsx", () => {
    const store = read("src/frontend/app/store.jsx");
    expect(store).not.toContain("mark_own_listing_claimed");
    expect(store).not.toContain("landOwnListing");
    expect(store).not.toMatch(/authedFetch\('\/api\/contributor\/claim', \{ method: 'POST'/);
    // the one call to the route is the read-only GET (no options at all)
    expect(store).toContain("authedFetch('/api/contributor/claim')");
    expect(store).toContain("cc_listing_claim_later_v1:");
  });

  it("the account menu's manual button only opens the screen; it no longer claims", () => {
    const shell = read("src/frontend/app/shell.jsx");
    expect(shell).not.toContain("/api/contributor/claim");
    expect(shell).toContain("askAboutListing(realUser.id, true)");
    expect(shell).toContain("window.CCListingClaim.Host");
  });

  it("loads listing-claim.jsx after ui.jsx and before the screens, in the page and the build", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    expect(html.indexOf("app/ui.jsx")).toBeLessThan(html.indexOf("app/listing-claim.jsx"));
    expect(html.indexOf("app/listing-claim.jsx")).toBeLessThan(html.indexOf("app/auth.jsx"));
    expect(build.indexOf("'ui.jsx'")).toBeLessThan(build.indexOf("'listing-claim.jsx'"));
    expect(build.indexOf("'listing-claim.jsx'")).toBeLessThan(build.indexOf("'shell.jsx'"));
    expect(html).toContain('href="assets/listing-claim.css?v=20261021a"');
    expect(html).toContain("app/listing-claim.jsx?v=20261021a");
  });

  it("the stylesheet uses tokens only (no colours or pixel sizes of its own)", () => {
    const css = read("src/frontend/assets/listing-claim.css");
    const body = css.slice(css.indexOf("@keyframes"));
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const px = [...body.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px\b/g)].map((m) => m[1]).filter((n) => n !== "0" && n !== "1");
    expect(px).toEqual([]);
    expect(body).toContain("var(--surface-1)");
    expect(body).toContain("var(--z-viewer)");
  });
});
