import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A fixed "now" for every Reader test: 21 Oct 2026, 06:00 South African time. */
export const NOW_MS = Date.parse("2026-10-21T04:00:00Z");

export function fixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf8");
}

type Canned = { text: string; contentType?: string } | { reason: string };

/**
 * A stand-in for the polite fetcher (scripts/reader/net.mjs): answers from a map of address -> body,
 * "HTTP 404" for anything else, and remembers every address it was asked for.
 */
export function fakeFetcher(pages: Record<string, Canned>, opts: { blocked?: string[] } = {}) {
  const calls: string[] = [];
  const probes: string[] = [];
  return {
    calls,
    probes,
    async get(url: string) {
      calls.push(url);
      const hit = pages[url];
      if (!hit) return { ok: false as const, reason: "HTTP 404" };
      if ("reason" in hit) return { ok: false as const, reason: hit.reason };
      return {
        ok: true as const,
        url,
        status: 200,
        contentType: hit.contentType ?? "text/html",
        text: hit.text,
        truncated: false,
      };
    },
    async robotsAllows(url: string) {
      probes.push(url);
      return opts.blocked?.some((b) => url.includes(b)) ? { ok: false as const, reason: "blocked by robots.txt" } : { ok: true as const };
    },
  };
}
