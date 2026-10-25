import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Sunday 1 November 2026, 08:00 in South Africa. Every fixture is dated around it. */
export const NOW = Date.parse("2026-11-01T06:00:00Z");

export const fixture = (name: string) => readFileSync(join(process.cwd(), "src/__tests__/reader/fixtures", name), "utf8");

export type FetchResult = { ok: true; url: string; status: number; contentType: string; text: string; truncated: boolean } | { ok: false; reason: string; status?: number };

/** A fetcher that serves fixed documents by exact URL and records every request. Anything else is HTTP 404. */
export function fakeFetcher(pages: Record<string, string | FetchResult>) {
  const requested: string[] = [];
  return {
    requested,
    get: async (url: string): Promise<FetchResult> => {
      requested.push(url);
      const page = pages[url];
      if (page === undefined) return { ok: false, reason: "HTTP 404", status: 404 };
      if (typeof page === "string") return { ok: true, url, status: 200, contentType: "text/html", text: page, truncated: false };
      return page;
    },
  };
}
