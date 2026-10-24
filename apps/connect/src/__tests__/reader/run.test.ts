import { describe, it, expect } from "vitest";
import { createConnectClient, normaliseBaseUrl, redact } from "../../../scripts/reader/connect.mjs";
import { TIME_BUDGET_MS, parseArgs, plainText, runReader } from "../../../scripts/reader/run.mjs";
import { NOW_MS, fakeFetcher, fixture } from "./helpers";

const SUGGEST_KEY = "cck_live_TESTsuggestKEY0000000000000000";
const DIGEST_KEY = "cck_live_TESTdigestKEY00000000000000000";
const SRC_A = "aaaaaaaa-1111-4111-8111-111111111111";
const SRC_B = "bbbbbbbb-2222-4222-8222-222222222222";
const SRC_C = "cccccccc-3333-4333-8333-333333333333";
const CONTRIB_A = "a0000000-0000-4000-8000-00000000000a";
const CONTRIB_B = "b0000000-0000-4000-8000-00000000000b";
const SITE = "https://www.hope-fellowship.example/";
const SITE_B = "https://www.grace-chapel.example/";

const ENV = {
  AUTOMATION_SUGGEST_KEY: SUGGEST_KEY,
  AUTOMATION_DIGEST_KEY: DIGEST_KEY,
  CONNECT_BASE_URL: "https://connect.example",
};

type Call = { method: string; path: string; auth: string; body: Record<string, unknown> | null };

/** A stand-in for Citizens Connect's three routes. */
function fakeConnect(
  over: {
    sources?: unknown[];
    sourcesStatus?: number;
    postStatus?: (call: Call, n: number) => number;
    digest?: object;
    digestStatus?: number;
  } = {},
) {
  const calls: Call[] = [];
  let posts = 0;
  const impl = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const headers = init.headers as Record<string, string>;
    const call: Call = {
      method: String(init.method),
      path,
      auth: headers.Authorization,
      body: init.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (path === "/api/automation/sources") {
      if (over.sourcesStatus && over.sourcesStatus !== 200) return json({ error: "unauthorized" }, over.sourcesStatus);
      return json({ sources: over.sources ?? [], count: (over.sources ?? []).length });
    }
    if (path === "/api/automation/suggestions") {
      const status = over.postStatus?.(call, posts++) ?? 200;
      if (status !== 200) return json({ error: "boom" }, status);
      const items = (call.body?.items as unknown[]) ?? [];
      return json({ results: items.map((_, index) => ({ index, status: "pending", id: "x" })) });
    }
    if (path === "/api/automation/digest") {
      if (over.digestStatus && over.digestStatus !== 200) return json({ error: "nope" }, over.digestStatus);
      return json(over.digest ?? { considered: 2, sent: 1, failed: 0, skipped: {} });
    }
    return json({ error: "not found" }, 404);
  };
  return {
    impl: impl as unknown as typeof fetch,
    calls,
    byPath: (p: string) => calls.filter((c) => c.path === p),
  };
}

const source = (source_id: string, contributor_id: string, kind: string, url: string) => ({
  source_id,
  contributor_id,
  kind,
  url,
  last_status: null,
});

const pages = () =>
  fakeFetcher({
    [SITE]: { text: fixture("church-page.html") },
    "https://www.hope-fellowship.example/events.ics": { text: fixture("events.ics") },
    "https://www.hope-fellowship.example/feed/": { text: fixture("blog.rss.xml") },
    [SITE_B]: { text: "<html><body>nothing</body></html>" },
  });

async function run(
  argv: string[],
  connect: ReturnType<typeof fakeConnect>,
  over: { env?: Record<string, string>; fetcher?: object; clock?: () => number } = {},
) {
  const lines: string[] = [];
  const summaries: string[] = [];
  const result = await runReader({
    argv,
    env: over.env ?? ENV,
    deps: {
      connectFetch: connect.impl,
      fetcher: over.fetcher ?? pages(),
      nowMs: NOW_MS,
      log: (l: string) => lines.push(l),
      writeSummary: (_env: unknown, text: string) => summaries.push(text),
      ...(over.clock ? { clock: over.clock } : {}),
    },
  });
  return { ...result, lines, summaries, output: lines.join("\n") + "\n" + summaries.join("\n") };
}

describe("plainText", () => {
  it("lets through letters, digits, spaces and a little punctuation, and replaces everything else", () => {
    expect(plainText("3 events, 1 post (2 skipped); HTTP 404")).toBe("3 events, 1 post (2 skipped); HTTP 404");
    expect(plainText("a|b`c<d>e\nf\u0000g")).toBe("a?b?c?d?e?f?g");
  });
  it("cannot be used to smuggle a table cell, a link, a line break or HTML into the log or the Summary", () => {
    const hostile = "| x |\n[click](https://evil.example)<script>";
    const out = plainText(hostile);
    expect(out).not.toMatch(/[|\n<>[\]`]/);
    expect(out).toHaveLength(hostile.length);
    expect(plainText(undefined)).toBe("");
    expect(plainText("x".repeat(500), 10)).toHaveLength(10);
  });
});

describe("arguments", () => {
  it("is a dry run unless --live is given, and --dry-run always wins", () => {
    expect(parseArgs([])).toEqual({ live: false });
    expect(parseArgs(["--dry-run"])).toEqual({ live: false });
    expect(parseArgs(["--live"])).toEqual({ live: true });
    expect(parseArgs(["--live", "--dry-run"])).toEqual({ live: false });
    expect(parseArgs(["--help"])).toEqual({ help: true });
    expect(parseArgs(["--lve"])).toHaveProperty("error");
  });
});

describe("a dry run", () => {
  it("reads every due source and prints counts, but sends NOTHING: no post, no digest, and needs no digest key", async () => {
    const connect = fakeConnect({
      sources: [source(SRC_A, CONTRIB_A, "website", SITE), source(SRC_B, CONTRIB_B, "website", SITE_B)],
    });
    const r = await run([], connect, {
      env: { AUTOMATION_SUGGEST_KEY: SUGGEST_KEY, CONNECT_BASE_URL: "https://connect.example" },
    });
    expect(r.exitCode).toBe(0);
    expect(connect.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /api/automation/sources"]);
    expect(r.output).toContain("dry run (nothing is sent)");
    expect(r.output).toContain("aaaaaaaa website");
    expect(r.output).toContain("7 events, 3 posts");
    expect(r.output).toContain("bbbbbbbb website");
    expect(r.output).toContain("no events found");
    expect(r.summary).toMatchObject({
      live: false,
      due: 2,
      read: 2,
      failed: 0,
      events: 7,
      posts: 3,
    });
  });

  it("never prints a page, an address, an id of a Contributor, or a key", async () => {
    const connect = fakeConnect({ sources: [source(SRC_A, CONTRIB_A, "website", SITE)] });
    const r = await run(["--dry-run"], connect);
    for (const secret of [SUGGEST_KEY, DIGEST_KEY, "hope-fellowship", "https://", CONTRIB_A, SRC_A, "Hope Hall", "Family Fun Day", "012 345"]) {
      expect(r.output, secret).not.toContain(secret);
    }
  });
});

describe("a live run", () => {
  it("posts each source's items with its status, then calls the digest once with the DIGEST key", async () => {
    const connect = fakeConnect({
      sources: [source(SRC_A, CONTRIB_A, "website", SITE), source(SRC_B, CONTRIB_B, "website", SITE_B)],
    });
    const r = await run(["--live"], connect);
    expect(r.exitCode).toBe(0);
    expect(connect.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/automation/sources",
      "POST /api/automation/suggestions",
      "POST /api/automation/suggestions",
      "POST /api/automation/digest",
    ]);
    const [list, postA, postB, digest] = connect.calls;
    expect(list!.auth).toBe(`Bearer ${SUGGEST_KEY}`);
    expect(postA!.auth).toBe(`Bearer ${SUGGEST_KEY}`);
    expect(digest!.auth).toBe(`Bearer ${DIGEST_KEY}`);
    expect(postA!.body).toMatchObject({
      source_id: SRC_A,
      contributor_id: CONTRIB_A,
      source_status: expect.stringContaining("7 events, 3 posts"),
    });
    expect((postA!.body!.items as unknown[]).length).toBe(10);
    // An empty result is still reported, so the dashboard shows "checked, found nothing".
    expect(postB!.body).toEqual({
      source_id: SRC_B,
      contributor_id: CONTRIB_B,
      source_status: "no events found",
      items: [],
    });
    expect(r.summary).toMatchObject({
      live: true,
      pending: 10,
      digest: { considered: 2, sent: 1, failed: 0 },
    });
    expect(r.output).toContain("Digest: 1 email(s) sent");
  });

  it("records a source that could not be read (so it is not retried for a day) and carries on with the rest", async () => {
    const connect = fakeConnect({
      sources: [source(SRC_C, CONTRIB_A, "website", "https://gone.example/"), source(SRC_B, CONTRIB_B, "website", SITE_B)],
    });
    const r = await run(["--live"], connect);
    const posts = connect.byPath("/api/automation/suggestions");
    expect(posts[0]!.body).toMatchObject({
      source_id: SRC_C,
      source_status: "HTTP 404",
      items: [],
    });
    expect(posts).toHaveLength(2);
    expect(r.exitCode).toBe(0);
  });

  it("is quiet and exits 0 when nobody has opted in (no sources at all)", async () => {
    const connect = fakeConnect({ sources: [] });
    const r = await run(["--live"], connect);
    expect(r.exitCode).toBe(0);
    expect(connect.byPath("/api/automation/suggestions")).toHaveLength(0);
    expect(r.lines.join("\n")).toContain("Sources due: 0");
    expect(r.lines.length).toBeLessThanOrEqual(5);
  });

  it("a single source whose post fails does not stop the run, but is counted as failed", async () => {
    const connect = fakeConnect({
      sources: [source(SRC_A, CONTRIB_A, "website", SITE), source(SRC_B, CONTRIB_B, "website", SITE_B)],
      postStatus: (_c, n) => (n === 0 ? 500 : 200),
    });
    const r = await run(["--live"], connect);
    expect(r.summary).toMatchObject({ failed: 1, read: 2 });
    expect(connect.byPath("/api/automation/suggestions")).toHaveLength(2);
    expect(connect.byPath("/api/automation/digest")).toHaveLength(1);
    expect(r.exitCode).toBe(0);
  });

  it("stops at once, and fails loudly, when Connect refuses the key (401 / 403)", async () => {
    for (const status of [401, 403]) {
      const connect = fakeConnect({
        sources: [source(SRC_A, CONTRIB_A, "website", SITE), source(SRC_B, CONTRIB_B, "website", SITE_B)],
        postStatus: () => status,
      });
      const r = await run(["--live"], connect);
      expect(r.exitCode, String(status)).toBe(1);
      expect(connect.byPath("/api/automation/suggestions")).toHaveLength(1);
      expect(connect.byPath("/api/automation/digest")).toHaveLength(0);
      expect(r.output).toContain("the key was refused");
      expect(r.output).not.toContain(SUGGEST_KEY);
    }
  });

  it("fails when the source list itself is refused or unreachable", async () => {
    const r = await run(["--live"], fakeConnect({ sourcesStatus: 401 }));
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("Listing sources: the key was refused (HTTP 401)");
    const down = await run(["--live"], {
      impl: (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch,
      calls: [],
      byPath: () => [],
    });
    expect(down.exitCode).toBe(1);
    expect(down.output).toContain("could not reach Citizens Connect");
  });

  it("exits 1 (so the workflow turns red) when the digest fails or sends nothing it should have", async () => {
    const bad = await run(["--live"], fakeConnect({ digestStatus: 500 }));
    expect(bad.exitCode).toBe(1);
    expect(bad.output).toContain("Digest failed");
    const failedMail = await run(["--live"], fakeConnect({ digest: { considered: 1, sent: 0, failed: 1, skipped: {} } }));
    expect(failedMail.exitCode).toBe(1);
  });

  it("stops reading when the time budget runs out and leaves the rest for tomorrow", async () => {
    let t = 0;
    const connect = fakeConnect({
      sources: [source(SRC_A, CONTRIB_A, "website", SITE), source(SRC_B, CONTRIB_B, "website", SITE_B)],
    });
    const r = await run(["--live"], connect, { clock: () => ((t += TIME_BUDGET_MS / 2 + 1), t) });
    expect(r.summary.skipped).toBeGreaterThan(0);
    expect(r.output).toContain("Time budget reached");
    expect(connect.byPath("/api/automation/digest")).toHaveLength(1);
  });

  it("one bad site never stops the run: a fetcher that throws is reported as a status", async () => {
    const exploding = {
      get: () => Promise.reject(new Error("boom")),
      robotsAllows: () => Promise.reject(new Error("boom")),
    };
    const connect = fakeConnect({
      sources: [source(SRC_A, CONTRIB_A, "website", SITE), source(SRC_B, CONTRIB_B, "youtube", "https://www.youtube.com/@x")],
    });
    const r = await run(["--live"], connect, { fetcher: exploding });
    expect(r.exitCode).toBe(0);
    expect(connect.byPath("/api/automation/suggestions").map((c) => (c.body as { source_status: string }).source_status)).toEqual([
      "could not be read",
      "could not be read",
    ]);
  });
});

describe("configuration", () => {
  it("refuses to start without the suggest key, and without the digest key for a live run, touching nothing", async () => {
    const connect = fakeConnect();
    expect((await run([], connect, { env: { CONNECT_BASE_URL: "https://connect.example" } })).exitCode).toBe(1);
    const live = await run(["--live"], connect, { env: { AUTOMATION_SUGGEST_KEY: SUGGEST_KEY } });
    expect(live.exitCode).toBe(1);
    expect(live.output).toContain("AUTOMATION_DIGEST_KEY is not set");
    expect(connect.calls).toEqual([]);
  });
  it("rejects an unknown option with exit code 2", async () => {
    expect((await run(["--yolo"], fakeConnect())).exitCode).toBe(2);
  });
  it("accepts https, or http only for this machine; rejects credentials and junk; defaults to the production address", () => {
    expect(normaliseBaseUrl("https://connect.example/")).toBe("https://connect.example");
    expect(normaliseBaseUrl("http://localhost:3100")).toBe("http://localhost:3100");
    expect(normaliseBaseUrl("")).toBe("https://www.citizenscentral.co.za");
    expect(normaliseBaseUrl(undefined)).toBe("https://www.citizenscentral.co.za");
    for (const bad of ["http://connect.example", "ftp://x.example", "https://u:p@connect.example", "not a url", "javascript:alert(1)"]) {
      expect(() => normaliseBaseUrl(bad), bad).toThrow();
    }
  });
  it("treats a redirect from Connect as an error that names the fix, never following it with the key", async () => {
    const calls: string[] = [];
    const client = createConnectClient({
      baseUrl: "https://connect.example",
      suggestKey: SUGGEST_KEY,
      digestKey: DIGEST_KEY,
      fetchImpl: (async (url: string) => (
        calls.push(url),
        new Response(null, {
          status: 308,
          headers: { location: "https://www.connect.example/api/automation/sources" },
        })
      )) as unknown as typeof fetch,
    });
    await expect(client.listSources()).rejects.toThrow(/redirect.*CONNECT_BASE_URL/);
    expect(calls).toHaveLength(1);
  });
  it("redacts key-shaped text and exact secrets from any message", () => {
    expect(redact(`oops ${SUGGEST_KEY} and cck_live_zzzzzzzz`, [SUGGEST_KEY])).toBe("oops cck_[redacted] and cck_[redacted]");
    expect(redact("the token is plainsecret99 ok", ["plainsecret99"])).toBe("the token is [redacted] ok");
    expect(redact("short", ["abc"])).toBe("short");
  });
});

describe("the Connect client", () => {
  it("drops source rows that are not exactly the documented shape", async () => {
    const connect = fakeConnect({
      sources: [
        source(SRC_A, CONTRIB_A, "website", SITE),
        { source_id: "not-a-uuid", contributor_id: CONTRIB_A, kind: "website", url: SITE },
        source(SRC_B, CONTRIB_B, "facebook", "https://www.facebook.com/x"),
        { source_id: SRC_C, contributor_id: CONTRIB_B, kind: "website", url: 42 },
        null,
      ],
    });
    const client = createConnectClient({
      baseUrl: "https://connect.example",
      suggestKey: SUGGEST_KEY,
      digestKey: DIGEST_KEY,
      fetchImpl: connect.impl,
    });
    expect((await client.listSources()).map((s: { source_id: string }) => s.source_id)).toEqual([SRC_A]);
  });
  it("posts at most 50 items per request", async () => {
    const connect = fakeConnect();
    const client = createConnectClient({
      baseUrl: "https://connect.example",
      suggestKey: SUGGEST_KEY,
      digestKey: DIGEST_KEY,
      fetchImpl: connect.impl,
    });
    const items = Array.from({ length: 120 }, (_, i) => ({
      kind: "news",
      source_url: SITE,
      payload: { title: `Post ${i}` },
    }));
    const tally = await client.postSuggestions({
      sourceId: SRC_A,
      contributorId: CONTRIB_A,
      status: "120 posts",
      items,
    });
    expect(connect.byPath("/api/automation/suggestions").map((c) => (c.body!.items as unknown[]).length)).toEqual([50, 50, 20]);
    expect(tally.pending).toBe(120);
  });
});
