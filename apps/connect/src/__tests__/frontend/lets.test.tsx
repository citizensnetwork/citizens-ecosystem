/**
 * "Let's…" gatherings (issue #313). Starters preset a category, the citizen cap
 * skips a known starter and still blocks an ordinary event, and the page lists
 * only public upcoming Let's rows. The database rule is migration 202.
 */
import React from "react";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Starter = { id: string; label: string; category: string; icon: string };
type LetsApi = {
  STARTERS: Starter[];
  starterById: (id: unknown) => Starter | null;
  communityInsertBlocked: (input: { role?: string; letsStarter?: string; recentNonLets?: number; limit?: number }) => boolean;
  upcomingLets: (events: unknown[], now?: number) => { id: string; title: string }[];
  fromApiRow: (row: unknown) => { id: string; letsStarter: string } | null;
  mergeActivities: (local: { id: string; title?: string }[], remote: { id: string; title?: string }[]) => { id: string; title?: string }[];
  letsFeedPath: (now?: Date) => string;
};

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const load = (file: string) => new Function("window", "React", "document", read("src/frontend/app/" + file))(window, React, document);

let L: LetsApi;
const showSignIn = vi.fn();
const openCreate = vi.fn();
const go = vi.fn();

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  w.Icon = function Icon({ name }: { name: string }) {
    return React.createElement("svg", { "data-icon": name });
  };
  w.MapV2Explore = {
    useNarrow: () => false,
    groupOf: (item: { category?: string }) => (item && item.category === "worship-prayer" ? "worship" : ""),
  };
  ["data.jsx", "lets-lib.jsx", "map-v2-strings.jsx", "lets.jsx"].forEach(load);
  L = w.LETS as LetsApi;
});

afterEach(() => {
  cleanup();
  showSignIn.mockClear();
  openCreate.mockClear();
  go.mockClear();
  vi.unstubAllGlobals();
});

function app(extra: Record<string, unknown> = {}) {
  (window as unknown as Record<string, unknown>).useApp = () => ({
    authed: true,
    events: [],
    showSignIn,
    openCreate,
    go,
    ...extra,
  });
}

describe("starters", () => {
  it("has the eight gatherings, each presetting an existing event category", () => {
    const data = loadFrontendData();
    expect(L.STARTERS.map((s) => s.id)).toEqual([
      "evangelise", "run", "pray", "worship", "social", "clean-up", "coffee", "flashmob",
    ]);
    for (const s of L.STARTERS) {
      expect(s.label.startsWith("Let's "), s.id).toBe(true);
      expect(data.EVENT_CATEGORIES.some((c: { id: string }) => c.id === s.category), s.category).toBe(true);
    }
    expect(L.starterById("pray")).toMatchObject({ category: "worship-prayer" });
    expect(L.starterById("nope")).toBeNull();
    expect(L.starterById("")).toBeNull();
  });
});

describe("the citizen cap", () => {
  const blocked = (over: Record<string, unknown>) =>
    L.communityInsertBlocked({ role: "citizen", recentNonLets: 1, limit: 1, ...over });

  it("blocks a second ordinary event and lets a Let's event through", () => {
    expect(L.communityInsertBlocked({ role: "citizen", recentNonLets: 0, limit: 1 })).toBe(false);
    expect(blocked({})).toBe(true);
    expect(blocked({ letsStarter: "pray", recentNonLets: 5 })).toBe(false);
    expect(blocked({ letsStarter: "flashmob" })).toBe(false);
  });

  it("does not treat an unknown marker as a Let's event, and does not cap a contributor", () => {
    expect(blocked({ letsStarter: "spam" })).toBe(true);
    expect(blocked({ letsStarter: "" })).toBe(true);
    expect(L.communityInsertBlocked({ role: "contributor", recentNonLets: 9, limit: 1 })).toBe(false);
    expect(L.communityInsertBlocked({ role: "admin", recentNonLets: 9 })).toBe(false);
    expect(L.communityInsertBlocked({})).toBe(false);
  });

  it("ignores Let's rows in the count the caller passes (they are not recentNonLets)", () => {
    expect(L.communityInsertBlocked({ role: "citizen", recentNonLets: 0, limit: 1, letsStarter: "" })).toBe(false);
  });
});

describe("the list", () => {
  const NOW = Date.UTC(2026, 9, 10, 8, 0, 0);
  const event = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: id,
    category: "worship-prayer",
    letsStarter: "pray",
    status: "published",
    visibility: "public",
    startsAt: new Date(NOW + 86400000).toISOString(),
    location: "Church Square",
    ...extra,
  });

  it("keeps public upcoming Let's rows and drops ordinary, private, cancelled and finished ones", () => {
    const rows = L.upcomingLets([
      event("soon"),
      event("ordinary", { letsStarter: "" }),
      event("private", { visibility: "private" }),
      event("cancelled", { status: "cancelled" }),
      event("done", { startsAt: new Date(NOW - 3 * 86400000).toISOString(), endsAt: new Date(NOW - 86400000).toISOString() }),
    ], NOW);
    expect(rows.map((r) => r.id)).toEqual(["soon"]);
  });

  it("reads a feed row only when the starter is known", () => {
    expect(L.fromApiRow({ id: "a", title: "Pray", lets_starter: "pray", date: "2026-10-12T09:00:00.000Z", category: "worship-prayer" })?.letsStarter).toBe("pray");
    expect(L.fromApiRow({ id: "b", lets_starter: "nope" })).toBeNull();
    expect(L.fromApiRow(null)).toBeNull();
  });

  it("lets a just-created local row stay beside the feed, with the feed winning on the same id", () => {
    const merged = L.mergeActivities(
      [{ id: "local", title: "Local" }, { id: "both", title: "Old" }],
      [{ id: "both", title: "Fresh" }, { id: "remote", title: "Remote" }],
    );
    expect(merged.map((r) => r.id)).toEqual(["both", "local", "remote"]);
    expect(merged[0]).toMatchObject({ title: "Fresh" });
  });

  it("asks the events feed for Let's rows only", () => {
    const url = new URL(L.letsFeedPath(new Date(2026, 9, 10, 15, 0)), "https://x.example");
    expect(url.pathname).toBe("/api/v1/events");
    expect(url.searchParams.get("lets")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("from")).toBeTruthy();
  });
});

describe("the page", () => {
  it("opens creation for a signed-in citizen and asks a guest to sign in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    app({ authed: false });
    render(React.createElement((window as unknown as { LetsPage: React.ComponentType }).LetsPage));
    fireEvent.click(screen.getByRole("button", { name: "Let's Pray" }));
    expect(showSignIn).toHaveBeenCalledTimes(1);
    expect(openCreate).not.toHaveBeenCalled();
    cleanup();

    app({ authed: true });
    render(React.createElement((window as unknown as { LetsPage: React.ComponentType }).LetsPage));
    fireEvent.click(screen.getAllByRole("button", { name: "Let's Evangelise" })[0]);
    expect(openCreate).toHaveBeenCalledWith("event", null, { letsStarter: "evangelise" });
    await screen.findByText("No gatherings yet. Start one above.");
  });

  it("lists a Let's event, hides an ordinary one, and links to Kingdom Projects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          id: "11111111-1111-4111-8111-111111111111",
          title: "A very long gathering name that should stay on two lines",
          lets_starter: "clean-up",
          category: "community-upliftment",
          date: "2026-12-01T09:00:00.000Z",
          location: "Church Square, Pretoria",
        }],
      }),
    }));
    app({
      events: [{
        id: "ordinary",
        title: "Sunday service",
        category: "church-services",
        letsStarter: "",
        status: "published",
        visibility: "public",
        startsAt: "2026-12-01T09:00:00.000Z",
      }],
    });
    render(React.createElement((window as unknown as { LetsPage: React.ComponentType }).LetsPage));
    const card = await screen.findByRole("button", { name: /A very long gathering name/ });
    expect(card.getAttribute("data-mv2")).toBe("lets-card");
    expect(screen.queryByText("Sunday service")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kingdom Projects" }));
    expect(go).toHaveBeenCalledWith("community");
  });

  it("shows an error with a retry when the feed fails and nothing is loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    app();
    render(React.createElement((window as unknown as { LetsPage: React.ComponentType }).LetsPage));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load gatherings.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("is wired into the nav, the shell and the build, and events still carry Report", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    const shell = read("src/frontend/app/shell.jsx");
    expect(html.indexOf('src="app/lets-lib.jsx')).toBeGreaterThan(html.indexOf('src="app/data.jsx'));
    expect(html.indexOf('src="app/lets-lib.jsx')).toBeLessThan(html.indexOf('src="app/store.jsx'));
    expect(html.indexOf('src="app/lets.jsx')).toBeLessThan(html.indexOf('src="app/shell.jsx'));
    expect(build.indexOf("'lets-lib.jsx'")).toBeGreaterThan(build.indexOf("'data.jsx'"));
    expect(build.indexOf("'lets.jsx'")).toBeLessThan(build.indexOf("'shell.jsx'"));
    expect(shell).toContain("page: 'lets'");
    expect(shell).not.toContain("label: 'Kingdom Projects'");
    expect(shell).toContain("case 'lets'");
    expect(shell).toContain("case 'community'");
    const profiles = read("src/frontend/app/profiles.jsx");
    expect(profiles).toContain("targetType: 'event'");
    expect(profiles).not.toContain("letsStarter");
  });
});

function loadFrontendData(): { EVENT_CATEGORIES: { id: string }[] } {
  return (window as unknown as { DATA: { EVENT_CATEGORIES: { id: string }[] } }).DATA;
}

describe("styles use tokens", () => {
  it("paints a selected starter with the accent token and clamps a long title", () => {
    const css = read("src/frontend/assets/map-v2.css");
    const block = css.slice(css.indexOf("/* ── 4o."));
    expect(block).toContain("background: var(--accent);");
    expect(block).toContain("color: var(--accent-contrast);");
    expect(block).toContain("color: var(--accent-ink);");
    expect(block).toContain("-webkit-line-clamp: 2");
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
