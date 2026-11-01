/**
 * C15: a real URL for every screen. `routes.jsx` is the single source of truth
 * for the path table; store.jsx, the server rewrites and the auth return path
 * all lean on it, so its behaviour is pinned here in full: every row of the
 * table round-trips, malformed ids fall back safely, the old /index.html?c=<slug>
 * links still resolve, and the return-path sanitiser can never be talked into
 * leaving the origin.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Nav = { page: string; params: Record<string, unknown> };
type Resolved = { ok: boolean; nav: Nav; canonical: string; legacy: boolean };
type Routes = {
  pathFor: (nav: Nav | null | undefined, ctx?: { slugFor?: (id: string) => string | null }) => string | null;
  navFromPath: (pathname: unknown, search?: string) => Resolved;
  safeReturnPath: (raw: unknown) => string | null;
  accessFor: (nav: Nav) => "public" | "auth" | "contributor" | "admin";
  isEntityRoute: (nav: Nav) => boolean;
  titleFor: (nav: Nav, name?: string) => string;
  isUuid: (v: unknown) => boolean;
  isSlug: (v: unknown) => boolean;
  stripBase: (pathname: unknown, base: string) => string | null;
  withBase: (path: unknown, base: string) => unknown;
  appUrl: (path: string) => string;
  BASE_PATH: string;
  DASHBOARD_TABS: string[];
  ADMIN_TABS: string[];
  PREFIXES: string[];
};

let R: Routes;
beforeAll(() => {
  R = loadFrontend("routes.jsx").CC_ROUTES as Routes;
});

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID2 = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const nav = (page: string, params: Record<string, unknown> = {}): Nav => ({ page, params });

describe("pathFor ↔ navFromPath: every row of the route table", () => {
  const rows: [Nav, string][] = [
    [nav("home"), "/"],
    [nav("kingdom-discovery"), "/discover"],
    [nav("explore"), "/explore"],
    [nav("community"), "/community"],
    [nav("messages"), "/messages"],
    [nav("messages", { convId: ID }), `/messages/${ID}`],
    [nav("notifications"), "/notifications"],
    [nav("settings"), "/settings"],
    [nav("apply"), "/apply"],
    [nav("onboarding"), "/onboarding"],
    [nav("dashboard"), "/dashboard"],
    [nav("dashboard", { tab: "events" }), "/dashboard/events"],
    [nav("dashboard", { tab: "news" }), "/dashboard/news"],
    [nav("dashboard", { tab: "profile" }), "/dashboard/profile"],
    [nav("dashboard", { tab: "messages" }), "/dashboard/messages"],
    [nav("dashboard", { tab: "tools" }), "/dashboard/tools"],
    [nav("admin"), "/admin"],
    [nav("admin", { tab: "contributors" }), "/admin/contributors"],
    [nav("admin", { tab: "overview" }), "/admin/overview"],
    [nav("admin", { tab: "citizens" }), "/admin/citizens"],
    [nav("admin", { tab: "reports" }), "/admin/reports"],
    [nav("event", { id: ID }), `/e/${ID}`],
    [nav("place", { id: ID }), `/p/${ID}`],
    [nav("profile", { slug: "impact-radio" }), "/c/impact-radio"],
    [nav("profile", { id: ID }), `/c/${ID}`],
    [nav("profile"), "/me"],
  ];

  for (const [n, path] of rows) {
    it(`${path}`, () => {
      expect(R.pathFor(n)).toBe(path);
      const back = R.navFromPath(path);
      expect(back.ok).toBe(true);
      expect(back.legacy).toBe(false);
      expect(back.canonical).toBe(path);
      expect(back.nav).toEqual(n);
      // and the path of what we parsed is the path we started with
      expect(R.pathFor(back.nav)).toBe(path);
    });
  }

  it("a Contributor id becomes /c/<slug> when the directory knows the slug", () => {
    expect(R.pathFor(nav("profile", { id: ID }), { slugFor: (id) => (id === ID ? "impact-radio" : null) })).toBe("/c/impact-radio");
    expect(R.pathFor(nav("profile", { id: ID2 }), { slugFor: () => null })).toBe(`/c/${ID2}`);
  });

  it("the default tab has the short URL, and an unknown tab falls back to it", () => {
    expect(R.pathFor(nav("dashboard", { tab: "overview" }))).toBe("/dashboard");
    expect(R.pathFor(nav("dashboard", { tab: "nonsense" }))).toBe("/dashboard");
    expect(R.pathFor(nav("admin", { tab: "applications" }))).toBe("/admin");
    expect(R.pathFor(nav("admin", { tab: "nonsense" }))).toBe("/admin");
  });

  it("returns null (leave the address alone) for an id that cannot be routed, never a broken URL", () => {
    expect(R.pathFor(nav("event", { id: "e1" }))).toBeNull();
    expect(R.pathFor(nav("place", { id: undefined }))).toBeNull();
    expect(R.pathFor(nav("profile", { id: "c1" }))).toBeNull();
    expect(R.pathFor(nav("messages", { convId: "not-a-uuid" }))).toBe("/messages");
    expect(R.pathFor(null)).toBeNull();
    expect(R.pathFor(nav("no-such-page"))).toBeNull();
  });

  it("covers every tab the screens offer", () => {
    expect(R.DASHBOARD_TABS).toEqual(["overview", "events", "news", "suggestions", "profile", "messages", "tools"]);
    expect(R.ADMIN_TABS).toEqual(["applications", "overview", "contributors", "citizens", "reports"]);
  });
});

describe("navFromPath: tidy-ups that keep one canonical URL per screen", () => {
  it("/map is an alias of / (replace it in the address bar)", () => {
    expect(R.navFromPath("/map")).toMatchObject({ ok: true, legacy: true, canonical: "/", nav: nav("home") });
  });

  it("ignores a trailing slash and the case of an id", () => {
    expect(R.navFromPath("/discover/")).toMatchObject({ ok: true, legacy: true, canonical: "/discover" });
    expect(R.navFromPath(`/e/${ID.toUpperCase()}`)).toMatchObject({ ok: true, canonical: `/e/${ID}`, nav: nav("event", { id: ID }) });
  });

  it("/dashboard/overview and /admin/applications collapse to the short URL", () => {
    expect(R.navFromPath("/dashboard/overview")).toMatchObject({ ok: true, legacy: true, canonical: "/dashboard" });
    expect(R.navFromPath("/admin/applications")).toMatchObject({ ok: true, legacy: true, canonical: "/admin" });
  });

  it("old Admin addresses replace onto Contributors (/admin/create also asks for the form)", () => {
    expect(R.navFromPath("/admin/listings")).toMatchObject({
      ok: true,
      legacy: true,
      canonical: "/admin/contributors",
      nav: nav("admin", { tab: "contributors" }),
    });
    expect(R.navFromPath("/admin/create")).toMatchObject({
      ok: true,
      legacy: true,
      canonical: "/admin/contributors",
      nav: nav("admin", { tab: "contributors", openCreate: true }),
    });
    expect(R.pathFor(nav("admin", { tab: "contributors", openCreate: true }))).toBe("/admin/contributors");
    expect(R.safeReturnPath("/admin/listings")).toBe("/admin/contributors");
    expect(R.safeReturnPath("/admin/create")).toBe("/admin/contributors");
  });

  it("an unknown tab opens the screen on its default tab rather than failing (the old /dashboard/<anything> rewrite did)", () => {
    expect(R.navFromPath("/dashboard/whatever")).toMatchObject({ ok: true, legacy: true, canonical: "/dashboard", nav: nav("dashboard") });
    expect(R.navFromPath("/admin/whatever")).toMatchObject({ ok: true, legacy: true, canonical: "/admin", nav: nav("admin") });
  });
});

describe("legacy links keep working", () => {
  it("/index.html opens the map and wants replacing with /", () => {
    expect(R.navFromPath("/index.html")).toMatchObject({ ok: true, legacy: true, canonical: "/", nav: nav("home") });
    expect(R.navFromPath("/index.html", "?utm_source=mail")).toMatchObject({ ok: true, canonical: "/", nav: nav("home") });
  });

  it("/index.html?c=<slug> (old bookmarks, Sheet and emailed links) opens that listing as /c/<slug>", () => {
    expect(R.navFromPath("/index.html", "?c=impact-radio")).toMatchObject({
      ok: true,
      legacy: true,
      canonical: "/c/impact-radio",
      nav: nav("profile", { slug: "impact-radio" }),
    });
    expect(R.navFromPath("/index.html", "?x=1&c=grace-point")).toMatchObject({ canonical: "/c/grace-point" });
  });

  it("a malformed ?c= is refused, not trusted", () => {
    for (const bad of ["?c=Has%20Space", "?c=UPPER", "?c=..%2F..", "?c=<script>", `?c=${"a".repeat(121)}`, "?c="]) {
      const r = R.navFromPath("/index.html", bad);
      expect(r.ok, bad).toBe(false);
      expect(r.canonical).toBe("/");
    }
  });
});

describe("malformed or unknown paths fall back to the map (ok=false, so the app can say so)", () => {
  const bad = [
    "/e/not-a-uuid",
    "/e/123",
    `/e/${ID}/extra`,
    "/p/xyz",
    "/p/",
    "/c/Has_Caps",
    "/c/has space",
    `/c/${"a".repeat(121)}`,
    "/messages/xyz",
    "/foo",
    "/api/v1/events",
    "/_next/static/x.js",
    "//evil.com",
    "//evil.com/dashboard",
    "/e",
    "",
    "dashboard",
    "javascript:alert(1)",
    "https://evil.com",
  ];
  for (const p of bad) {
    it(JSON.stringify(p), () => {
      const r = R.navFromPath(p);
      expect(r.ok).toBe(false);
      expect(r.nav).toEqual(nav("home"));
      expect(r.canonical).toBe("/");
    });
  }

  it("never throws on non-strings", () => {
    for (const v of [null, undefined, 42, {}, []]) {
      expect(R.navFromPath(v).ok).toBe(false);
    }
  });
});

describe("accessFor: the URL never grants access, it only says what the screen needs", () => {
  it("public screens", () => {
    for (const n of [nav("home"), nav("kingdom-discovery"), nav("explore"), nav("community"), nav("event", { id: ID }), nav("place", { id: ID }), nav("profile", { id: ID }), nav("profile", { slug: "x" })]) {
      expect(R.accessFor(n), n.page).toBe("public");
    }
  });
  it("signed-in screens", () => {
    for (const n of [nav("messages"), nav("messages", { convId: ID }), nav("notifications"), nav("settings"), nav("apply"), nav("onboarding"), nav("profile")]) {
      expect(R.accessFor(n), n.page + JSON.stringify(n.params)).toBe("auth");
    }
  });
  it("role screens", () => {
    expect(R.accessFor(nav("dashboard", { tab: "events" }))).toBe("contributor");
    expect(R.accessFor(nav("admin", { tab: "contributors" }))).toBe("admin");
    expect(R.accessFor(nav("admin", { tab: "citizens" }))).toBe("admin");
  });
  it("an unknown page is treated as signed-in-only, never as public", () => {
    expect(R.accessFor(nav("mystery"))).toBe("auth");
  });
  it("only a shareable listing is an entity route", () => {
    expect(R.isEntityRoute(nav("event", { id: ID }))).toBe(true);
    expect(R.isEntityRoute(nav("place", { id: ID }))).toBe(true);
    expect(R.isEntityRoute(nav("profile", { slug: "x" }))).toBe(true);
    expect(R.isEntityRoute(nav("profile", { id: ID }))).toBe(true);
    expect(R.isEntityRoute(nav("profile"))).toBe(false);
    expect(R.isEntityRoute(nav("dashboard"))).toBe(false);
    expect(R.isEntityRoute(nav("home"))).toBe(false);
  });
});

describe("safeReturnPath: where to land after signing in, same-origin only", () => {
  it("accepts a known app path and returns its canonical form", () => {
    expect(R.safeReturnPath("/dashboard/events")).toBe("/dashboard/events");
    expect(R.safeReturnPath(`/e/${ID}`)).toBe(`/e/${ID}`);
    expect(R.safeReturnPath("/")).toBe("/");
    expect(R.safeReturnPath("/map")).toBe("/");
    expect(R.safeReturnPath("/index.html?c=impact-radio")).toBe("/c/impact-radio");
    expect(R.safeReturnPath("  /discover  ")).toBe("/discover");
  });

  it("drops the query string and hash, so nothing smuggled in them survives", () => {
    expect(R.safeReturnPath("/dashboard?next=https://evil.example")).toBe("/dashboard");
    expect(R.safeReturnPath("/discover#access_token=abc")).toBe("/discover");
  });

  it("refuses anything that could leave the origin or run script", () => {
    const attacks = [
      "//evil.example",
      "//evil.example/dashboard",
      "///evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "https://evil.example",
      "http://evil.example/dashboard",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "/%2f%2fevil.example",
      "/dashboard/../../evil",
      "/e/../..//evil.example",
      "/dashboard\n//evil.example",
      "/dashboard\r\nLocation: https://evil.example",
      "/dash\u0000board",
      "evil.example",
      "",
      "   ",
      "/" + "a".repeat(400),
    ];
    for (const a of attacks) expect(R.safeReturnPath(a), JSON.stringify(a)).toBeNull();
  });

  it("refuses non-strings and unknown or malformed app paths", () => {
    for (const v of [null, undefined, 7, {}, [], true]) expect(R.safeReturnPath(v)).toBeNull();
    expect(R.safeReturnPath("/e/not-a-uuid")).toBeNull();
    expect(R.safeReturnPath("/api/v1/events")).toBeNull();
    expect(R.safeReturnPath("/foo")).toBeNull();
  });
});

describe("titleFor", () => {
  it("names the screen in the tab and history", () => {
    expect(R.titleFor(nav("home"))).toBe("Citizens Connect");
    expect(R.titleFor(nav("kingdom-discovery"))).toBe("Kingdom Exploration · Citizens Connect");
    expect(R.titleFor(nav("explore"))).toBe("Explore · Citizens Connect");
    expect(R.titleFor(nav("dashboard", { tab: "events" }))).toBe("Dashboard · Citizens Connect");
    expect(R.titleFor(nav("admin"))).toBe("Admin · Citizens Connect");
    expect(R.titleFor(nav("messages"))).toBe("Messages · Citizens Connect");
  });
  it("uses the entity's own name when it has loaded, and a plain word until then", () => {
    expect(R.titleFor(nav("event", { id: ID }), "Kayaking!")).toBe("Kayaking! · Citizens Connect");
    expect(R.titleFor(nav("event", { id: ID }))).toBe("Event · Citizens Connect");
    expect(R.titleFor(nav("place", { id: ID }), "Brooklyn Anchor Campus")).toBe("Brooklyn Anchor Campus · Citizens Connect");
    expect(R.titleFor(nav("profile", { slug: "x" }), "Impact Radio")).toBe("Impact Radio · Citizens Connect");
    expect(R.titleFor(nav("profile"))).toBe("Profile · Citizens Connect");
  });
  it("never lets a hostile name break out of the title or run long", () => {
    const t = R.titleFor(nav("event", { id: ID }), "<img src=x onerror=alert(1)>" + "x".repeat(200));
    expect(t.length).toBeLessThanOrEqual(80 + " · Citizens Connect".length);
    expect(t.endsWith(" · Citizens Connect")).toBe(true);
  });
});

describe("isSlug / isUuid: the only shapes allowed into a request path", () => {
  it("accepts a real slug and a real uuid", () => {
    expect(R.isSlug("impact-radio")).toBe(true);
    expect(R.isSlug("a".repeat(120))).toBe(true);
    expect(R.isUuid(ID)).toBe(true);
  });
  it("rejects anything that could change a request path, a host or a query", () => {
    for (const bad of ["", "a".repeat(121), "Impact-Radio", "../x", "a/b", "a?b=1", "a#b", "a b", "a\\b", "%2e%2e", "a.b", "😀", null, undefined, 7, {}, ["a"]]) {
      expect(R.isSlug(bad), String(bad)).toBe(false);
    }
    for (const bad of ["", "not-a-uuid", ID + "/x", ID + "?x=1", "../" + ID, null, undefined, 7]) {
      expect(R.isUuid(bad), String(bad)).toBe(false);
    }
  });
});

describe("intake upgrade confirm link", () => {
  const TOKEN = "ab".repeat(32);
  it("keeps a 64-hex token in the path, including the decline action", () => {
    expect(R.pathFor(nav("intake-upgrade", { token: TOKEN }))).toBe(`/upgrade/${TOKEN}`);
    expect(R.navFromPath(`/upgrade/${TOKEN}`)).toMatchObject({
      ok: true,
      legacy: false,
      canonical: `/upgrade/${TOKEN}`,
      nav: nav("intake-upgrade", { token: TOKEN }),
    });
    expect(R.navFromPath(`/upgrade/${TOKEN.toUpperCase()}/decline`)).toMatchObject({
      ok: true,
      canonical: `/upgrade/${TOKEN}/decline`,
      nav: nav("intake-upgrade", { token: TOKEN, intent: "decline" }),
    });
    expect(R.pathFor(nav("intake-upgrade", { token: TOKEN, intent: "decline" }))).toBe(`/upgrade/${TOKEN}/decline`);
  });
  it("needs a signed-in account, and the return path keeps the token (queries are dropped)", () => {
    expect(R.accessFor(nav("intake-upgrade", { token: TOKEN }))).toBe("auth");
    expect(R.safeReturnPath(`/upgrade/${TOKEN}`)).toBe(`/upgrade/${TOKEN}`);
    expect(R.safeReturnPath(`/upgrade/${TOKEN}?next=https://evil.example`)).toBe(`/upgrade/${TOKEN}`);
    expect(R.titleFor(nav("intake-upgrade", { token: TOKEN }))).toBe("Confirm your listing · Citizens Connect");
  });
  it("refuses a token that is not 64 hex, and a bare /upgrade", () => {
    for (const bad of ["/upgrade", "/upgrade/", "/upgrade/abc", `/upgrade/${TOKEN}/extra`, `/upgrade/${TOKEN}/Decline`]) {
      expect(R.navFromPath(bad).ok, bad).toBe(false);
    }
    expect(R.pathFor(nav("intake-upgrade", { token: "nope" }))).toBeNull();
  });
});

describe("PREFIXES: the server rewrites exactly these top-level paths, no more", () => {
  it("lists every first path segment the table owns", () => {
    expect([...R.PREFIXES].sort()).toEqual(
      ["admin", "apply", "c", "community", "dashboard", "discover", "e", "explore", "map", "me", "messages", "notifications", "onboarding", "p", "settings", "upgrade"].sort(),
    );
  });
  it("never claims a path the server owns", () => {
    for (const reserved of ["api", "auth", "_next", "index.html", "sw.js", "vendor", "app", "assets", "icons", "manifest.json", "config.js"]) {
      expect(R.PREFIXES, reserved).not.toContain(reserved);
    }
  });
});

// ── Served under a prefix (C39 PR B): /citizens/connect on the shared domain ──────────────────
//  The table above is APP-RELATIVE and does not change. stripBase / withBase are the only
//  crossings to the address bar, and with an empty base (today's production) they do nothing.
describe("stripBase / withBase: the prefix crossing", () => {
  const BASE = "/citizens/connect";
  const TOKEN = "ab".repeat(32);
  const APP_PATHS = [
    "/", "/discover", "/explore", "/community", "/messages", `/messages/${ID}`, "/notifications", "/settings", "/apply",
    "/onboarding", "/dashboard", "/dashboard/events", "/admin", "/admin/contributors", `/e/${ID}`, `/p/${ID}`,
    "/c/harvest-hall", `/c/${ID}`, "/me", `/upgrade/${TOKEN}`, `/upgrade/${TOKEN}/decline`,
  ];

  describe("with an empty base (the site root) nothing changes", () => {
    it("returns every path as it came in", () => {
      for (const p of [...APP_PATHS, "/index.html", "/map", "/dashboard/", "/e/not-a-uuid", "/citizens/connect/discover", "/x?y=1#z"]) {
        expect(R.stripBase(p, ""), p).toBe(p);
        expect(R.withBase(p, ""), p).toBe(p);
      }
    });
    it("still refuses a non-string pathname", () => {
      for (const v of [null, undefined, 7, {}, []]) expect(R.stripBase(v, "")).toBeNull();
    });
  });

  describe("stripBase", () => {
    it("takes the prefix off, and the bare prefix with or without a slash is the front door", () => {
      expect(R.stripBase(BASE, BASE)).toBe("/");
      expect(R.stripBase(`${BASE}/`, BASE)).toBe("/");
      expect(R.stripBase(`${BASE}/discover`, BASE)).toBe("/discover");
      expect(R.stripBase(`${BASE}/e/${ID}`, BASE)).toBe(`/e/${ID}`);
      expect(R.stripBase(`${BASE}/dashboard/events`, BASE)).toBe("/dashboard/events");
      expect(R.stripBase(`${BASE}/index.html`, BASE)).toBe("/index.html");
      // a trailing slash survives, so navFromPath can still tidy the address
      expect(R.stripBase(`${BASE}/discover/`, BASE)).toBe("/discover/");
    });
    it("is null for anything outside the prefix, a lookalike or another app included", () => {
      for (const p of ["/", "/discover", `/e/${ID}`, "/citizens", "/citizens/", "/citizens/vision/discover", "/citizens/connectx",
        "/citizens/connect-x/discover", "/citizens/Connect/discover", "/x/citizens/connect/discover", ""]) {
        expect(R.stripBase(p, BASE), JSON.stringify(p)).toBeNull();
      }
      for (const v of [null, undefined, 7, {}, []]) expect(R.stripBase(v, BASE)).toBeNull();
    });
    it("leaves a doubled slash for navFromPath to refuse, so /citizens/connect//evil.example is not a screen", () => {
      const rel = R.stripBase(`${BASE}//evil.example`, BASE);
      expect(rel).toBe("//evil.example");
      expect(R.navFromPath(rel).ok).toBe(false);
      expect(R.safeReturnPath(rel)).toBeNull();
    });
  });

  describe("withBase", () => {
    it("puts the prefix in front, and '/' is the bare prefix (Next redirects the slash form)", () => {
      expect(R.withBase("/", BASE)).toBe(BASE);
      expect(R.withBase("/discover", BASE)).toBe(`${BASE}/discover`);
      expect(R.withBase(`/e/${ID}`, BASE)).toBe(`${BASE}/e/${ID}`);
      expect(R.withBase("/dashboard/events", BASE)).toBe(`${BASE}/dashboard/events`);
    });
    it("keeps a query or hash on the front door", () => {
      expect(R.withBase("/?c=harvest-hall", BASE)).toBe(`${BASE}?c=harvest-hall`);
      expect(R.withBase("/#top", BASE)).toBe(`${BASE}#top`);
      expect(R.withBase("/discover?q=a#b", BASE)).toBe(`${BASE}/discover?q=a#b`);
    });
    it("hands back anything that is not a plain app path, so an absolute URL is never glued on", () => {
      for (const v of ["//evil.example", "//evil.example/x", "https://evil.example", "discover", "", null, undefined, 7]) {
        expect(R.withBase(v, BASE), String(v)).toBe(v);
      }
    });
  });

  describe("round trips", () => {
    it("every app path survives withBase then stripBase, and means the same screen", () => {
      for (const p of APP_PATHS) {
        const url = R.withBase(p, BASE) as string;
        expect(url.startsWith(BASE), p).toBe(true);
        const back = R.stripBase(url, BASE);
        expect(back, p).toBe(p);
        expect(R.navFromPath(back, ""), p).toEqual(R.navFromPath(p, ""));
      }
    });
    it("pathFor then withBase then stripBase then navFromPath returns the screen we started on", () => {
      const screens: Nav[] = [nav("home"), nav("kingdom-discovery"), nav("dashboard", { tab: "events" }), nav("event", { id: ID }), nav("profile", { slug: "harvest-hall" }), nav("messages", { convId: ID })];
      for (const n of screens) {
        const url = R.withBase(R.pathFor(n) as string, BASE) as string;
        expect(R.navFromPath(R.stripBase(url, BASE), "").nav, url).toEqual(n);
      }
    });
    it("the front door in both spellings is the map", () => {
      expect(R.navFromPath(R.stripBase(BASE, BASE), "")).toMatchObject({ ok: true, nav: nav("home"), canonical: "/" });
      expect(R.navFromPath(R.stripBase(`${BASE}/`, BASE), "")).toMatchObject({ ok: true, nav: nav("home"), canonical: "/" });
    });
    it("a legacy /index.html?c=<slug> under the prefix still opens that Contributor", () => {
      expect(R.navFromPath(R.stripBase(`${BASE}/index.html`, BASE), "?c=harvest-hall")).toMatchObject({
        ok: true, legacy: true, canonical: "/c/harvest-hall", nav: nav("profile", { slug: "harvest-hall" }),
      });
    });
  });

  describe("safeReturnPath stays app-relative and still refuses open redirects", () => {
    it("takes the stripped path, and refuses the prefixed one (it is not an app path)", () => {
      expect(R.safeReturnPath(R.stripBase(`${BASE}/dashboard/events`, BASE))).toBe("/dashboard/events");
      expect(R.safeReturnPath(`${BASE}/dashboard/events`)).toBeNull();
    });
    it("refuses the same attacks with a prefix configured", () => {
      const prefixed = loadFrontend("routes.jsx", { __CC_ENV: { BASE_PATH: BASE } }).CC_ROUTES as Routes;
      for (const a of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "/dashboard\n//evil.example", `${BASE}//evil.example`, "/%2f%2fevil.example"]) {
        expect(prefixed.safeReturnPath(a), JSON.stringify(a)).toBeNull();
      }
    });
  });

  describe("BASE_PATH and appUrl (the build's own prefix, read once from config.js)", () => {
    const load = (env: unknown) => loadFrontend("routes.jsx", env === undefined ? {} : { __CC_ENV: env }).CC_ROUTES as Routes;

    it("is the site root when config.js has no BASE_PATH, so appUrl changes nothing", () => {
      for (const env of [undefined, {}, { BASE_PATH: "" }, { API_BASE_URL: "" }]) {
        const r = load(env);
        expect(r.BASE_PATH).toBe("");
        expect(r.appUrl("/discover")).toBe("/discover");
        expect(r.appUrl("/")).toBe("/");
        expect(r.appUrl("/assets/map-v2.css?v=1")).toBe("/assets/map-v2.css?v=1");
      }
    });
    it("is the prefix when config.js has one, and appUrl applies it", () => {
      const r = load({ BASE_PATH: BASE });
      expect(r.BASE_PATH).toBe(BASE);
      expect(r.appUrl("/")).toBe(BASE);
      expect(r.appUrl("/c/harvest-hall")).toBe(`${BASE}/c/harvest-hall`);
      expect(r.appUrl("/assets/map-v2.css?v=1")).toBe(`${BASE}/assets/map-v2.css?v=1`);
    });
    it("forgives one trailing slash and ignores a value that is not a path", () => {
      expect(load({ BASE_PATH: `${BASE}/` }).BASE_PATH).toBe(BASE);
      for (const bad of ["citizens/connect", "//evil.example", "https://evil.example", "/", 5, null, {}]) {
        expect(load({ BASE_PATH: bad }).BASE_PATH, String(bad)).toBe("");
      }
    });
  });
});
