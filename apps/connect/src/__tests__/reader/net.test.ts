import { describe, it, expect } from "vitest";
import { USER_AGENT, createFetcher, isNeverReadHost, isPlausiblePublicHostname, isPrivateAddress } from "../../../scripts/reader/net.mjs";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** A fetcher on a fake network and a fake clock; `sleeps` records every wait. */
function setup(
  routes: Record<string, Response | Handler>,
  over: { resolve?: (h: string) => Promise<{ address: string }[]>; maxBytes?: number } = {},
) {
  const requests: { url: string; init: RequestInit }[] = [];
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    const hit = routes[url];
    if (!hit) return new Response("not found", { status: 404 });
    return typeof hit === "function" ? hit(url, init) : hit.clone();
  };
  const fetcher = createFetcher({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    resolve: over.resolve ?? (async () => [{ address: "93.184.216.34" }]),
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...(over.maxBytes ? { maxBytes: over.maxBytes } : {}),
  });
  return {
    fetcher,
    requests,
    sleeps,
    urls: () => requests.map((r) => r.url),
    advance: (ms: number) => (clock += ms),
  };
}

const html = (body: string, type = "text/html; charset=utf-8") => new Response(body, { status: 200, headers: { "content-type": type } });
const robots = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

describe("addresses", () => {
  it("knows private, loopback, link-local, metadata and reserved ranges, for IPv4 and IPv6", () => {
    for (const a of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fe80::1",
      "fd12::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "2001:db8::1",
    ]) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
    for (const a of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) expect(isPrivateAddress(a), a).toBe(false);
    expect(isPrivateAddress("not an address")).toBe(true);
  });
  it("only tries real, dotted, public-looking host names", () => {
    for (const h of [
      "localhost",
      "a.localhost",
      "intranet",
      "127.0.0.1",
      "[::1]",
      "printer.local",
      "db.internal",
      "",
      "x".repeat(300) + ".example",
    ]) {
      expect(isPlausiblePublicHostname(h), h).toBe(false);
    }
    expect(isPlausiblePublicHostname("www.church.example")).toBe(true);
  });
  it("never reads Facebook, Instagram, TikTok, WhatsApp or Threads, on any subdomain, but not lookalikes", () => {
    for (const h of [
      "facebook.com",
      "www.facebook.com",
      "m.facebook.com",
      "fb.me",
      "instagram.com",
      "www.instagram.com",
      "tiktok.com",
      "vm.tiktok.com",
      "web.whatsapp.com",
      "threads.net",
    ]) {
      expect(isNeverReadHost(h), h).toBe(true);
    }
    for (const h of ["notfacebook.com", "facebook.com.evil.example", "church.example"]) expect(isNeverReadHost(h), h).toBe(false);
  });
});

describe("fetcher: what it will not fetch", () => {
  it("refuses http, userinfo, odd ports, IP literals, localhost and never-read sites WITHOUT any request", async () => {
    const t = setup({});
    for (const url of [
      "http://www.church.example/",
      "https://user:pw@www.church.example/",
      "https://www.church.example:8443/",
      "https://127.0.0.1/",
      "https://[::1]/",
      "https://169.254.169.254/latest/meta-data/",
      "https://localhost/",
      "https://intranet/",
      "https://www.facebook.com/example",
      "https://www.instagram.com/example/",
      "https://www.tiktok.com/@example",
      "ftp://www.church.example/",
      "not a url",
    ]) {
      const r = await t.fetcher.get(url);
      expect(r.ok, url).toBe(false);
    }
    expect(t.requests).toEqual([]);
  });

  it("refuses a name that RESOLVES to a private address (and says so without leaking it)", async () => {
    const t = setup({}, { resolve: async () => [{ address: "93.184.216.34" }, { address: "10.0.0.7" }] });
    const r = await t.fetcher.get("https://sneaky.church.example/");
    expect(r).toEqual({ ok: false, reason: "not a public https address" });
    expect(t.requests).toEqual([]);
  });

  it("reports a name that does not resolve", async () => {
    const t = setup({}, { resolve: async () => Promise.reject(new Error("ENOTFOUND")) });
    expect(await t.fetcher.get("https://gone.church.example/")).toEqual({
      ok: false,
      reason: "could not look up the address",
    });
  });
});

describe("fetcher: robots.txt", () => {
  it("reads robots.txt once per site, then fetches the page", async () => {
    const t = setup({
      "https://www.church.example/robots.txt": robots("User-agent: *\nDisallow: /private\n"),
      "https://www.church.example/": html("<p>hi</p>"),
      "https://www.church.example/events": html("<p>events</p>"),
    });
    expect((await t.fetcher.get("https://www.church.example/")).ok).toBe(true);
    expect((await t.fetcher.get("https://www.church.example/events")).ok).toBe(true);
    expect(t.urls().filter((u) => u.endsWith("/robots.txt"))).toHaveLength(1);
  });

  it("does not fetch a page robots.txt disallows, and says so", async () => {
    const t = setup({
      "https://www.church.example/robots.txt": robots("User-agent: CitizensConnectReader\nDisallow: /\n"),
      "https://www.church.example/": html("secret"),
    });
    expect(await t.fetcher.get("https://www.church.example/")).toEqual({
      ok: false,
      reason: "blocked by robots.txt",
    });
    expect(t.urls()).toEqual(["https://www.church.example/robots.txt"]);
  });

  it("treats a missing robots.txt (404, 403) as allowed, but an unreachable or erroring one as 'stay away'", async () => {
    const page = html("ok");
    const allowed = setup({
      "https://a.church.example/": page,
      "https://b.church.example/robots.txt": new Response("no", { status: 403 }),
      "https://b.church.example/": page,
    });
    expect((await allowed.fetcher.get("https://a.church.example/")).ok).toBe(true);
    expect((await allowed.fetcher.get("https://b.church.example/")).ok).toBe(true);

    for (const status of [500, 503, 429]) {
      const t = setup({
        "https://www.church.example/robots.txt": new Response("err", { status }),
        "https://www.church.example/": page,
      });
      expect(await t.fetcher.get("https://www.church.example/"), String(status)).toEqual({
        ok: false,
        reason: "robots.txt unavailable",
      });
      expect(t.urls()).not.toContain("https://www.church.example/");
    }
    const down = setup({
      "https://www.church.example/robots.txt": () => Promise.reject(new TypeError("fetch failed")),
    });
    expect(await down.fetcher.get("https://www.church.example/")).toEqual({
      ok: false,
      reason: "robots.txt unavailable",
    });
  });

  it("checks the query string too (a YouTube-style feed path can be disallowed)", async () => {
    const t = setup({
      "https://www.video.example/robots.txt": robots("User-agent: *\nDisallow: /feeds/videos.xml\n"),
      "https://www.video.example/feeds/videos.xml?channel_id=UC1": html("<feed/>"),
    });
    expect(await t.fetcher.get("https://www.video.example/feeds/videos.xml?channel_id=UC1")).toEqual({ ok: false, reason: "blocked by robots.txt" });
    expect(await t.fetcher.robotsAllows("https://www.video.example/feeds/videos.xml?channel_id=UC2")).toEqual({
      ok: false,
      reason: "blocked by robots.txt",
    });
    expect(await t.fetcher.robotsAllows("https://www.video.example/@channel")).toEqual({
      ok: true,
    });

    const q = setup({
      "https://www.video.example/robots.txt": robots("User-agent: *\nDisallow: /list?page="),
    });
    expect(await q.fetcher.robotsAllows("https://www.video.example/list?page=2")).toEqual({
      ok: false,
      reason: "blocked by robots.txt",
    });
    expect(await q.fetcher.robotsAllows("https://www.video.example/list")).toEqual({ ok: true });
  });
});

describe("fetcher: politeness", () => {
  it("sends the honest User-Agent, no cookies and no credentials", async () => {
    const t = setup({ "https://www.church.example/": html("ok") });
    await t.fetcher.get("https://www.church.example/");
    const init = t.requests.find((r) => r.url === "https://www.church.example/")!.init;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toBe("CitizensConnectReader/1.0 (+https://www.citizenscentral.co.za)");
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("cookie");
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("authorization");
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("manual");
  });

  it("waits so a host gets at most one request a second, and different hosts do not wait for each other", async () => {
    const t = setup({
      "https://www.church.example/robots.txt": robots(""),
      "https://www.church.example/a": html("a"),
      "https://www.church.example/b": html("b"),
      "https://www.other.example/robots.txt": robots(""),
      "https://www.other.example/": html("o"),
    });
    await t.fetcher.get("https://www.church.example/a"); // robots + page: 2 requests, 1 s apart
    await t.fetcher.get("https://www.church.example/b");
    expect(t.sleeps).toEqual([1000, 1000]);
    t.sleeps.length = 0;
    await t.fetcher.get("https://www.other.example/"); // a new host starts immediately
    expect(t.sleeps).toEqual([1000]); // only robots.txt -> page on that host
  });

  it("does not wait when a second has already passed", async () => {
    const t = setup({
      "https://www.church.example/robots.txt": robots(""),
      "https://www.church.example/a": html("a"),
      "https://www.church.example/b": html("b"),
    });
    await t.fetcher.get("https://www.church.example/a");
    t.sleeps.length = 0;
    t.advance(5000);
    await t.fetcher.get("https://www.church.example/b");
    expect(t.sleeps).toEqual([]);
  });
});

describe("fetcher: redirects", () => {
  const ok = html("final");
  it("follows up to three https redirects, checking each hop", async () => {
    const t = setup({
      "https://www.church.example/robots.txt": robots(""),
      "https://www.church.example/a": redirect("/b"),
      "https://www.church.example/b": redirect("https://www.church.example/c", 301),
      "https://www.church.example/c": redirect("/d", 307),
      "https://www.church.example/d": ok,
    });
    const r = await t.fetcher.get("https://www.church.example/a");
    expect(r).toMatchObject({ ok: true, url: "https://www.church.example/d", text: "final" });
  });
  it("gives up after more than three", async () => {
    const t = setup({
      "https://www.church.example/robots.txt": robots(""),
      "https://www.church.example/a": redirect("/b"),
      "https://www.church.example/b": redirect("/c"),
      "https://www.church.example/c": redirect("/d"),
      "https://www.church.example/d": redirect("/e"),
      "https://www.church.example/e": ok,
    });
    expect(await t.fetcher.get("https://www.church.example/a")).toEqual({
      ok: false,
      reason: "too many redirects",
    });
  });
  it("refuses a redirect to http, to a private address, to a never-read site, or to a page that site's robots.txt disallows", async () => {
    const base = { "https://www.church.example/robots.txt": robots("") };
    const toHttp = setup({
      ...base,
      "https://www.church.example/a": redirect("http://www.church.example/b"),
    });
    expect(await toHttp.fetcher.get("https://www.church.example/a")).toEqual({
      ok: false,
      reason: "redirected to a non-https address",
    });

    const toIp = setup({
      ...base,
      "https://www.church.example/a": redirect("https://169.254.169.254/latest"),
    });
    expect((await toIp.fetcher.get("https://www.church.example/a")).ok).toBe(false);
    expect(toIp.urls()).not.toContain("https://169.254.169.254/latest");

    const toFb = setup({
      ...base,
      "https://www.church.example/a": redirect("https://www.facebook.com/x"),
    });
    expect(await toFb.fetcher.get("https://www.church.example/a")).toEqual({
      ok: false,
      reason: "this site is never read",
    });

    const toBlocked = setup({
      ...base,
      "https://www.church.example/a": redirect("https://www.other.example/b"),
      "https://www.other.example/robots.txt": robots("User-agent: *\nDisallow: /b"),
      "https://www.other.example/b": ok,
    });
    expect(await toBlocked.fetcher.get("https://www.church.example/a")).toEqual({
      ok: false,
      reason: "blocked by robots.txt",
    });
    expect(toBlocked.urls()).not.toContain("https://www.other.example/b");
  });
});

describe("fetcher: failures and limits", () => {
  const routes = (page: Response | Handler) => ({
    "https://www.church.example/robots.txt": robots(""),
    "https://www.church.example/": page,
  });

  it("reports an HTTP error status in a fixed phrase", async () => {
    expect(await setup(routes(new Response("x", { status: 404 }))).fetcher.get("https://www.church.example/")).toMatchObject({
      ok: false,
      reason: "HTTP 404",
    });
    expect(await setup(routes(new Response("x", { status: 503 }))).fetcher.get("https://www.church.example/")).toMatchObject({
      ok: false,
      reason: "HTTP 503",
    });
  });
  it("reports a timeout and a network failure without throwing", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    expect(await setup(routes(() => Promise.reject(timeout))).fetcher.get("https://www.church.example/")).toEqual({ ok: false, reason: "timed out" });
    expect(await setup(routes(() => Promise.reject(new TypeError("fetch failed")))).fetcher.get("https://www.church.example/")).toEqual({
      ok: false,
      reason: "could not connect",
    });
  });
  it("caps the body and says it was truncated", async () => {
    const t = setup(routes(html("x".repeat(5000))), { maxBytes: 1000 });
    const r = await t.fetcher.get("https://www.church.example/");
    expect(r).toMatchObject({ ok: true, truncated: true });
    expect((r as { text: string }).text).toHaveLength(1000);
  });
  it("decodes a declared legacy charset", async () => {
    const latin1 = new Response(new Uint8Array([0x43, 0x61, 0x66, 0xe9]), {
      status: 200,
      headers: { "content-type": "text/html; charset=iso-8859-1" },
    });
    const r = await setup(routes(latin1)).fetcher.get("https://www.church.example/");
    expect((r as { text: string }).text).toBe("Café");
  });
  it("survives an unknown charset label", async () => {
    const odd = new Response("hello", {
      status: 200,
      headers: { "content-type": "text/html; charset=klingon-9" },
    });
    expect(((await setup(routes(odd)).fetcher.get("https://www.church.example/")) as { text: string }).text).toBe("hello");
  });
});
