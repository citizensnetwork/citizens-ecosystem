import { describe, it, expect } from "vitest";
import { parseArgs, plainText, runReader } from "../../../scripts/reader/run.mjs";
import { BATCH, ConnectError, createConnectClient, normaliseBaseUrl, redact } from "../../../scripts/reader/connect.mjs";
import { NOW, fakeFetcher, fixture } from "./helpers";

const SUGGEST = "cck_live_SUGGESTsecret0000000000";
const DIGEST = "cck_live_DIGESTsecret00000000000";
const BASE = "https://connect.example.org";
const S1 = { source_id: "11111111-1111-4111-8111-111111111111", contributor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "website", url: "https://www.church.example.org/events/", last_status: null };
const S2 = { source_id: "22222222-2222-4222-8222-222222222222", contributor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "youtube", url: "https://www.youtube.com/@GraceExample", last_status: null };
const S3 = { source_id: "33333333-3333-4333-8333-333333333333", contributor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", kind: "calendar", url: "https://cal.example.org/down.ics", last_status: null };

type Call = { method: string; path: string; auth: string | null; body: unknown };
type Handler = (call: Call) => { status: number; body?: unknown; headers?: Record<string, string> };

function connectServer(handlers: Partial<Record<string, Handler>> = {}) {
  const calls: Call[] = [];
  const defaults: Record<string, Handler> = {
    "GET /api/automation/sources": () => ({ status: 200, body: { sources: [S1, S2, S3], count: 3 } }),
    "POST /api/automation/suggestions": (c) => {
      const items = (c.body as { items: unknown[] }).items;
      return { status: 200, body: { results: items.map((_, index) => ({ index, status: index === 0 ? "auto_published" : "pending" })), ...(items.length ? {} : { source_check: "recorded" }) } };
    },
    "POST /api/automation/digest": () => ({ status: 200, body: { considered: 2, sent: 1, failed: 0, skipped: {} } }),
  };
  const fetchImpl = (async (input: string, init: RequestInit) => {
    const url = new URL(input);
    expect(url.origin).toBe(BASE);
    expect(init.redirect).toBe("manual");
    const call: Call = { method: init.method ?? "GET", path: url.pathname, auth: (init.headers as Record<string, string>).Authorization ?? null, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    const r = (handlers[key] ?? defaults[key])?.(call) ?? { status: 404, body: { error: "not_found" } };
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const pages = {
  "https://www.church.example.org/events/": fixture("church-page.html"),
  "https://www.church.example.org/feed/": fixture("blog.rss.xml"),
  "https://www.church.example.org/events.ics": fixture("events.ics"),
};

async function run(argv: string[], { env = {}, handlers = {}, budgetMs }: { env?: Record<string, string>; handlers?: Partial<Record<string, Handler>>; budgetMs?: number } = {}) {
  const server = connectServer(handlers);
  const lines: string[] = [];
  const fetcher = fakeFetcher(pages);
  const sleeps: number[] = [];
  const result = await runReader({
    argv,
    env: { AUTOMATION_SUGGEST_KEY: SUGGEST, AUTOMATION_DIGEST_KEY: DIGEST, CONNECT_BASE_URL: BASE, ...env },
    deps: { log: (l: string) => lines.push(l), fetcher, connectFetch: server.fetchImpl, budgetMs, nowMs: () => NOW, sleep: async (ms: number) => void sleeps.push(ms) },
  });
  return { ...result, lines, out: lines.join("\n"), calls: server.calls, fetcher, sleeps };
}

/** Nothing in a public log may carry an address, a page's words, an organisation's name or a key. */
function expectPublicSafe(out: string) {
  expect(out).not.toContain("://");
  expect(out).not.toMatch(/example\.org|youtube\.com/i);
  expect(out).not.toContain("SUGGESTsecret");
  expect(out).not.toContain("DIGESTsecret");
  expect(out).not.toMatch(/Grace|Fellowship|Sunday|Worship|Food parcels/);
  for (const line of out.split("\n")) expect(line).toMatch(/^[\x20-\x7e]*$/);
}

describe("runReader: a dry run (the default)", () => {
  it("lists the due sources, reads them, prints counts, and sends nothing", async () => {
    const r = await run([]);
    expect(r.exitCode).toBe(0);
    expect(r.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /api/automation/sources"]);
    expect(r.calls[0].auth).toBe(`Bearer ${SUGGEST}`);
    expect(r.out).toContain("dry run, nothing is sent");
    expect(r.out).toContain("| 11111111 | website | 4 events and 3 posts found (2 without a start time; 1 could not be read exactly; 1 private left out) | dry run |");
    expect(r.out).toContain("| 22222222 | youtube | YouTube is not read yet | dry run |");
    expect(r.out).toContain("| 33333333 | calendar | HTTP 404 | dry run |");
    expect(r.summary).toMatchObject({ due: 3, read: 1, failed: 1, skipped: 1, events: 4, posts: 3 });
    expectPublicSafe(r.out);
  });
  it("--dry-run says the same; it never needs the digest key", async () => {
    const r = await run(["--dry-run"], { env: { AUTOMATION_DIGEST_KEY: "" } });
    expect(r.exitCode).toBe(0);
    expect(r.calls.every((c) => c.method === "GET")).toBe(true);
  });
  it("with nothing set up it says so and exits 0 (a scheduled run before the secrets exist is not a failure)", async () => {
    const r = await run([], { env: { AUTOMATION_SUGGEST_KEY: "" } });
    expect(r.exitCode).toBe(0);
    expect(r.calls).toEqual([]);
    expect(r.out).toContain("Not set up yet");
  });
  it("with nobody opted in it finds nothing and exits 0", async () => {
    const r = await run([], { handlers: { "GET /api/automation/sources": () => ({ status: 200, body: { sources: [], count: 0 } }) } });
    expect(r.exitCode).toBe(0);
    expect(r.out).toContain("Sources due: 0");
    expect(r.fetcher.requested).toEqual([]);
  });
});

describe("runReader: a live run", () => {
  it("posts each source's items with its status, then calls the digest once, each with its own key", async () => {
    const r = await run(["--live"]);
    expect(r.exitCode).toBe(0);
    const paths = r.calls.map((c) => `${c.method} ${c.path}`);
    expect(paths).toEqual(["GET /api/automation/sources", "POST /api/automation/suggestions", "POST /api/automation/suggestions", "POST /api/automation/suggestions", "POST /api/automation/digest"]);
    const posts = r.calls.filter((c) => c.path.endsWith("/suggestions"));
    expect(posts.every((c) => c.auth === `Bearer ${SUGGEST}`)).toBe(true);
    expect(r.calls.at(-1)!.auth).toBe(`Bearer ${DIGEST}`);
    expect(posts.map((c) => c.body)).toEqual([
      expect.objectContaining({ source_id: S1.source_id, contributor_id: S1.contributor_id, source_status: expect.stringMatching(/^4 events and 3 posts found/), items: expect.any(Array) }),
      { source_id: S2.source_id, contributor_id: S2.contributor_id, source_status: "YouTube is not read yet", items: [] },
      { source_id: S3.source_id, contributor_id: S3.contributor_id, source_status: "HTTP 404", items: [] },
    ]);
    expect((posts[0].body as { items: unknown[] }).items).toHaveLength(7);
    expect(r.out).toContain("| 11111111 | website | 4 events and 3 posts found");
    expect(r.out).toContain("6 pending, 1 published");
    expect(r.out).toContain("| 22222222 | youtube | YouTube is not read yet | check recorded |");
    expect(r.out).toContain("Digest: 1 email(s) sent, 0 failed, 2 listing(s) considered.");
    expectPublicSafe(r.out);
  });
  it("a live run without the digest key stops before reading anything", async () => {
    const r = await run(["--live"], { env: { AUTOMATION_DIGEST_KEY: "" } });
    expect(r.exitCode).toBe(1);
    expect(r.calls).toEqual([]);
  });
  it("a refused key stops the run at once: no posts, no digest, the key never printed", async () => {
    const r = await run(["--live"], { handlers: { "GET /api/automation/sources": () => ({ status: 401, body: { error: `bad key ${SUGGEST}` } }) } });
    expect(r.exitCode).toBe(1);
    expect(r.calls).toHaveLength(1);
    expect(r.out).toContain("the key was refused (HTTP 401)");
    expectPublicSafe(r.out);
    const mid = await run(["--live"], { handlers: { "POST /api/automation/suggestions": () => ({ status: 403, body: { error: "forbidden" } }) } });
    expect(mid.exitCode).toBe(1);
    expect(mid.calls.map((c) => c.path)).toEqual(["/api/automation/sources", "/api/automation/suggestions"]);
  });
  it("a server error on one post is reported, the others still go, the digest still runs, and the run is marked failed", async () => {
    let n = 0;
    const r = await run(["--live"], { handlers: { "POST /api/automation/suggestions": () => (++n === 1 ? { status: 500, body: { error: `store_failed ${DIGEST}` } } : { status: 200, body: { results: [] } }) } });
    expect(r.exitCode).toBe(1);
    expect(r.calls.filter((c) => c.path.endsWith("/suggestions"))).toHaveLength(3);
    expect(r.calls.at(-1)!.path).toBe("/api/automation/digest");
    expect(r.out).toContain("Posting suggestions: HTTP 500 (store_failed cck_?redacted?)");
    expectPublicSafe(r.out);
  });
  it("a digest that failed to send any email marks the run failed", async () => {
    const r = await run(["--live"], { handlers: { "POST /api/automation/digest": () => ({ status: 200, body: { considered: 1, sent: 0, failed: 1 } }) } });
    expect(r.exitCode).toBe(1);
  });
  it("a redirect from Connect is refused, so a key never follows it", async () => {
    const r = await run([], { handlers: { "GET /api/automation/sources": () => ({ status: 308, headers: { Location: "https://elsewhere.example.org/" } }) } });
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain("redirect");
  });
  it("a 429 is retried once after Retry-After (capped)", async () => {
    let n = 0;
    const r = await run([], { handlers: { "GET /api/automation/sources": () => (++n === 1 ? { status: 429, headers: { "Retry-After": "999" } } : { status: 200, body: { sources: [] } }) } });
    expect(r.exitCode).toBe(0);
    expect(r.sleeps).toEqual([60_000]);
  });
  it("stops reading when the time budget is spent; the rest stay due for the next run", async () => {
    const r = await run([], { budgetMs: -1 });
    expect(r.summary).toMatchObject({ notReached: 3, read: 0 });
    expect(r.out).toContain("Time budget reached: 3 source(s) left for the next run.");
  });
});

describe("the Connect client", () => {
  it("posts in batches of at most 50 and records an empty check once", async () => {
    const server = connectServer();
    const client = createConnectClient({ baseUrl: BASE, suggestKey: SUGGEST, fetchImpl: server.fetchImpl });
    const items = Array.from({ length: 120 }, (_, i) => ({ kind: "news", source_url: "https://a.example.org/", payload: { title: `t${i}` } }));
    const t = await client.postSuggestions({ sourceId: S1.source_id, contributorId: S1.contributor_id, status: "ok", items });
    expect(server.calls.map((c) => (c.body as { items: unknown[] }).items.length)).toEqual([BATCH, BATCH, 20]);
    expect(t.pending + t.auto_published).toBe(120);
    await client.postSuggestions({ sourceId: S1.source_id, contributorId: S1.contributor_id, status: "nothing", items: [] });
    expect((server.calls.at(-1)!.body as { items: unknown[] }).items).toEqual([]);
  });
  it("drops source rows that are not exactly the documented shape", async () => {
    const server = connectServer({
      "GET /api/automation/sources": () => ({ status: 200, body: { sources: [S1, { ...S1, source_id: "nope" }, { ...S1, kind: "facebook" }, { ...S1, url: "http://x.example.org/" }, null, "x"] } }),
    });
    const client = createConnectClient({ baseUrl: BASE, suggestKey: SUGGEST, fetchImpl: server.fetchImpl });
    expect(await client.listSources()).toEqual([S1]);
  });
  it("CONNECT_BASE_URL: https, or http only for localhost; never credentials", () => {
    expect(normaliseBaseUrl("")).toBe("https://www.citizenscentral.co.za");
    expect(normaliseBaseUrl("https://connect.example.org/some/path")).toBe(BASE);
    expect(normaliseBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    for (const bad of ["http://connect.example.org", "https://u:p@connect.example.org", "not a url", "file:///etc/passwd"]) expect(() => normaliseBaseUrl(bad), bad).toThrow(ConnectError);
  });
  it("redact hides key-shaped text and exact secrets", () => {
    expect(redact(`x ${SUGGEST} y cck_live_abc123 z`, [SUGGEST])).toBe("x cck_[redacted] y cck_[redacted] z");
    expect(redact("token=hunter2hunter2", ["hunter2hunter2"])).toBe("token=[redacted]");
  });
});

describe("arguments and printing", () => {
  it("dry run unless --live; unknown or conflicting flags are refused", () => {
    expect(parseArgs([])).toEqual({ live: false });
    expect(parseArgs(["--dry-run"])).toEqual({ live: false });
    expect(parseArgs(["--live"])).toEqual({ live: true });
    expect(parseArgs(["--live", "--dry-run"])).toHaveProperty("error");
    expect(parseArgs(["--lvie"])).toHaveProperty("error");
    expect(parseArgs(["-h"])).toEqual({ help: true });
  });
  it("plainText keeps only a fixed alphabet (no pipes, backticks, angle brackets, newlines or controls)", () => {
    expect(plainText("a|b`c<d>e\nf\u0007g\u202eh")).toBe("a?b?c?d?e?f?g?h");
    expect(plainText("x".repeat(500), 10)).toBe("x".repeat(10));
  });
  it("help and usage errors", async () => {
    expect((await run(["--help"])).exitCode).toBe(0);
    expect((await run(["--bogus"])).exitCode).toBe(2);
  });
});
