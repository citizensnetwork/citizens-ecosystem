import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import {
  LIMITS,
  REASONS,
  USER_AGENT,
  createFetcher,
  decodeText,
  guardedLookup,
  httpsGet,
  isNeverReadHost,
  isPlausiblePublicHostname,
  isPrivateAddress,
  readCapped,
  urlProblem,
} from "../../../scripts/reader/net.mjs";

describe("isPrivateAddress: only publicly routable addresses pass", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "192.0.2.10", "198.51.100.1", "203.0.113.5", "198.18.0.1", "192.88.99.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fe80::1%eth0", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1", "2002:7f00:1::1", "2001:0:4136::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::127.0.0.1", "64:ff9b::7f00:1",
    "not an address", "", "1.2.3", "999.1.1.1", "[::1]",
  ])("%s is refused", (a) => {
    expect(isPrivateAddress(a)).toBe(true);
  });
  it.each(["1.1.1.1", "8.8.8.8", "41.0.0.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2c0f:fb50::1", "::ffff:8.8.8.8"])("%s is public", (a) => {
    expect(isPrivateAddress(a)).toBe(false);
  });
});

describe("addresses the Reader will not even try", () => {
  it("names that are IP literals, local-only or reserved are refused", () => {
    for (const h of ["127.0.0.1", "[::1]", "localhost", "intranet", "db.internal", "printer.local", "x.test", "church.example", "router.home.arpa", "0x7f.1", "a..b.org", "-"]) {
      expect(isPlausiblePublicHostname(h), h).toBe(false);
    }
    expect(isPlausiblePublicHostname("www.church.example.org")).toBe(true);
  });
  it("https, the default port and no credentials only; the URL parser's normalisation cannot sneak an IP through", () => {
    const p = (u: string) => urlProblem(new URL(u));
    expect(p("https://www.church.example.org/events")).toBeNull();
    expect(p("https://www.church.example.org:443/")).toBeNull();
    expect(p("http://www.church.example.org/")).toBe(REASONS.notPublic);
    expect(p("https://www.church.example.org:8443/")).toBe(REASONS.notPublic);
    expect(p("https://user:pw@www.church.example.org/")).toBe(REASONS.notPublic);
    expect(p("https://2130706433/")).toBe(REASONS.notPublic); // = 127.0.0.1
    expect(p("https://0x7f000001/")).toBe(REASONS.notPublic);
    expect(p("https://[::ffff:127.0.0.1]/")).toBe(REASONS.notPublic);
    expect(p("ftp://www.church.example.org/")).toBe(REASONS.notPublic);
  });
  it("Facebook, Instagram, TikTok, WhatsApp and Threads are never read, by exact host or subdomain only", () => {
    for (const h of ["facebook.com", "m.facebook.com", "www.instagram.com", "vm.tiktok.com", "wa.me", "web.whatsapp.com", "www.threads.net", "FACEBOOK.COM."]) {
      expect(isNeverReadHost(h), h).toBe(true);
      expect(urlProblem(new URL(`https://${h}/x`)), h).toBe(REASONS.neverRead);
    }
    for (const h of ["notfacebook.com", "facebook.com.church.example.org", "threads.example.org"]) expect(isNeverReadHost(h), h).toBe(false);
  });
});

describe("the connection-time guard", () => {
  const lookupWith = (addrs: { address: string; family: number }[] | Error) => {
    const fn = guardedLookup(async () => {
      if (addrs instanceof Error) throw addrs;
      return addrs;
    });
    return (opts: object) => new Promise<unknown[]>((resolve) => fn("host.example.org", opts, (...args: unknown[]) => resolve(args)));
  };
  it("hands over exactly the checked public addresses, in both lookup forms", async () => {
    const pub = [{ address: "1.1.1.1", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }];
    expect(await lookupWith(pub)({})).toEqual([null, "1.1.1.1", 4]);
    expect(await lookupWith(pub)({ all: true })).toEqual([null, pub]);
  });
  it("refuses if ANY address is private (a mixed answer is a rebinding attempt), if there is none, or if the lookup fails", async () => {
    const [err] = await lookupWith([{ address: "1.1.1.1", family: 4 }, { address: "10.0.0.5", family: 4 }])({ all: true });
    expect((err as Error).message).toBe(REASONS.notPublic);
    expect(((await lookupWith([])({}))[0] as { code: string }).code).toBe("ENOTFOUND");
    expect(((await lookupWith(new Error("boom"))({}))[0] as Error).message).toBe("boom");
  });
  it("is the lookup node:https really uses: a name that resolves to loopback is refused before any connection", async () => {
    const lookup = guardedLookup(async () => [{ address: "127.0.0.1", family: 4 }]);
    await expect(httpsGet("https://rebind.example.org/", { headers: {}, timeoutMs: 5_000, maxBytes: 1_000, lookup })).rejects.toThrow(REASONS.notPublic);
    const meta = guardedLookup(async () => [{ address: "169.254.169.254", family: 4 }]);
    await expect(httpsGet("https://metadata.example.org/latest/", { headers: {}, timeoutMs: 5_000, maxBytes: 1_000, lookup: meta })).rejects.toThrow(REASONS.notPublic);
  });
  it("a name that does not resolve is an honest lookup failure", async () => {
    const lookup = guardedLookup(async () => {
      throw Object.assign(new Error("nope"), { code: "ENOTFOUND" });
    });
    await expect(httpsGet("https://nowhere.example.org/", { headers: {}, timeoutMs: 5_000, maxBytes: 1_000, lookup })).rejects.toThrow(REASONS.lookup);
  });
});

describe("reading a body with caps", () => {
  it("keeps at most maxBytes of DECODED bytes (a gzip bomb stops at the cap)", async () => {
    const bomb = gzipSync(Buffer.alloc(5_000_000));
    expect(bomb.length).toBeLessThan(10_000);
    const r = await readCapped(Readable.from([bomb]), "gzip", 1_000);
    expect(r).toMatchObject({ truncated: true });
    expect(r.buffer.length).toBe(1_000);
  });
  it("reads identity bodies whole under the cap, and refuses an unknown encoding", async () => {
    const r = await readCapped(Readable.from([Buffer.from("hello "), Buffer.from("world")]), "", 100);
    expect(r).toEqual({ buffer: Buffer.from("hello world"), truncated: false });
    await expect(readCapped(Readable.from([Buffer.from("x")]), "compress", 100)).rejects.toThrow(REASONS.encoding);
  });
  it("a body cut short keeps what arrived; one that fails at once is a connection failure", async () => {
    const partial = new Readable({ read() {} });
    const p = readCapped(partial, "identity", 100);
    partial.push(Buffer.from("half"));
    partial.destroy(new Error("reset"));
    expect(await p).toEqual({ buffer: Buffer.from("half"), truncated: true });
    const dead = new Readable({ read() {} });
    const q = readCapped(dead, "", 100);
    dead.destroy(new Error("reset"));
    await expect(q).rejects.toThrow(REASONS.connect);
  });
  it("decodes with the declared charset, falling back to UTF-8", () => {
    expect(decodeText(Buffer.from([0x63, 0x61, 0x66, 0xe9]), "text/html; charset=ISO-8859-1")).toBe("café");
    expect(decodeText(Buffer.from("café"), "text/html; charset=nonsense")).toBe("café");
  });
});

// ── the fetcher, with a scripted transport and DNS ─────────────────────────

type Reply = { status: number; location?: string; body?: string; contentType?: string } | Error;

function harness(replies: Record<string, Reply>, dns: Record<string, string> = {}) {
  let t = 0;
  const sleeps: number[] = [];
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetcher = createFetcher({
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    resolve: async (host: string) => [{ address: dns[host] ?? "93.184.216.34", family: 4 }],
    transport: async (url: string, opts: { headers: Record<string, string> }) => {
      calls.push({ url, headers: opts.headers });
      const r = replies[url] ?? { status: 404 };
      if (r instanceof Error) throw r;
      return { status: r.status, location: r.location ?? null, contentType: r.contentType ?? "text/html", buffer: Buffer.from(r.body ?? ""), truncated: false };
    },
  });
  return { fetcher, calls, sleeps, advance: (ms: number) => (t += ms) };
}

const SITE = "https://www.church.example.org";

describe("createFetcher: robots.txt", () => {
  it("asks robots.txt first, once per site, with an honest User-Agent, and honours a Disallow", async () => {
    const h = harness({ [`${SITE}/robots.txt`]: { status: 200, body: "User-agent: *\nDisallow: /private" }, [`${SITE}/events`]: { status: 200, body: "<html>ok</html>" } });
    expect(await h.fetcher.get(`${SITE}/private/x`)).toEqual({ ok: false, reason: REASONS.robotsBlocked });
    const ok = await h.fetcher.get(`${SITE}/events#frag`);
    expect(ok).toMatchObject({ ok: true, url: `${SITE}/events`, text: "<html>ok</html>" });
    expect(h.calls.map((c) => c.url)).toEqual([`${SITE}/robots.txt`, `${SITE}/events`]);
    expect(h.calls[1].headers["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^CitizensConnectReader\/\d/);
  });
  it("a missing robots.txt (404) allows everything; an unreachable one (5xx, 429, network) keeps the Reader away", async () => {
    const missing = harness({ [`${SITE}/`]: { status: 200, body: "hi" } });
    expect((await missing.fetcher.get(`${SITE}/`)).ok).toBe(true);
    for (const robots of [{ status: 503 }, { status: 429 }, new Error(REASONS.timeout)] as Reply[]) {
      const h = harness({ [`${SITE}/robots.txt`]: robots, [`${SITE}/`]: { status: 200, body: "hi" } });
      expect(await h.fetcher.get(`${SITE}/`)).toEqual({ ok: false, reason: REASONS.robotsUnavailable });
      expect(h.calls.map((c) => c.url)).toEqual([`${SITE}/robots.txt`]);
    }
  });
  it("YouTube's real rule: the video feed is disallowed for every crawler, so it is never fetched", async () => {
    const yt = "https://www.youtube.com";
    const h = harness({ [`${yt}/robots.txt`]: { status: 200, body: "User-agent: *\nDisallow: /feeds/videos.xml\n" } });
    expect(await h.fetcher.get(`${yt}/feeds/videos.xml?channel_id=UC123`)).toEqual({ ok: false, reason: REASONS.robotsBlocked });
    expect(h.calls).toHaveLength(1);
  });
});

describe("createFetcher: politeness", () => {
  it("one request a second per host; other hosts are not held up", async () => {
    const other = "https://feeds.example.org";
    const h = harness({ [`${SITE}/a`]: { status: 200 }, [`${SITE}/b`]: { status: 200 }, [`${other}/c`]: { status: 200 } });
    await h.fetcher.get(`${SITE}/a`); // robots + a
    await h.fetcher.get(`${SITE}/b`);
    expect(h.sleeps).toEqual([LIMITS.minGapMs, LIMITS.minGapMs]);
    await h.fetcher.get(`${other}/c`); // robots + c on a fresh host: robots goes at once, c waits its second
    expect(h.sleeps).toEqual([LIMITS.minGapMs, LIMITS.minGapMs, LIMITS.minGapMs]);
  });
  it("the defaults are the brief's: 1 s gap, 10 s timeout, 1 MB, 3 redirects", () => {
    expect(LIMITS).toMatchObject({ minGapMs: 1_000, timeoutMs: 10_000, maxBytes: 1_000_000, maxRedirects: 3 });
  });
});

describe("createFetcher: every hop is checked again", () => {
  it("refuses IP literals, other ports, credentials and never-read sites before any request", async () => {
    const h = harness({});
    for (const u of ["https://127.0.0.1/", "https://[::1]/", "https://www.church.example.org:8080/", "https://a:b@www.church.example.org/", "https://www.facebook.com/page", "http://www.church.example.org/", "not a url"]) {
      expect((await h.fetcher.get(u)).ok, u).toBe(false);
    }
    expect(h.calls).toHaveLength(0);
  });
  it("refuses a host that resolves to a private address, before asking it for robots.txt", async () => {
    const h = harness({}, { "intranet.example.org": "10.0.0.7" });
    expect(await h.fetcher.get("https://intranet.example.org/")).toEqual({ ok: false, reason: REASONS.notPublic });
    expect(h.calls).toHaveLength(0);
  });
  it("a redirect to a private host, to http, or past the limit is refused and never fetched", async () => {
    const h = harness(
      {
        [`${SITE}/to-private`]: { status: 302, location: "https://metadata.example.org/latest/" },
        [`${SITE}/to-http`]: { status: 301, location: "http://www.church.example.org/x" },
        [`${SITE}/r1`]: { status: 302, location: "/r2" },
        [`${SITE}/r2`]: { status: 302, location: "/r3" },
        [`${SITE}/r3`]: { status: 302, location: "/r4" },
        [`${SITE}/r4`]: { status: 302, location: "/r5" },
      },
      { "metadata.example.org": "169.254.169.254" },
    );
    expect(await h.fetcher.get(`${SITE}/to-private`)).toEqual({ ok: false, reason: REASONS.notPublic });
    expect(await h.fetcher.get(`${SITE}/to-http`)).toEqual({ ok: false, reason: REASONS.insecureRedirect });
    expect(await h.fetcher.get(`${SITE}/r1`)).toEqual({ ok: false, reason: REASONS.tooManyRedirects });
    expect(h.calls.some((c) => c.url.includes("metadata") || c.url.startsWith("http:"))).toBe(false);
  });
  it("a redirect to another site is checked against THAT site's robots.txt", async () => {
    const other = "https://cdn.example.org";
    const h = harness({
      [`${SITE}/events`]: { status: 302, location: `${other}/secret/events` },
      [`${other}/robots.txt`]: { status: 200, body: "User-agent: *\nDisallow: /secret" },
    });
    expect(await h.fetcher.get(`${SITE}/events`)).toEqual({ ok: false, reason: REASONS.robotsBlocked });
    expect(h.calls.map((c) => c.url)).toEqual([`${SITE}/robots.txt`, `${SITE}/events`, `${other}/robots.txt`]);
  });
  it("follows an allowed redirect and reports the final address", async () => {
    const h = harness({ [`${SITE}/old`]: { status: 301, location: "/new" }, [`${SITE}/new`]: { status: 200, body: "moved" } });
    expect(await h.fetcher.get(`${SITE}/old`)).toMatchObject({ ok: true, url: `${SITE}/new`, text: "moved" });
  });
  it("failures come back as fixed phrases only, never the transport's own message", async () => {
    const h = harness({ [`${SITE}/gone`]: { status: 404 }, [`${SITE}/slow`]: new Error(REASONS.timeout), [`${SITE}/odd`]: new Error("ECONNRESET at 10.0.0.1:443 for https://www.church.example.org/odd") });
    expect(await h.fetcher.get(`${SITE}/gone`)).toEqual({ ok: false, reason: "HTTP 404", status: 404 });
    expect(await h.fetcher.get(`${SITE}/slow`)).toEqual({ ok: false, reason: REASONS.timeout });
    expect(await h.fetcher.get(`${SITE}/odd`)).toEqual({ ok: false, reason: REASONS.connect });
  });
});
